-- O04: tenders. A tender is an opportunity of type tender with its own fields in tender_details: issuing
-- organisation (the poster's business, or the platform for an admin post), reference number, scope, eligibility,
-- the documents a bidder must hold, a closing time on the closing date, an optional estimated value and an optional
-- tender document (PDF). The poster ticks the no-fee declaration like any other post, so a tender that charges a
-- fee cannot be posted; the bid itself happens off the platform. Members read a tender's fields and open its
-- document only while the tender itself is open to them.

create table public.tender_details (
  opportunity_id uuid primary key references public.opportunities (id) on delete cascade,
  issuing_org text not null check (char_length(issuing_org) between 1 and 120),
  reference_no text not null check (char_length(reference_no) between 2 and 60),
  scope text not null check (char_length(scope) between 30 and 3000),
  eligibility text not null default '' check (char_length(eligibility) <= 2000),
  required_documents text[] not null default '{}' check (cardinality(required_documents) <= 10),
  closing_time time not null default '17:00',
  estimated_value_tzs bigint check (estimated_value_tzs between 0 and 10000000000000),
  document_path text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.tender_details
  for each row execute function private.set_updated_at();
alter table public.tender_details enable row level security;
revoke all on public.tender_details from anon, authenticated;
create policy "base rule" on public.tender_details as restrictive for all to authenticated
  using ((select access.is_member()) or (select access.is_staff()))
  with check ((select access.is_member()) or (select access.is_staff()));

-- Whether the caller may see a post: staff, its poster, or a member while it is published, closed or expired and
-- not reported or blocked.
create function access.can_see_opportunity(post uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select access.is_staff())
      or exists (select 1 from private.opportunity_cards c
                 where c.id = post and (select access.is_member())
                   and (c.is_mine or (c.listable and c.status in ('published', 'closed', 'expired'))));
$$;
revoke all on function access.can_see_opportunity(uuid) from public, anon;
grant execute on function access.can_see_opportunity(uuid) to authenticated;

grant select (opportunity_id, issuing_org, reference_no, scope, eligibility, required_documents, closing_time,
              estimated_value_tzs, document_path, created_at) on public.tender_details to authenticated;
create policy "same as the opportunity" on public.tender_details for select to authenticated
  using (access.can_see_opportunity(opportunity_id));

-- Tender documents: PDF up to 10 MB at <poster id>/<file id>.pdf. The poster uploads and may remove an unused
-- file; members read one only through a tender they can see.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tender-documents', 'tender-documents', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create function access.tender_document_readable(path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select access.is_staff())
      or split_part(path, '/', 1) = auth.uid()::text
      or exists (select 1 from public.tender_details d
                 where d.document_path = path and access.can_see_opportunity(d.opportunity_id));
$$;
revoke all on function access.tender_document_readable(text) from public, anon;
grant execute on function access.tender_document_readable(text) to authenticated;

create policy "tender documents: a poster uploads into their own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'tender-documents' and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'
              and split_part(name, '/', 1) = auth.uid()::text
              and ((select access.is_staff()) or access.member_level(auth.uid()) >= 3));
create policy "tender documents: read through a visible tender" on storage.objects for select to authenticated
  using (bucket_id = 'tender-documents' and access.tender_document_readable(name));
create policy "tender documents: the poster removes an unused file" on storage.objects for delete to authenticated
  using (bucket_id = 'tender-documents' and split_part(name, '/', 1) = auth.uid()::text
         and not exists (select 1 from public.tender_details d where d.document_path = name));

-- S17: a tender's fields, for whoever can open the tender.
create function access.opportunity_tender(opportunity uuid)
returns table (issuing_org text, reference_no text, scope text, eligibility text, required_documents text[],
               closing_time time, estimated_value_tzs bigint, document_path text)
language sql stable security definer set search_path = '' as $$
  select d.issuing_org, d.reference_no, d.scope, d.eligibility, d.required_documents, d.closing_time,
         d.estimated_value_tzs, d.document_path
  from public.tender_details d
  where d.opportunity_id = opportunity_tender.opportunity and access.can_see_opportunity(d.opportunity_id);
$$;
revoke all on function access.opportunity_tender(uuid) from public, anon;
grant execute on function access.opportunity_tender(uuid) to authenticated;
create function public.opportunity_tender(opportunity uuid)
returns table (issuing_org text, reference_no text, scope text, eligibility text, required_documents text[],
               closing_time time, estimated_value_tzs bigint, document_path text)
language sql stable security invoker set search_path = '' as $$ select * from access.opportunity_tender(opportunity); $$;
revoke all on function public.opportunity_tender(uuid) from public, anon;
grant execute on function public.opportunity_tender(uuid) to authenticated;

-- save_opportunity takes the tender fields as a JSON object: reference_no, scope, eligibility, required_documents
-- (array), closing_time (HH:MM, Tanzania time), estimated_value_tzs and document_path.
drop function public.save_opportunity(uuid, text, text, text, text, uuid, uuid, boolean, uuid, text, date, text[], boolean, boolean);
drop function access.save_opportunity(uuid, text, text, text, text, uuid, uuid, boolean, uuid, text, date, text[], boolean, boolean);

create function access.save_opportunity(
  opportunity uuid, kind text, title text, role text, employment_type text, region uuid, district uuid,
  remote boolean, sector uuid, description text, closing_on date, skills text[], no_fee boolean, send boolean,
  tender jsonb default null
) returns table (result text, opportunity_id uuid)
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  staff_poster boolean := (select access.is_staff());
  today date := private.tanzania_today();
  clean_title text := btrim(coalesce(title, ''));
  clean_role text := nullif(btrim(coalesce(role, '')), '');
  clean_description text := btrim(coalesce(description, ''));
  is_remote boolean := coalesce(save_opportunity.remote, false);
  tags text[];
  tag text;
  skill uuid;
  approvals int;
  sent_back boolean := false;
  next_status text;
  saved uuid;
  tender_ref text;
  tender_scope text;
  tender_eligibility text;
  tender_docs text[];
  tender_time time;
  tender_value bigint;
  tender_path text;
  tender_org text;
begin
  if not staff_poster then
    if not (select access.is_member()) then
      raise exception 'not_allowed';
    end if;
    if access.member_level(me) < 3 then
      return query select 'level3_required', null::uuid; return;
    end if;
    if exists (select 1 from public.members m where m.id = me and m.posting_suspended_until > now()) then
      return query select 'posting_paused', null::uuid; return;
    end if;
  end if;
  if opportunity is not null and not exists (
       select 1 from public.opportunities o
       where o.id = opportunity and o.status = 'draft'
         and (o.poster_member_id = me or (staff_poster and o.poster_staff_id is not null))) then
    return query select 'not_editable', null::uuid; return;
  end if;

  if opportunity is not null then
    select o.reason_code is not null into sent_back from public.opportunities o where o.id = opportunity;
  end if;
  if kind is null or kind not in ('job', 'partnership', 'collaboration', 'investment', 'tender') then
    return query select 'invalid_type', null::uuid; return;
  end if;
  if char_length(clean_title) not between 5 and 120 or char_length(clean_role) > 120 then
    return query select 'invalid_title', null::uuid; return;
  end if;
  if (kind = 'job') <> (employment_type is not null)
     or (employment_type is not null and employment_type not in ('full_time', 'part_time', 'contract', 'internship')) then
    return query select 'invalid_employment', null::uuid; return;
  end if;
  if not is_remote and (region is null or not exists (select 1 from public.regions r where r.id = region))
     or (district is not null and not exists (select 1 from public.districts d where d.id = district and d.region_id = region)) then
    return query select 'invalid_location', null::uuid; return;
  end if;
  if not exists (select 1 from public.sectors s where s.id = sector) then
    return query select 'invalid_sector', null::uuid; return;
  end if;
  if char_length(clean_description) < 100 then return query select 'too_short', null::uuid; return; end if;
  if char_length(clean_description) > 5000 then return query select 'too_long', null::uuid; return; end if;
  if closing_on is null or closing_on <= today or closing_on > today + 90 then
    return query select 'invalid_closing', null::uuid; return;
  end if;
  select coalesce(array_agg(distinct n), '{}') into tags
  from unnest(coalesce(skills, '{}')) raw, private.normalize_skill(raw) n where n <> '';
  if cardinality(tags) > 5 or exists (select 1 from unnest(tags) n where char_length(n) > 40) then
    return query select 'too_many_skills', null::uuid; return;
  end if;
  if cardinality(tags) = 0 and kind in ('job', 'collaboration') then
    return query select 'skills_required', null::uuid; return;
  end if;
  if private.holds_contact_details(jsonb_build_object('title', clean_title, 'role', coalesce(clean_role, ''),
                                                      'text', clean_description,
                                                      'skills', array_to_string(tags, ' '))) then
    return query select 'contact_details', null::uuid; return;
  end if;
  if kind = 'tender' then
    tender_ref := btrim(coalesce(tender ->> 'reference_no', ''));
    tender_scope := btrim(coalesce(tender ->> 'scope', ''));
    tender_eligibility := btrim(coalesce(tender ->> 'eligibility', ''));
    tender_path := nullif(btrim(coalesce(tender ->> 'document_path', '')), '');
    begin
      tender_time := coalesce(nullif(tender ->> 'closing_time', ''), '17:00')::time;
      tender_value := nullif(tender ->> 'estimated_value_tzs', '')::bigint;
      select coalesce(array_agg(btrim(x.d) order by x.n), '{}') into tender_docs
      from jsonb_array_elements_text(coalesce(tender -> 'required_documents', '[]'::jsonb)) with ordinality as x(d, n)
      where btrim(x.d) <> '';
    exception when others then
      return query select 'invalid_tender', null::uuid; return;
    end;
    if char_length(tender_ref) not between 2 and 60 or char_length(tender_scope) not between 30 and 3000
       or char_length(tender_eligibility) > 2000 or cardinality(tender_docs) > 10
       or exists (select 1 from unnest(tender_docs) d where char_length(d) > 120)
       or (tender_value is not null and tender_value not between 0 and 10000000000000) then
      return query select 'invalid_tender', null::uuid; return;
    end if;
    if private.holds_contact_details(jsonb_build_object('reference', tender_ref, 'scope', tender_scope,
         'eligibility', tender_eligibility, 'documents', array_to_string(tender_docs, ' '))) then
      return query select 'contact_details', null::uuid; return;
    end if;
    if tender_path is not null and (tender_path !~ ('^' || me::text || '/[0-9a-f-]{36}\.pdf$')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'tender-documents' and o.name = tender_path)) then
      return query select 'invalid_tender_file', null::uuid; return;
    end if;
    tender_org := case
      when staff_poster then (select s.value #>> '{}' from public.platform_settings s where s.key = 'platform_name')
      else coalesce((select b.name from public.businesses b where b.member_id = me and b.status = 'approved'),
                    (select m.username::text from public.members m where m.id = me)) end;
  end if;
  if not staff_poster and not coalesce(no_fee, false) then
    return query select 'no_fee_required', null::uuid; return;
  end if;

  if not coalesce(send, false) then
    next_status := 'draft';
  elsif staff_poster then
    next_status := 'published';
  else
    select count(*) into approvals from public.opportunities o
    where o.poster_member_id = me and o.approved_at is not null;
    next_status := case
      when sent_back or approvals < 3
           or private.holds_link(clean_title || ' ' || coalesce(clean_role, '') || ' ' || clean_description
                                 || ' ' || array_to_string(tags, ' '))
        then 'pending_review'
      else 'published' end;
  end if;

  if opportunity is null then
    insert into public.opportunities (poster_member_id, poster_staff_id, type, title, role, employment_type, region_id,
                                      district_id, remote, sector_id, description, closing_at, no_fee_declared, status,
                                      published_at)
    values (case when staff_poster then null else me end, case when staff_poster then me end, kind, clean_title,
            clean_role, employment_type, case when is_remote then null else region end,
            case when is_remote then null else district end, is_remote, sector,
            clean_description, closing_on, coalesce(no_fee, false) and not staff_poster, next_status,
            case when next_status = 'published' then now() end)
    returning id into saved;
  else
    update public.opportunities o
    set type = kind, title = clean_title, role = clean_role, employment_type = save_opportunity.employment_type,
        region_id = case when is_remote then null else region end,
        district_id = case when is_remote then null else district end,
        remote = is_remote, sector_id = sector, description = clean_description,
        closing_at = closing_on, no_fee_declared = coalesce(no_fee, false) and not staff_poster, status = next_status,
        published_at = case when next_status = 'published' then now() end
    where o.id = opportunity
    returning o.id into saved;
  end if;

  if kind = 'tender' then
    insert into public.tender_details (opportunity_id, issuing_org, reference_no, scope, eligibility, required_documents,
                                       closing_time, estimated_value_tzs, document_path)
    values (saved, tender_org, tender_ref, tender_scope, tender_eligibility, tender_docs, tender_time, tender_value,
            tender_path)
    on conflict on constraint tender_details_pkey do update
    set issuing_org = excluded.issuing_org, reference_no = excluded.reference_no, scope = excluded.scope,
        eligibility = excluded.eligibility, required_documents = excluded.required_documents,
        closing_time = excluded.closing_time, estimated_value_tzs = excluded.estimated_value_tzs,
        document_path = excluded.document_path;
  else
    delete from public.tender_details where tender_details.opportunity_id = saved;
  end if;

  delete from public.opportunity_skills os where os.opportunity_id = saved;
  foreach tag in array tags loop
    select y.skill_id into skill from public.skill_synonyms y where y.from_name = tag::extensions.citext;
    if skill is null then
      insert into public.skills (name) values (tag) on conflict (name) do nothing;
      select s.id into skill from public.skills s where s.name = tag::extensions.citext;
    end if;
    insert into public.opportunity_skills (opportunity_id, skill_id) values (saved, skill) on conflict do nothing;
    skill := null;
  end loop;

  if next_status <> 'draft' then
    insert into private.audit_log (actor_member_id, actor_staff_id, action, target_type, target_id, after, ip_address)
    values (case when staff_poster then null else me end, case when staff_poster then me end,
            'opportunity.sent', 'opportunities', saved, jsonb_build_object('status', next_status, 'type', kind),
            private.request_ip());
  end if;
  return query select 'ok', saved;
end;
$$;

revoke all on function access.save_opportunity(uuid, text, text, text, text, uuid, uuid, boolean, uuid, text, date, text[], boolean, boolean, jsonb) from public, anon;
grant execute on function access.save_opportunity(uuid, text, text, text, text, uuid, uuid, boolean, uuid, text, date, text[], boolean, boolean, jsonb) to authenticated;

create function public.save_opportunity(
  opportunity uuid, kind text, title text, role text, employment_type text, region uuid, district uuid,
  remote boolean, sector uuid, description text, closing_on date, skills text[], no_fee boolean, send boolean,
  tender jsonb default null
) returns table (result text, opportunity_id uuid)
language sql volatile security invoker set search_path = '' as $$
  select * from access.save_opportunity(opportunity, kind, title, role, employment_type, region, district, remote,
                                        sector, description, closing_on, skills, no_fee, send, tender);
$$;
revoke all on function public.save_opportunity(uuid, text, text, text, text, uuid, uuid, boolean, uuid, text, date, text[], boolean, boolean, jsonb) from public, anon;
grant execute on function public.save_opportunity(uuid, text, text, text, text, uuid, uuid, boolean, uuid, text, date, text[], boolean, boolean, jsonb) to authenticated;
