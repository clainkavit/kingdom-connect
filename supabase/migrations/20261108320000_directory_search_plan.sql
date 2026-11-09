-- The directory search drives from the matches when a word is typed, instead of reading every profile first, so
-- a search that matches skills stays fast with many members.

drop function public.search_directory(text, text, text, uuid, uuid, uuid, boolean, int, int);
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
  photo_path text,
  relation text
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
  filtered as not materialized (
    select p.*, params.today, params.q
    from public.profiles p
    cross join params
    where not p.hidden_from_directory
      and p.member_id <> (select auth.uid())
      and (params.profession is null or p.profession ilike access.like_pattern(params.profession))
      and (not params.skill_given
           or exists (select 1 from public.profile_skills ps
                      where ps.member_id = p.member_id and ps.skill_id = params.skill_id))
      and (sector is null or p.category_details ->> 'sectorId' = sector::text)
      and (region is null or p.region_id = region)
      and (district is null or p.district_id = district)
      and (studying is null or (p.study_institution is not null) = studying)
  ),
  listed as (
    select f.*, m.rank, md5(f.member_id::text || f.today) as shuffle
    from filtered f join matches m on m.member_id = f.member_id
    where (select q from params) is not null
    union all
    select f.*, 0, md5(f.member_id::text || f.today)
    from filtered f
    where (select q from params) is null
  ),
  page_rows as (
    select l.* from listed l
    order by l.rank desc, l.shuffle
    limit least(greatest(page_size, 1), 50) + 1
    offset greatest(page, 0) * least(greatest(page_size, 1), 50)
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
         l.photo_path,
         access.connection_state(l.member_id)
  from page_rows l
  left join public.regions r on r.id = l.region_id
  left join public.districts d on d.id = l.district_id
  order by l.rank desc, l.shuffle;
$$;

revoke all on function public.search_directory(text, text, text, uuid, uuid, uuid, boolean, int, int) from public, anon;
grant execute on function public.search_directory(text, text, text, uuid, uuid, uuid, boolean, int, int) to authenticated;
