-- S16 to the canvas (decided 18 Nov 2026): each row of the Opportunities list says whether the poster is a
-- Verified Business, and, when Scan for Opportunities would list the post for this member, the same two reasons
-- Scan gives. The Scan rules move into one function so the list and Scan cannot disagree.

-- One post scored for one member with the Scan rules (PRD section 10, matching settings 'scan'). No row when the
-- member has no profile.
create function private.opportunity_match(opportunity uuid, member uuid)
returns table (score int, reasons jsonb, listed boolean)
language sql stable security definer set search_path = '' as $$
  with me as (
    select p.member_id, p.region_id, p.district_id, lower(nullif(btrim(coalesce(p.profession, '')), '')) as profession,
           (nullif(btrim(coalesce(p.study_institution, '')), '') is not null
            and nullif(btrim(coalesce(p.study_course, '')), '') is not null) as has_study,
           b.sector_id as business_sector
    from public.profiles p
    left join public.businesses b on b.member_id = p.member_id and b.status = 'approved'
    where p.member_id = opportunity_match.member
  ),
  cfg as (select s.signal, s.points from public.matching_settings s where s.feature = 'scan'),
  post as (
    select o.id, o.type, o.employment_type, o.remote, o.region_id, o.district_id, o.sector_id,
           sec.name_en as sector_en, sec.name_sw as sector_sw
    from public.opportunities o
    left join public.sectors sec on sec.id = o.sector_id
    where o.id = opportunity_match.opportunity
  ),
  scored as (
    select m.skill_names,
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
    from post c
    cross join me
    cross join lateral (
      select coalesce(array_agg(sk.name::text order by sk.name), '{}') as skill_names, count(*)::int as skill_count
      from public.opportunity_skills os
      join public.profile_skills ps on ps.skill_id = os.skill_id and ps.member_id = me.member_id
      join public.skills sk on sk.id = os.skill_id
      where os.opportunity_id = c.id) m
  )
  select s.pts_skill + s.pts_sector + s.pts_location + s.pts_study,
         coalesce((select jsonb_agg(jsonb_build_object('code', r.code, 'points', r.pts, 'detail', r.detail) order by r.pts desc, r.ord)
                   from (select * from (values
                          (1, 'skills', s.pts_skill, jsonb_build_object('skills', to_jsonb(s.skill_names))),
                          (2, 'sector', s.pts_sector, '{}'::jsonb),
                          (3, 'location', s.pts_location, jsonb_build_object('kind', s.location_kind)),
                          (4, 'study', s.pts_study, '{}'::jsonb)) v (ord, code, pts, detail)
                         where v.pts > 0 order by v.pts desc, v.ord limit 2) r), '[]'::jsonb),
         s.pts_skill + s.pts_sector + s.pts_location + s.pts_study >= (select points from cfg where signal = 'minimum')
  from scored s;
$$;
revoke all on function private.opportunity_match(uuid, uuid) from public, anon, authenticated;

create or replace function access.scan_opportunities(max_rows int default 20)
returns table (id uuid, type text, title text, role text, employment_type text, remote boolean, region_en text,
               region_sw text, district_en text, district_sw text, sector_id uuid, sector_en text, sector_sw text,
               closing_at date, published_at timestamptz, featured boolean, poster_id uuid, poster_name text,
               skills text[], score int, reasons jsonb)
language sql stable security definer set search_path = '' as $$
  select c.id, c.type, c.title, c.role, c.employment_type, c.remote, c.region_en, c.region_sw, c.district_en,
         c.district_sw, c.sector_id, c.sector_en, c.sector_sw, c.closing_at, c.published_at, c.featured, c.poster_id,
         c.poster_name, c.skills, x.score, x.reasons
  from private.opportunity_cards c
  cross join lateral private.opportunity_match(c.id, (select auth.uid())) x
  where (select access.is_member()) and c.status = 'published' and c.open_now and c.listable and not c.is_mine
    and x.listed
    and not exists (select 1 from public.responses r where r.opportunity_id = c.id and r.member_id = (select auth.uid()))
  order by x.score desc, c.closing_at, c.id
  limit greatest(1, least(coalesce(max_rows, 20), 20));
$$;

drop function public.opportunity_list(text, uuid, uuid, boolean, uuid, text, int, int, boolean, text);
drop function access.opportunity_list(text, uuid, uuid, boolean, uuid, text, int, int, boolean, text);

create function access.opportunity_list(kind text default null, region uuid default null,
                                        district uuid default null, remote_only boolean default false,
                                        sector uuid default null, employment text default null,
                                        posted_within int default null, page int default 0,
                                        best boolean default false, q text default null)
