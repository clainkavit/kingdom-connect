-- O08: People you may know. Points are worked out when the page opens and never stored; the investor flag is
-- never read. Mutual connections come back as a count only, never as names. Left out: the member, people already
-- connected, with a pending request either way, blocked either way, with a profile hidden from the directory,
-- not approved (suspended, deactivated, rejected), or who declined the member or were declined by them in the
-- last 90 days. A member whose own profile has no skills, profession or study gets the newest verified members
-- in their region instead, until the profile has data.

insert into public.matching_settings (feature, signal, points) values
  ('people', 'mutual_each', 15), ('people', 'mutual_max', 5), ('people', 'skill_each', 10), ('people', 'skill_max', 3),
  ('people', 'location_district', 15), ('people', 'location_region', 8), ('people', 'profession', 10),
  ('people', 'study', 10), ('people', 'minimum', 20);

create or replace function access.set_matching_setting(feature text, signal text, points int) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  found_setting public.matching_settings;
begin
  if not (select access.is_super_admin()) then
    return 'not_super_admin';
  end if;
  select * into found_setting from public.matching_settings s
  where s.feature = set_matching_setting.feature and s.signal = set_matching_setting.signal for update;
  if not found then
    return 'not_found';
  end if;
  if points is null or points not between 0 and 100
     or (found_setting.signal in ('skill_max', 'mutual_max') and points not between 1 and 10) then
    return 'invalid_points';
  end if;
  update public.matching_settings set points = set_matching_setting.points where id = found_setting.id;
  return 'ok';
end;
$$;

-- S08: up to 20 suggestions, best first (ties to the most recently active), each with its top two reasons as
-- codes (mutual with a count, skills with the shared tags, location with its kind, profession, study).
create function access.people_you_may_know(max_rows int default 20)
returns table (member_id uuid, full_name text, photo_path text, headline text, profession text, region_en text,
               region_sw text, district_en text, district_sw text, score int, mutual_connections int, reasons jsonb)
