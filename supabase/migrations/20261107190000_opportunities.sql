create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  poster_member_id uuid references public.members (id),
  poster_staff_id uuid references public.staff (id),
  type text not null check (type in ('job', 'partnership', 'collaboration', 'investment', 'tender')),
  title text not null check (char_length(btrim(title)) between 5 and 120),
  role text check (char_length(role) <= 120),
  employment_type text check (employment_type in ('full_time', 'part_time', 'contract', 'internship')),
  region_id uuid references public.regions (id),
  district_id uuid references public.districts (id),
  remote boolean not null default false,
  sector_id uuid not null references public.sectors (id),
  description text not null check (char_length(description) between 100 and 5000),
  closing_at date not null,
  no_fee_declared boolean not null default false,
  featured_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft', 'pending_review', 'published', 'closed', 'expired', 'hidden', 'removed')),
  reason_code text,
  reason_note text check (char_length(reason_note) <= 500),
  reason text,
  reviewed_by uuid references public.staff (id),
  approved_at timestamptz,
  published_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((poster_member_id is null) <> (poster_staff_id is null)),
  check ((type = 'job') = (employment_type is not null)),
  check (remote or region_id is not null)
);
create index opportunities_listed on public.opportunities (status, closing_at);
create index opportunities_member on public.opportunities (poster_member_id) where poster_member_id is not null;
create trigger set_updated_at before update on public.opportunities
  for each row execute function private.set_updated_at();
create trigger audit after update on public.opportunities
  for each row when (old.status is distinct from new.status) execute function private.log_change();

create table public.opportunity_skills (
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  skill_id uuid not null references public.skills (id),
  primary key (opportunity_id, skill_id)
);
create index opportunity_skills_skill on public.opportunity_skills (skill_id);

alter table public.opportunities enable row level security;
alter table public.opportunity_skills enable row level security;
revoke all on public.opportunities, public.opportunity_skills from anon, authenticated;
grant select on public.opportunities, public.opportunity_skills to authenticated;
create policy "base rule" on public.opportunities as restrictive for all to authenticated
  using ((select access.is_member()) or (select access.is_staff()))
  with check ((select access.is_member()) or (select access.is_staff()));
create policy "base rule" on public.opportunity_skills as restrictive for all to authenticated
  using ((select access.is_member()) or (select access.is_staff()))
  with check ((select access.is_member()) or (select access.is_staff()));
create policy "published, own, or staff" on public.opportunities for select to authenticated
  using (status = 'published' or poster_member_id = (select auth.uid()) or (select access.is_staff()));
create policy "same as the opportunity" on public.opportunity_skills for select to authenticated
  using (exists (select 1 from public.opportunities o where o.id = opportunity_id));

alter table public.rejection_reasons add column for_post boolean not null default false;
update public.rejection_reasons set for_post = true where code = 'other';
insert into public.rejection_reasons (code, label_en, label_sw, sort, needs_note, for_identity, for_business, for_poster, for_post) values
  ('post_unclear', 'The post is not clear enough', 'Tangazo halieleweki vya kutosha', 31, false, false, false, false, true),
  ('post_fee', 'The post asks applicants for money', 'Tangazo linawaomba waombaji pesa', 32, false, false, false, false, true),
  ('post_misleading', 'The post looks misleading or fake', 'Tangazo linaonekana la kupotosha au la uongo', 33, false, false, false, false, true),
  ('post_wrong_type', 'The post is in the wrong type', 'Tangazo liko kwenye aina isiyo sahihi', 34, false, false, false, false, true);

