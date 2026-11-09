-- Review fixes for O02 to O08. A tender also closes at its closing time. A restored post closes its open reports,
-- a report on a hidden post is still recorded, and an upheld report counts for 12 months and until a pause is
-- lifted. The featured list matches the slot count. A responder cannot read a poster's hidden profile. The
-- one-response rule holds under a race. My responses leaves out hidden posts. Scan lists missing fields for a
-- member with no profile row.

create or replace view private.opportunity_cards as
  select o.id, o.type, o.title, o.role, o.employment_type, o.remote, o.description, o.status, o.closing_at,
         o.published_at, o.created_at, o.featured_at is not null as featured, o.sector_id, o.region_id, o.district_id,
         o.poster_member_id = (select auth.uid()) as is_mine,
         sec.name_en as sector_en, sec.name_sw as sector_sw,
         reg.name_en as region_en, reg.name_sw as region_sw, dis.name_en as district_en, dis.name_sw as district_sw,
         case when o.poster_member_id is null then null
              when seen.visible then o.poster_member_id end as poster_id,
         case when o.poster_member_id is null
                then (select s.value #>> '{}' from public.platform_settings s where s.key = 'platform_name')
              when seen.visible then coalesce(b.name, nullif(btrim(p.full_name), ''), m.username::text)
              else m.username::text end as poster_name,
         coalesce((select array_agg(sk.name::text order by sk.name)
                   from public.opportunity_skills os join public.skills sk on sk.id = os.skill_id
                   where os.opportunity_id = o.id), '{}') as skills,
         (not exists (select 1 from public.reports r
                      where r.target_type = 'opportunity' and r.target_id = o.id and r.status in ('open', 'under_review'))
          and (o.poster_member_id is null
               or (m.status = 'approved' and not access.is_blocked(o.poster_member_id, (select auth.uid()))))) as listable,
         (o.closing_at > private.tanzania_today()
          or (o.closing_at = private.tanzania_today()
              and (o.type <> 'tender'
                   or (now() at time zone 'Africa/Dar_es_Salaam')::time
                      <= coalesce((select td.closing_time from public.tender_details td where td.opportunity_id = o.id),
                                  time '23:59:59')))) as open_now
  from public.opportunities o
  join public.sectors sec on sec.id = o.sector_id
  left join public.regions reg on reg.id = o.region_id
  left join public.districts dis on dis.id = o.district_id
  left join public.members m on m.id = o.poster_member_id
  left join public.profiles p on p.member_id = o.poster_member_id
  left join public.businesses b on b.member_id = o.poster_member_id and b.status = 'approved'
  cross join lateral (
    select o.poster_member_id is not null
       and (not coalesce(p.hidden_from_directory, false) or access.is_connected(o.poster_member_id, (select auth.uid())))
       as visible) seen;;

create or replace function access.opportunity_list(kind text default null, region uuid default null, district uuid default null,
                                        remote_only boolean default false, sector uuid default null,
                                        employment text default null, posted_within int default null,
                                        page int default 0)
returns table (id uuid, type text, title text, role text, employment_type text, remote boolean, region_en text,
               region_sw text, district_en text, district_sw text, sector_id uuid, sector_en text, sector_sw text,
               closing_at date, published_at timestamptz, featured boolean, poster_id uuid, poster_name text,
               is_mine boolean, skills text[])
language sql stable security definer set search_path = '' as $$
  select c.id, c.type, c.title, c.role, c.employment_type, c.remote, c.region_en, c.region_sw, c.district_en,
         c.district_sw, c.sector_id, c.sector_en, c.sector_sw, c.closing_at, c.published_at, c.featured, c.poster_id,
         c.poster_name, c.is_mine, c.skills
  from private.opportunity_cards c
  where (select access.is_member()) and c.status = 'published' and c.open_now
    and c.listable
    and (opportunity_list.kind is null or c.type = opportunity_list.kind)
    and (not coalesce(opportunity_list.remote_only, false) or c.remote)
    and (opportunity_list.region is null or c.region_id = opportunity_list.region)
    and (opportunity_list.district is null or c.district_id = opportunity_list.district)
    and (opportunity_list.sector is null or c.sector_id = opportunity_list.sector)
    and (opportunity_list.employment is null or c.employment_type = opportunity_list.employment)
    and (opportunity_list.posted_within is null
         or c.published_at >= now() - make_interval(days => greatest(opportunity_list.posted_within, 0)))
  order by c.featured desc, c.published_at desc, c.id
  limit 20 offset greatest(coalesce(opportunity_list.page, 0), 0) * 20;
$$;

create or replace function access.opportunity_detail(opportunity uuid)
returns table (id uuid, type text, title text, role text, employment_type text, remote boolean, description text,
               status text, region_en text, region_sw text, district_en text, district_sw text, sector_id uuid,
               sector_en text, sector_sw text, closing_at date, published_at timestamptz, featured boolean,
               poster_id uuid, poster_name text, is_mine boolean, skills text[], read_only boolean)
language sql stable security definer set search_path = '' as $$
  select c.id, c.type, c.title, c.role, c.employment_type, c.remote, c.description, c.status, c.region_en,
         c.region_sw, c.district_en, c.district_sw, c.sector_id, c.sector_en, c.sector_sw, c.closing_at,
         c.published_at, c.featured, c.poster_id, c.poster_name, c.is_mine, c.skills,
         c.status <> 'published' or not c.open_now
  from private.opportunity_cards c
  where c.id = opportunity_detail.opportunity and (select access.is_member())
    and (c.is_mine or (c.listable and c.status in ('published', 'closed', 'expired')));
$$;

create or replace function access.scan_opportunities(max_rows int default 20)
returns table (id uuid, type text, title text, role text, employment_type text, remote boolean, region_en text,
               region_sw text, district_en text, district_sw text, sector_id uuid, sector_en text, sector_sw text,
               closing_at date, published_at timestamptz, featured boolean, poster_id uuid, poster_name text,
               skills text[], score int, reasons jsonb)
language sql stable security definer set search_path = '' as $$
  with me as (
    select p.member_id, p.region_id, p.district_id, lower(nullif(btrim(coalesce(p.profession, '')), '')) as profession,
           (nullif(btrim(coalesce(p.study_institution, '')), '') is not null
            and nullif(btrim(coalesce(p.study_course, '')), '') is not null) as has_study,
           b.sector_id as business_sector
    from public.profiles p
    left join public.businesses b on b.member_id = p.member_id and b.status = 'approved'
    where p.member_id = auth.uid() and (select access.is_member())
  ),
  cfg as (select s.signal, s.points from public.matching_settings s where s.feature = 'scan'),
  scored as (
    select c.*, m.skill_names, m.skill_count,
           least(m.skill_count, (select points from cfg where signal = 'skill_max'))
             * (select points from cfg where signal = 'skill_each') as pts_skill,
           case when c.sector_id = me.business_sector
                  or (me.profession is not null
                      and (lower(c.sector_en) = me.profession or lower(c.sector_sw) = me.profession))
                then (select points from cfg where signal = 'sector') else 0 end as pts_sector,
           greatest(
             case when c.district_id is not null and c.district_id = me.district_id
                  then (select points from cfg where signal = 'location_district') else 0 end,
             case when c.region_id is not null and c.region_id = me.region_id
                  then (select points from cfg where signal = 'location_region') else 0 end,
             case when c.remote then (select points from cfg where signal = 'location_remote') else 0 end) as pts_location,
           case when me.has_study and c.type = 'job' and c.employment_type = 'internship'
                then (select points from cfg where signal = 'study') else 0 end as pts_study,
           case when c.district_id is not null and c.district_id = me.district_id then 'district'
                when c.region_id is not null and c.region_id = me.region_id then 'region'
                when c.remote then 'remote' end as location_kind
    from private.opportunity_cards c
    cross join me
    cross join lateral (
      select coalesce(array_agg(sk.name::text order by sk.name), '{}') as skill_names, count(*)::int as skill_count
      from public.opportunity_skills os
      join public.profile_skills ps on ps.skill_id = os.skill_id and ps.member_id = me.member_id
      join public.skills sk on sk.id = os.skill_id
      where os.opportunity_id = c.id) m
    where c.status = 'published' and c.open_now and c.listable and not c.is_mine
      and not exists (select 1 from public.responses r where r.opportunity_id = c.id and r.member_id = me.member_id)
  )
  select s.id, s.type, s.title, s.role, s.employment_type, s.remote, s.region_en, s.region_sw, s.district_en,
         s.district_sw, s.sector_id, s.sector_en, s.sector_sw, s.closing_at, s.published_at, s.featured, s.poster_id,
         s.poster_name, s.skills,
         s.pts_skill + s.pts_sector + s.pts_location + s.pts_study as score,
         coalesce((select jsonb_agg(jsonb_build_object('code', r.code, 'points', r.pts, 'detail', r.detail) order by r.pts desc, r.ord)
                   from (select * from (values
                          (1, 'skills', s.pts_skill, jsonb_build_object('skills', to_jsonb(s.skill_names))),
                          (2, 'sector', s.pts_sector, '{}'::jsonb),
                          (3, 'location', s.pts_location, jsonb_build_object('kind', s.location_kind)),
                          (4, 'study', s.pts_study, '{}'::jsonb)) v (ord, code, pts, detail)
                         where v.pts > 0 order by v.pts desc, v.ord limit 2) r), '[]'::jsonb) as reasons
  from scored s
  where s.pts_skill + s.pts_sector + s.pts_location + s.pts_study >= (select points from cfg where signal = 'minimum')
  order by score desc, s.closing_at, s.id
  limit greatest(1, least(coalesce(max_rows, 20), 20));
$$;

create or replace function access.scan_missing_fields() returns text[]
language sql stable security definer set search_path = '' as $$
  select case when not (select access.is_member()) then null
              else coalesce((select array_remove(array[
      case when not exists (select 1 from public.profile_skills ps where ps.member_id = auth.uid()) then 'skills' end,
      case when p.region_id is null then 'location' end,
      case when nullif(btrim(coalesce(p.profession, '')), '') is null then 'profession' end], null)
    from public.profiles p where p.member_id = auth.uid()), array['skills', 'location', 'profession']) end;
$$;

create or replace function access.respond_to_opportunity(opportunity uuid, note text, attachment_path text)
returns table (result text, response_id uuid)
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  post private.opportunity_cards;
  poster uuid;
  clean_note text := btrim(coalesce(note, ''));
  stored_size bigint;
  saved uuid;
  response_kind text;
begin
  if not (select access.is_member()) then
    raise exception 'not_allowed';
  end if;
  select * into post from private.opportunity_cards c where c.id = opportunity;
  if not found or post.status <> 'published' or not post.open_now or not post.listable then
    return query select 'not_open'::text, null::uuid; return;
  end if;
  select o.poster_member_id into poster from public.opportunities o where o.id = opportunity;
  if poster = me then
    return query select 'own_post'::text, null::uuid; return;
  end if;
  if post.type = 'tender' and access.member_level(me) < 2 then
    return query select 'level2_required'::text, null::uuid; return;
  end if;
  if exists (select 1 from public.responses r where r.opportunity_id = opportunity and r.member_id = me) then
    return query select 'already_responded'::text, null::uuid; return;
  end if;
  if char_length(clean_note) > 2000 then
    return query select 'invalid_note'::text, null::uuid; return;
  end if;
  if private.holds_contact_details(jsonb_build_object('note', clean_note)) then
    return query select 'contact_details'::text, null::uuid; return;
  end if;
  if attachment_path is not null then
    select nullif(o.metadata ->> 'size', '')::bigint into stored_size
    from storage.objects o where o.bucket_id = 'response-files' and o.name = attachment_path;
    if attachment_path !~ ('^' || me::text || '/[0-9a-f-]{36}\.pdf$') or stored_size is null
       or stored_size not between 1 and 5242880 then
      return query select 'invalid_attachment'::text, null::uuid; return;
    end if;
  end if;
  response_kind := case when post.type = 'job' then 'application' else 'interest' end;
  begin
    insert into public.responses (opportunity_id, member_id, kind, note, attachment_path)
    values (opportunity, me, response_kind, clean_note, attachment_path) returning id into saved;
  exception when unique_violation then
    return query select 'already_responded'::text, null::uuid; return;
  end;
  if poster is not null then
    insert into public.message_threads (member_a, member_b, opportunity_id)
    values (least(me, poster), greatest(me, poster), opportunity)
    on conflict do nothing;
    perform private.notify(poster, case when response_kind = 'application' then 'O1' else 'O2' end,
      jsonb_build_object('name', private.viewer_name(me), 'title', post.title, 'opportunity_id', opportunity::text,
                         'response_id', saved::text));
  end if;
  return query select 'ok'::text, saved;
end;
$$;

create or replace function access.my_responses()
returns table (response_id uuid, opportunity_id uuid, kind text, status text, title text, type text,
               opportunity_status text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.opportunity_id, r.kind, r.status, o.title, o.type, o.status, r.created_at
  from public.responses r join public.opportunities o on o.id = r.opportunity_id
  where r.member_id = auth.uid() and (select access.is_member()) and o.status <> 'hidden'
  order by r.created_at desc;
$$;

-- Whether a member has an open response (New or Shortlisted) to a post the caller made. Only the poster reads
-- the responder's profile; a responder gains no sight of a hidden poster profile.
create function access.is_my_responder(responder uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.responses r join public.opportunities o on o.id = r.opportunity_id
                 where r.member_id = responder and r.status in ('new', 'shortlisted')
                   and o.poster_member_id = auth.uid());
$$;
revoke all on function access.is_my_responder(uuid) from public, anon;
grant execute on function access.is_my_responder(uuid) to authenticated;


drop policy "owner, staff, or visible to members" on public.profiles;
create policy "owner, staff, or visible to members" on public.profiles for select to authenticated
  using (
    member_id = (select auth.uid())
    or (select access.is_staff())
    or (
      (select access.is_member())
      and access.member_level(member_id) >= 1
      and not access.is_blocked(member_id, (select auth.uid()))
      and (not hidden_from_directory
           or access.is_connected(member_id, (select auth.uid()))
           or access.has_open_request(member_id, (select auth.uid()))
           or access.idea_partners(member_id, (select auth.uid()))
           or access.is_my_responder(member_id))
    )
  );

create or replace function access.admin_featured()
returns table (id uuid, title text, type text, poster_name text, closing_at date, featured_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select o.id, o.title, o.type, c.poster_name, o.closing_at, o.featured_at
  from public.opportunities o join private.opportunity_cards c on c.id = o.id
  where o.featured_at is not null and o.status = 'published'
    and o.closing_at >= private.tanzania_today() and (select access.is_staff())
  order by o.featured_at;
$$;

create or replace function private.has_upheld_post_report(member uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.reports r
                 where r.subject_id = member and r.target_type = 'opportunity' and r.status = 'action_taken'
                   and r.decided_at > now() - interval '12 months'
                   and r.decided_at > coalesce((select max(l.created_at) from public.moderation_actions l
                                                where l.subject_id = member
                                                  and l.action in ('lift_posting_pause', 'reinstate_account')),
                                               '-infinity'));
$$;

create or replace function access.report(target_type text, target_id uuid, reason text, note text, screenshot_path text)
returns table (reference_no text, already_reported boolean)
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  existing text;
  created text;
  subject uuid;
begin
  if not (select access.is_member()) then
    raise exception 'not_allowed';
  end if;
  perform pg_advisory_xact_lock(hashtext('report:' || me::text));
  select r.reference_no into existing from public.reports r
  where r.reporter_id = me and r.target_type = report.target_type and r.target_id = report.target_id
    and r.status in ('open', 'under_review');
  if existing is not null then
    return query select existing, true;
    return;
  end if;
  if (select count(*) from public.reports r
      where r.reporter_id = me
        and r.created_at >= ((now() at time zone 'Africa/Dar_es_Salaam')::date::timestamp
                             at time zone 'Africa/Dar_es_Salaam')) >= 10 then
    raise exception 'daily_limit';
  end if;
  if report.target_type = 'profile' then
    if report.target_id = me
       or not exists (select 1 from public.members m where m.id = report.target_id and m.status = 'approved') then
      raise exception 'not_available';
    end if;
    subject := report.target_id;
  elsif report.target_type = 'thread' then
    select case when t.member_a = me then t.member_b else t.member_a end into subject
    from public.message_threads t
    where t.id = report.target_id and me in (t.member_a, t.member_b);
    if subject is null then
      raise exception 'not_available';
    end if;
  elsif report.target_type = 'plan' then
    select case when p.member_a = me then p.member_b else p.member_a end into subject
    from public.milestone_plans p
    where p.id = report.target_id and me in (p.member_a, p.member_b);
    if subject is null then
      raise exception 'not_available';
    end if;
  elsif report.target_type = 'opportunity' then
    select o.poster_member_id into subject from public.opportunities o
    where o.id = report.target_id and o.status in ('published', 'closed', 'expired', 'hidden')
      and o.poster_member_id is not null and o.poster_member_id <> me;
    if subject is null then
      raise exception 'not_available';
    end if;
  else
    raise exception 'not_available';
  end if;
  insert into public.reports (reporter_id, target_type, target_id, subject_id, reason, note, screenshot_path)
  values (me, report.target_type, report.target_id, subject, report.reason, nullif(btrim(report.note), ''),
          report.screenshot_path)
  returning reports.reference_no into created;
  if report.target_type = 'opportunity' then
    update public.opportunities set status = 'hidden' where id = report.target_id and status = 'published';
  end if;
  if report.target_type = 'thread' then
    update public.message_threads set status = 'reported', reported_at = now()
    where id = report.target_id and status <> 'reported';
  end if;
  return query select created, false;
end;
$$;

create or replace function access.decide_report(report uuid, action text, note text, member_message text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  picked public.reports;
  closed uuid[];
  clean_note text := nullif(btrim(coalesce(decide_report.note, '')), '');
  message text := nullif(btrim(coalesce(decide_report.member_message, '')), '');
  upheld int;
  subject_member public.members;
  r record;
begin
  if not (select access.is_staff()) then
    raise exception 'not_allowed';
  end if;
  if decide_report.action not in ('no_action', 'warn', 'suspend_posting', 'suspend_account') then
    raise exception 'invalid_action';
  end if;
  if clean_note is null then
    raise exception 'note_required';
  end if;
  if decide_report.action <> 'no_action' and message is null then
    raise exception 'message_required';
  end if;
  select * into picked from public.reports where id = report;
  if not found then
    raise exception 'not_found';
  end if;
  if picked.status not in ('open', 'under_review') then
    raise exception 'already_decided';
  end if;
  perform pg_advisory_xact_lock(hashtext('moderate:' || picked.subject_id::text));
  select array_agg(x.id) into closed from (
    select rr.id from public.reports rr
    where rr.target_type = picked.target_type and rr.target_id = picked.target_id
      and rr.subject_id = picked.subject_id and rr.status in ('open', 'under_review')
    order by rr.created_at for update) x;
  if closed is null then
    raise exception 'already_decided';
  end if;

  update public.reports rr
  set status = case when decide_report.action = 'no_action' then 'no_action' else 'action_taken' end,
      decided_by = me, decided_at = now()
  where rr.id = any (closed);
  for r in select rr.reporter_id, rr.reference_no from public.reports rr where rr.id = any (closed) loop
    perform private.notify(r.reporter_id, case when decide_report.action = 'no_action' then 'R2' else 'R1' end,
                           jsonb_build_object('ref', r.reference_no));
  end loop;

  if picked.target_type = 'opportunity' then
    if decide_report.action = 'no_action' then
      update public.opportunities set status = 'published' where id = picked.target_id and status = 'hidden';
    else
      update public.opportunities set status = 'removed', closed_at = now()
      where id = picked.target_id and status in ('hidden', 'published');
    end if;
  end if;

  perform private.moderate(me, picked.subject_id, decide_report.action, clean_note,
                           case when decide_report.action <> 'no_action' then message end,
                           picked.target_type, picked.target_id, closed);
  if decide_report.action = 'no_action' then
    return;
  end if;

  upheld := access.upheld_decisions(picked.subject_id);
  select * into subject_member from public.members where id = picked.subject_id;
  if upheld >= 3 and subject_member.status = 'approved' then
    perform private.moderate(me, picked.subject_id, 'suspend_account',
                             'Automatic: ' || upheld || ' upheld decisions in 12 months', message, automatic => true);
  elsif upheld = 2 and subject_member.status = 'approved'
        and subject_member.posting_suspended_until is distinct from 'infinity' then
    perform private.moderate(me, picked.subject_id, 'suspend_posting',
                             'Automatic: 2 upheld decisions in 12 months', message, automatic => true);
  end if;
end;
$$;

create or replace function access.moderate_opportunity(opportunity uuid, action text, reason_code text, note text) returns text
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
  elsif action = 'restore' then
    if post.status <> 'hidden' then return 'already_decided'; end if;
    update public.opportunities set status = 'published', reviewed_by = auth.uid() where id = opportunity;
    update public.reports r set status = 'no_action', decided_by = auth.uid(), decided_at = now()
    where r.target_type = 'opportunity' and r.target_id = opportunity and r.status in ('open', 'under_review');
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
