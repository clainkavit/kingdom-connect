create extension if not exists pg_trgm with schema extensions;

create index profiles_full_name_trgm on public.profiles using gin (full_name extensions.gin_trgm_ops);
create index profiles_profession_trgm on public.profiles using gin (profession extensions.gin_trgm_ops);
create index skills_name_trgm on public.skills using gin ((name::text) extensions.gin_trgm_ops);
create index profile_skills_skill on public.profile_skills (skill_id);
create index profiles_listed on public.profiles (region_id, district_id) where not hidden_from_directory;

create function access.like_pattern(words text) returns text
language sql immutable set search_path = '' as $$
  select '%' || replace(replace(replace(words, '\', '\\'), '%', '\%'), '_', '\_') || '%';
$$;

create function access.directory_matches(q text) returns table (member_id uuid, rank int)
language sql stable security definer set search_path = '' as $$
  select hit.member_id, max(hit.rank)::int
  from (
    select p.member_id, 3 as rank from public.profiles p where p.full_name ilike access.like_pattern(q)
    union all
    select p.member_id, 2 from public.profiles p where p.profession ilike access.like_pattern(q)
    union all
    select ps.member_id, 1 from public.skills s join public.profile_skills ps on ps.skill_id = s.id
    where s.name::text ilike access.like_pattern(q)
    union all
    select ps.member_id, 1 from public.skill_synonyms y join public.profile_skills ps on ps.skill_id = y.skill_id
    where y.from_name::text ilike access.like_pattern(q)
  ) hit
  where q is not null
  group by hit.member_id;
$$;
revoke all on function access.directory_matches(text), access.like_pattern(text) from public, anon;
grant execute on function access.directory_matches(text), access.like_pattern(text) to authenticated;

create function public.search_directory(
  q text default null,
  profession text default null,
  skill text default null,
  sector uuid default null,
  region uuid default null,
  district uuid default null,
  studying boolean default null,
  page int default 0,
  page_size int default 20
) returns table (
  member_id uuid,
  full_name text,
  headline text,
  region_en text,
  region_sw text,
  district_en text,
  district_sw text,
  top_skills text[],
  verified_business boolean,
  photo_path text
)
language sql stable security invoker set search_path = '' as $$
  with params as (
    select nullif(lower(btrim(q)), '') as q,
           nullif(lower(btrim(profession)), '') as profession,
           (select coalesce(
              (select y.skill_id from public.skill_synonyms y
               where y.from_name = lower(btrim(skill))::extensions.citext),
              (select s.id from public.skills s where s.name = lower(btrim(skill))::extensions.citext)))
             as skill_id,
           nullif(btrim(coalesce(skill, '')), '') is not null as skill_given,
           (now() at time zone 'Africa/Dar_es_Salaam')::date::text as today
  ),
  matches as materialized (
    select dm.member_id, dm.rank from params, access.directory_matches(params.q) dm
  ),
  listed as (
    select p.*, coalesce(m.rank, 0) as rank,
      md5(p.member_id::text || params.today) as shuffle
    from public.profiles p
    cross join params
    left join matches m on m.member_id = p.member_id
    where (params.q is null or m.member_id is not null)
      and not p.hidden_from_directory
      and p.member_id <> (select auth.uid())
      and (params.profession is null or p.profession ilike access.like_pattern(params.profession))
      and (not params.skill_given
           or exists (select 1 from public.profile_skills ps
                      where ps.member_id = p.member_id and ps.skill_id = params.skill_id))
      and (sector is null or p.category_details ->> 'sectorId' = sector::text)
      and (region is null or p.region_id = region)
      and (district is null or p.district_id = district)
      and (studying is null or (p.study_institution is not null) = studying)
  )
  select l.member_id, l.full_name, l.headline,
         r.name_en, r.name_sw, d.name_en, d.name_sw,
         array(select s.name::text from public.profile_skills ps join public.skills s on s.id = ps.skill_id
               where ps.member_id = l.member_id
               order by (s.id = (select skill_id from params)) desc,
                        ((select q from params) is not null
                         and s.name::text ilike access.like_pattern((select q from params))) desc,
                        s.name
               limit 3),
         access.member_level(l.member_id) >= 2,
         l.photo_path
  from listed l
  left join public.regions r on r.id = l.region_id
  left join public.districts d on d.id = l.district_id
  order by l.rank desc, l.shuffle
  limit least(greatest(page_size, 1), 50) + 1
  offset greatest(page, 0) * least(greatest(page_size, 1), 50);
$$;

revoke all on function public.search_directory(text, text, text, uuid, uuid, uuid, boolean, int, int) from public, anon;
grant execute on function public.search_directory(text, text, text, uuid, uuid, uuid, boolean, int, int) to authenticated;