create or replace function private.merge_synonym() returns trigger
language plpgsql security definer set search_path = '' as $$
declare variant uuid;
begin
  if new.from_name = (select s.name from public.skills s where s.id = new.skill_id) then
    raise exception 'a skill cannot be a synonym of itself' using errcode = '22023';
  end if;
  select id into variant from public.skills where name = new.from_name;
  if variant is not null then
    insert into public.profile_skills (member_id, skill_id)
    select member_id, new.skill_id from public.profile_skills where skill_id = variant
    on conflict (member_id, skill_id) do nothing;
    insert into public.opportunity_skills (opportunity_id, skill_id)
    select opportunity_id, new.skill_id from public.opportunity_skills where skill_id = variant
    on conflict (opportunity_id, skill_id) do nothing;
    delete from public.opportunity_skills where skill_id = variant;
    update public.skill_synonyms set skill_id = new.skill_id where skill_id = variant;
    delete from public.skills where id = variant;
  end if;
  return new;
end $$;

create function private.holds_link(content text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(content, '') ~* '(https?://|www\.|\m[a-z0-9-]+\.(com|net|org|tz|co|io|info|biz|me|app)(/|\M))';
$$;

create function access.save_opportunity(
  opportunity uuid, kind text, title text, role text, employment_type text, region uuid, district uuid,
  remote boolean, sector uuid, description text, closing_on date, skills text[], no_fee boolean, send boolean
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
  next_status text;
  saved uuid;
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

  if kind is null or kind not in ('job', 'partnership', 'collaboration', 'investment') then
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
                                                      'text', clean_description)) then
    return query select 'contact_details', null::uuid; return;
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
      when approvals < 3 or private.holds_link(clean_title || ' ' || coalesce(clean_role, '') || ' ' || clean_description)
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