returns table (id uuid, type text, title text, role text, employment_type text, remote boolean, region_en text,
               region_sw text, district_en text, district_sw text, sector_id uuid, sector_en text, sector_sw text,
               closing_at date, published_at timestamptz, featured boolean, poster_id uuid, poster_name text,
               is_mine boolean, skills text[], skills_total int, skills_matched int, summary text,
               skills_mine text[], poster_verified boolean, reasons jsonb)
language sql stable security definer set search_path = '' as $$
  select c.id, c.type, c.title, c.role, c.employment_type, c.remote, c.region_en, c.region_sw, c.district_en,
         c.district_sw, c.sector_id, c.sector_en, c.sector_sw, c.closing_at, c.published_at, c.featured,
         case when (select access.is_member()) then c.poster_id end,
         c.poster_name, c.is_mine, c.skills, m.total, m.matched,
         left(btrim(regexp_replace(coalesce(c.description, ''), '\s+', ' ', 'g')), 180), m.mine,
         exists (select 1 from public.businesses b
                 where b.member_id = c.poster_id and b.status = 'approved' and b.level >= 2),
         case when (select access.is_member()) and not c.is_mine and x.listed then x.reasons end
  from private.opportunity_cards c
  cross join lateral (
    select count(*)::int as total,
           count(*) filter (where mine.has)::int as matched,
           coalesce(array_agg(sk.name::text order by sk.name) filter (where mine.has), '{}') as mine
    from public.opportunity_skills os
    join public.skills sk on sk.id = os.skill_id
    cross join lateral (
      select exists (select 1 from public.profile_skills ps
                     where ps.member_id = (select auth.uid()) and ps.skill_id = os.skill_id) as has) mine
    where os.opportunity_id = c.id) m
  left join lateral private.opportunity_match(c.id, (select auth.uid())) x on true
  where (select access.can_read_listings()) and c.status = 'published' and c.open_now
    and c.listable
    and (opportunity_list.kind is null or c.type = opportunity_list.kind)
    and (not coalesce(opportunity_list.remote_only, false) or c.remote)
    and (opportunity_list.region is null or c.region_id = opportunity_list.region)
    and (opportunity_list.district is null or c.district_id = opportunity_list.district)
    and (opportunity_list.sector is null or c.sector_id = opportunity_list.sector)
    and (opportunity_list.employment is null or c.employment_type = opportunity_list.employment)
    and (opportunity_list.posted_within is null
         or c.published_at >= now() - make_interval(days => greatest(opportunity_list.posted_within, 0)))
    and (btrim(coalesce(opportunity_list.q, '')) = ''
         or private.has_all_words(concat_ws(' ', c.title, c.role, c.description, c.poster_name, c.region_en,
                                            c.region_sw, c.district_en, c.district_sw,
                                            array_to_string(c.skills, ' ')), opportunity_list.q))
  order by case when coalesce(opportunity_list.best, false) then m.matched end desc nulls last,
           case when coalesce(opportunity_list.best, false) and m.total > 0
                then m.matched::numeric / m.total end desc nulls last,
           c.featured desc, c.published_at desc, c.id
  limit 20 offset greatest(coalesce(opportunity_list.page, 0), 0) * 20;
$$;
revoke all on function access.opportunity_list(text, uuid, uuid, boolean, uuid, text, int, int, boolean, text)
  from public, anon;
grant execute on function access.opportunity_list(text, uuid, uuid, boolean, uuid, text, int, int, boolean, text)
  to authenticated;

create function public.opportunity_list(kind text default null, region uuid default null, district uuid default null,
                                        remote_only boolean default false, sector uuid default null,
                                        employment text default null, posted_within int default null,
                                        page int default 0, best boolean default false, q text default null)
returns table (id uuid, type text, title text, role text, employment_type text, remote boolean, region_en text,
               region_sw text, district_en text, district_sw text, sector_id uuid, sector_en text, sector_sw text,
               closing_at date, published_at timestamptz, featured boolean, poster_id uuid, poster_name text,
               is_mine boolean, skills text[], skills_total int, skills_matched int, summary text,
               skills_mine text[], poster_verified boolean, reasons jsonb)
language sql stable security invoker set search_path = '' as $$
  select * from access.opportunity_list(kind, region, district, remote_only, sector, employment, posted_within, page,
                                        best, q);
$$;
revoke all on function public.opportunity_list(text, uuid, uuid, boolean, uuid, text, int, int, boolean, text)
  from public, anon;
grant execute on function public.opportunity_list(text, uuid, uuid, boolean, uuid, text, int, int, boolean, text)
  to authenticated;
