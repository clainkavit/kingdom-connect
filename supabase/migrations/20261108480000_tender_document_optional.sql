-- The tender document is optional (decided 10 Nov 2026): a tender can be sent and published without it. A document
-- that is given must still be the poster's own PDF in the tender-documents bucket.

create or replace function access.save_opportunity(
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
      when sent_back or approvals < 3 or private.has_upheld_post_report(me)
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