create function access.close_opportunity(opportunity uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  post public.opportunities;
begin
  select * into post from public.opportunities o where o.id = opportunity for update;
  if not found or not (post.poster_member_id = me or (select access.is_staff())) then
    return 'not_found';
  end if;
  if post.status <> 'published' then
    return 'not_open';
  end if;
  update public.opportunities set status = 'closed', closed_at = now() where id = opportunity;
  return 'ok';
end;
$$;

create function access.moderate_opportunity(opportunity uuid, action text, reason_code text, note text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  post public.opportunities;
  reason_row public.rejection_reasons;
  clean_note text := nullif(btrim(coalesce(note, '')), '');
  member_language text;
  reason_text text;
begin
  if not (select access.is_staff()) then
    raise exception 'not_allowed';
  end if;
  select * into post from public.opportunities o where o.id = opportunity for update;
  if not found then
    return 'not_found';
  end if;
  if action = 'approve' then
    if post.status <> 'pending_review' then return 'already_decided'; end if;
    update public.opportunities
    set status = 'published', approved_at = now(), published_at = now(), reviewed_by = auth.uid(),
        reason_code = null, reason_note = null, reason = null
    where id = opportunity;
    if post.poster_member_id is not null then
      perform private.notify(post.poster_member_id, 'O5', jsonb_build_object('title', post.title));
    end if;
  elsif action in ('reject', 'remove') then
    if action = 'reject' and post.status <> 'pending_review' then return 'already_decided'; end if;
    if action = 'remove' and post.status not in ('pending_review', 'published', 'hidden', 'closed') then
      return 'already_decided';
    end if;
    select * into reason_row from public.rejection_reasons rr
    where rr.code = moderate_opportunity.reason_code and rr.for_post;
    if not found or (reason_row.needs_note and clean_note is null) then
      return 'reason_required';
    end if;
    if clean_note is not null and private.holds_contact_details(jsonb_build_object('note', clean_note)) then
      return 'note_has_contact_details';
    end if;
    select coalesce(p.language, 'en') into member_language
    from public.member_private p where p.member_id = post.poster_member_id;
    reason_text := case when member_language = 'sw' then reason_row.label_sw else reason_row.label_en end;
    if clean_note is not null then reason_text := reason_text || '. ' || clean_note; end if;
    update public.opportunities
    set status = case when action = 'reject' then 'draft' else 'removed' end, reviewed_by = auth.uid(),
        reason_code = reason_row.code, reason_note = clean_note, reason = reason_text,
        closed_at = case when action = 'remove' then now() else closed_at end
    where id = opportunity;
    if post.poster_member_id is not null then
      perform private.notify(post.poster_member_id, case when action = 'reject' then 'O6' else 'O8' end,
                             jsonb_build_object('title', post.title, 'reason', reason_text));
    end if;
  else
    return 'invalid_action';
  end if;
  insert into private.audit_log (actor_staff_id, action, target_type, target_id, before, after, ip_address)
  values (auth.uid(), 'opportunity.' || action, 'opportunities', opportunity,
          jsonb_build_object('status', post.status),
          jsonb_build_object('reason_code', moderate_opportunity.reason_code, 'note', clean_note),
          private.request_ip());
  return 'ok';
end;
$$;

create function access.my_opportunities()
returns table (id uuid, type text, title text, status text, reason text, closing_at date, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select o.id, o.type, o.title, o.status, o.reason, o.closing_at, o.created_at
  from public.opportunities o
  where (o.poster_member_id = auth.uid() and (select access.is_member()))
     or (o.poster_staff_id is not null and (select access.is_staff()))
  order by o.created_at desc;
$$;

create function private.expire_opportunities() returns int
language plpgsql volatile security definer set search_path = '' as $$
declare expired int;
begin
  update public.opportunities set status = 'expired', closed_at = now()
  where status = 'published' and closing_at < private.tanzania_today();
  get diagnostics expired = row_count;
  return expired;
end;
$$;
revoke all on function private.expire_opportunities(), private.holds_link(text) from public, anon, authenticated;

revoke all on function
  access.save_opportunity(uuid, text, text, text, text, uuid, uuid, boolean, uuid, text, date, text[], boolean, boolean),
  access.close_opportunity(uuid), access.moderate_opportunity(uuid, text, text, text), access.my_opportunities()
  from public, anon;
grant execute on function
  access.save_opportunity(uuid, text, text, text, text, uuid, uuid, boolean, uuid, text, date, text[], boolean, boolean),
  access.close_opportunity(uuid), access.moderate_opportunity(uuid, text, text, text), access.my_opportunities()
  to authenticated;

create function public.save_opportunity(
  opportunity uuid, kind text, title text, role text, employment_type text, region uuid, district uuid,
  remote boolean, sector uuid, description text, closing_on date, skills text[], no_fee boolean, send boolean
) returns table (result text, opportunity_id uuid)
language sql volatile security invoker set search_path = '' as $$
  select * from access.save_opportunity(opportunity, kind, title, role, employment_type, region, district, remote,
                                        sector, description, closing_on, skills, no_fee, send);
$$;
create function public.close_opportunity(opportunity uuid) returns text
language sql volatile security invoker set search_path = '' as $$
  select access.close_opportunity(opportunity);
$$;
create function public.moderate_opportunity(opportunity uuid, action text, reason_code text default null,
                                            note text default null) returns text
language sql volatile security invoker set search_path = '' as $$
  select access.moderate_opportunity(opportunity, action, reason_code, note);
$$;
create function public.my_opportunities()
returns table (id uuid, type text, title text, status text, reason text, closing_at date, created_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select * from access.my_opportunities();
$$;
revoke all on function
  public.save_opportunity(uuid, text, text, text, text, uuid, uuid, boolean, uuid, text, date, text[], boolean, boolean),
  public.close_opportunity(uuid), public.moderate_opportunity(uuid, text, text, text), public.my_opportunities()
  from public, anon;
grant execute on function
  public.save_opportunity(uuid, text, text, text, text, uuid, uuid, boolean, uuid, text, date, text[], boolean, boolean),
  public.close_opportunity(uuid), public.moderate_opportunity(uuid, text, text, text), public.my_opportunities()
  to authenticated;

select cron.schedule('expire-opportunities', '10 21 * * *', $job$ select private.expire_opportunities() $job$);