language sql stable security definer set search_path = '' as $$
  with me as (
    select p.member_id, p.region_id, p.district_id, lower(nullif(btrim(coalesce(p.profession, '')), '')) as profession,
           lower(nullif(btrim(coalesce(p.study_institution, '')), '')) as institution,
           lower(nullif(btrim(coalesce(p.study_course, '')), '')) as course,
           exists (select 1 from public.profile_skills ps where ps.member_id = p.member_id) as has_skills
    from public.profiles p where p.member_id = auth.uid() and (select access.is_member())
  ),
  cfg as (select s.signal, s.points from public.matching_settings s where s.feature = 'people'),
  my_connections as (
    select case when c.member_a = auth.uid() then c.member_b else c.member_a end as other
    from public.connections c where auth.uid() in (c.member_a, c.member_b)
  ),
  candidates as (
    select p.member_id, p.full_name, p.photo_path, p.headline, p.profession, p.region_id, p.district_id,
           p.last_active_at, m.approved_at, reg.name_en as region_en, reg.name_sw as region_sw,
           dis.name_en as district_en, dis.name_sw as district_sw,
           lower(nullif(btrim(coalesce(p.profession, '')), '')) as profession_key,
           lower(nullif(btrim(coalesce(p.study_institution, '')), '')) as institution,
           lower(nullif(btrim(coalesce(p.study_course, '')), '')) as course
    from public.profiles p
    join public.members m on m.id = p.member_id
    left join public.regions reg on reg.id = p.region_id
    left join public.districts dis on dis.id = p.district_id
    where m.status = 'approved' and p.member_id <> auth.uid() and not p.hidden_from_directory
      and access.member_level(p.member_id) >= 1
      and not access.is_connected(p.member_id, auth.uid())
      and not access.is_blocked(p.member_id, auth.uid())
      and not exists (select 1 from public.connection_requests r
                      where ((r.requester_id = auth.uid() and r.receiver_id = p.member_id)
                          or (r.receiver_id = auth.uid() and r.requester_id = p.member_id))
                        and (r.status = 'sent'
                             or (r.status = 'declined' and r.responded_at > now() - interval '90 days')))
  ),
  scored as (
    select c.*, me.profession as my_profession,
           mu.mutual_count, sk.skill_names, sk.skill_count,
           least(mu.mutual_count, (select points from cfg where signal = 'mutual_max'))
             * (select points from cfg where signal = 'mutual_each') as pts_mutual,
           least(sk.skill_count, (select points from cfg where signal = 'skill_max'))
             * (select points from cfg where signal = 'skill_each') as pts_skills,
           greatest(
             case when c.district_id is not null and c.district_id = me.district_id
                  then (select points from cfg where signal = 'location_district') else 0 end,
             case when c.region_id is not null and c.region_id = me.region_id
                  then (select points from cfg where signal = 'location_region') else 0 end) as pts_location,
           case when c.profession_key is not null and c.profession_key = me.profession
                then (select points from cfg where signal = 'profession') else 0 end as pts_profession,
           case when (c.institution is not null and c.institution = me.institution)
                  or (c.course is not null and c.course = me.course)
                then (select points from cfg where signal = 'study') else 0 end as pts_study,
           case when c.district_id is not null and c.district_id = me.district_id then 'district'
                when c.region_id is not null and c.region_id = me.region_id then 'region' end as location_kind,
           me.has_skills or me.profession is not null or me.institution is not null or me.course is not null as has_data
    from candidates c
    cross join me
    cross join lateral (
      select count(*)::int as mutual_count
      from public.connections cc
      join my_connections mc on mc.other = case when cc.member_a = c.member_id then cc.member_b else cc.member_a end
      where c.member_id in (cc.member_a, cc.member_b)) mu
    cross join lateral (
      select coalesce(array_agg(s.name::text order by s.name), '{}') as skill_names, count(*)::int as skill_count
      from public.profile_skills theirs
      join public.profile_skills mine on mine.skill_id = theirs.skill_id and mine.member_id = me.member_id
      join public.skills s on s.id = theirs.skill_id
      where theirs.member_id = c.member_id) sk
  ),
  ranked as (
    select s.*, s.pts_mutual + s.pts_skills + s.pts_location + s.pts_profession + s.pts_study as total
    from scored s
  )
  select r.member_id, r.full_name, r.photo_path, r.headline, r.profession, r.region_en, r.region_sw, r.district_en,
         r.district_sw, case when r.has_data then r.total else 0 end, r.mutual_count,
         case when r.has_data then
           coalesce((select jsonb_agg(jsonb_build_object('code', x.code, 'points', x.pts, 'detail', x.detail)
                                      order by x.pts desc, x.ord)
                     from (select * from (values
                             (1, 'mutual', r.pts_mutual, jsonb_build_object('count', r.mutual_count)),
                             (2, 'skills', r.pts_skills, jsonb_build_object('skills', to_jsonb(r.skill_names))),
                             (3, 'location', r.pts_location, jsonb_build_object('kind', r.location_kind)),
                             (4, 'profession', r.pts_profession, '{}'::jsonb),
                             (5, 'study', r.pts_study, '{}'::jsonb)) v (ord, code, pts, detail)
                           where v.pts > 0 order by v.pts desc, v.ord limit 2) x), '[]'::jsonb)
         else '[{"code": "newest_in_region", "points": 0, "detail": {}}]'::jsonb end
  from ranked r
  where (r.has_data and r.total >= (select points from cfg where signal = 'minimum'))
     or (not r.has_data and r.region_id is not null
         and r.region_id = (select me.region_id from me))
  order by (case when r.has_data then r.total else 0 end) desc,
           case when r.has_data then r.last_active_at else r.approved_at end desc nulls last, r.member_id
  limit greatest(1, least(coalesce(max_rows, 20), 20));
$$;

revoke all on function access.people_you_may_know(int) from public, anon;
grant execute on function access.people_you_may_know(int) to authenticated;
create function public.people_you_may_know(max_rows int default 20)
returns table (member_id uuid, full_name text, photo_path text, headline text, profession text, region_en text,
               region_sw text, district_en text, district_sw text, score int, mutual_connections int, reasons jsonb)
language sql stable security invoker set search_path = '' as $$ select * from access.people_you_may_know(max_rows); $$;
revoke all on function public.people_you_may_know(int) from public, anon;
grant execute on function public.people_you_may_know(int) to authenticated;
