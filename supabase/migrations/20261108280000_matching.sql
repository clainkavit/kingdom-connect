-- O07: Scan for Opportunities. Points are worked out when the page opens, from the member's own tags and
-- profile, and are never stored. The investor flag is never read. Each result carries its top two reasons as
-- codes with the data to show them (the member's own matching tags, the kind of location match); the screen
-- words them. Weights live in matching_settings: anyone on staff reads them, only a Super Administrator
-- changes them, and every change is audit logged with before and after values.

create table public.matching_settings (
  id uuid primary key default gen_random_uuid(),
  feature text not null check (feature in ('scan', 'people')),
  signal text not null,
  points int not null check (points between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (feature, signal)
);
create trigger set_updated_at before update on public.matching_settings
  for each row execute function private.set_updated_at();
create trigger audit after insert or update or delete on public.matching_settings
  for each row execute function private.log_change();
alter table public.matching_settings enable row level security;
revoke all on public.matching_settings from anon, authenticated;
grant select (id, feature, signal, points, updated_at) on public.matching_settings to authenticated;
create policy "base rule" on public.matching_settings as restrictive for all to authenticated
  using ((select access.is_staff())) with check ((select access.is_super_admin()));
create policy "staff read" on public.matching_settings for select to authenticated
  using ((select access.is_staff()));

insert into public.matching_settings (feature, signal, points) values
  ('scan', 'skill_each', 20), ('scan', 'skill_max', 3), ('scan', 'sector', 15), ('scan', 'location_district', 15),
  ('scan', 'location_region', 8), ('scan', 'location_remote', 15), ('scan', 'study', 10), ('scan', 'minimum', 20);

-- A16: the weights, for staff.
create function access.matching_settings_list() returns table (feature text, signal text, points int)
language sql stable security definer set search_path = '' as $$
  select s.feature, s.signal, s.points from public.matching_settings s where (select access.is_staff())
  order by s.feature, s.signal;
$$;

-- A16: a Super Administrator changes one weight. skill_max is a count of 1 to 10, every other signal 0 to 100.
create function access.set_matching_setting(feature text, signal text, points int) returns text
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
  if points is null or points not between 0 and 100 or (found_setting.signal = 'skill_max' and points not between 1 and 10) then
    return 'invalid_points';
  end if;
  update public.matching_settings set points = set_matching_setting.points where id = found_setting.id;
  return 'ok';
end;
$$;

-- The profile fields Scan reads that are still empty: skills, location, profession. An empty list means the
-- profile has enough for matches.
create function access.scan_missing_fields() returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_remove(array[
      case when not exists (select 1 from public.profile_skills ps where ps.member_id = auth.uid()) then 'skills' end,
      case when p.region_id is null then 'location' end,
      case when nullif(btrim(coalesce(p.profession, '')), '') is null then 'profession' end], null), '{}')
  from public.profiles p where p.member_id = auth.uid() and (select access.is_member());
$$;

-- S16: the member's matches, best first (ties to the post closing soonest). Open published posts the member has
-- not posted or responded to, scoring at least the minimum.
create function access.scan_opportunities(max_rows int default 20)
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
    where c.status = 'published' and c.closing_at >= private.tanzania_today() and c.listable and not c.is_mine
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

revoke all on function access.matching_settings_list(), access.set_matching_setting(text, text, int),
  access.scan_missing_fields(), access.scan_opportunities(int) from public, anon;
grant execute on function access.matching_settings_list(), access.set_matching_setting(text, text, int),
  access.scan_missing_fields(), access.scan_opportunities(int) to authenticated;

create function public.matching_settings_list() returns table (feature text, signal text, points int)
language sql stable security invoker set search_path = '' as $$ select * from access.matching_settings_list(); $$;
create function public.set_matching_setting(feature text, signal text, points int) returns text
language sql volatile security invoker set search_path = '' as $$ select access.set_matching_setting(feature, signal, points); $$;
create function public.scan_missing_fields() returns text[]
language sql stable security invoker set search_path = '' as $$ select access.scan_missing_fields(); $$;
create function public.scan_opportunities(max_rows int default 20)
returns table (id uuid, type text, title text, role text, employment_type text, remote boolean, region_en text,
               region_sw text, district_en text, district_sw text, sector_id uuid, sector_en text, sector_sw text,
               closing_at date, published_at timestamptz, featured boolean, poster_id uuid, poster_name text,
               skills text[], score int, reasons jsonb)
language sql stable security invoker set search_path = '' as $$ select * from access.scan_opportunities(max_rows); $$;
revoke all on function public.matching_settings_list(), public.set_matching_setting(text, text, int),
  public.scan_missing_fields(), public.scan_opportunities(int) from public, anon;
grant execute on function public.matching_settings_list(), public.set_matching_setting(text, text, int),
  public.scan_missing_fields(), public.scan_opportunities(int) to authenticated;
