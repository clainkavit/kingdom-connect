drop policy "owner, staff, or an approved business" on public.businesses;
create policy "owner, staff, or an approved business" on public.businesses for select to authenticated
  using (member_id = (select auth.uid())
         or (select access.is_staff())
         or (status = 'approved' and level >= 2
             and exists (select 1 from public.profiles p where p.member_id = businesses.member_id)));

create index businesses_listed on public.businesses (sector_id, level) where status = 'approved' and level >= 2;
create index businesses_name_trgm on public.businesses using gin (name extensions.gin_trgm_ops);

create function public.search_businesses(
  q text default null,
  sector uuid default null,
  level int default null,
  region uuid default null,
  page int default 0,
  page_size int default 20
) returns table (
  business_id uuid,
  member_id uuid,
  name text,
  description text,
  size text,
  level int,
  sector_en text,
  sector_sw text,
  owner_name text,
  region_en text,
  region_sw text,
  district_en text,
  district_sw text
)
language sql stable security invoker set search_path = '' as $$
  with params as (
    select nullif(lower(btrim(q)), '') as q,
           (now() at time zone 'Africa/Dar_es_Salaam')::date::text as today
  ),
  listed as (
    select b.*, p.full_name, p.region_id as owner_region, p.district_id as owner_district,
      case when params.q is null then 0
           when b.name ilike access.like_pattern(params.q) then 2
           else 1 end as rank,
      md5(b.id::text || params.today) as shuffle
    from public.businesses b
    join public.profiles p on p.member_id = b.member_id
    cross join params
    where b.status = 'approved'
      and b.level >= 2
      and not p.hidden_from_directory
      and b.member_id <> (select auth.uid())
      and (params.q is null
           or b.name ilike access.like_pattern(params.q)
           or b.description ilike access.like_pattern(params.q))
      and (sector is null or b.sector_id = sector)
      and (search_businesses.level is null or b.level = search_businesses.level)
      and (region is null or p.region_id = region)
  )
  select l.id, l.member_id, l.name, l.description, l.size, l.level,
         s.name_en, s.name_sw, l.full_name,
         r.name_en, r.name_sw, d.name_en, d.name_sw
  from listed l
  join public.sectors s on s.id = l.sector_id
  left join public.regions r on r.id = l.owner_region
  left join public.districts d on d.id = l.owner_district
  order by l.rank desc, l.shuffle
  limit least(greatest(page_size, 1), 50) + 1
  offset greatest(page, 0) * least(greatest(page_size, 1), 50);
$$;

revoke all on function public.search_businesses(text, uuid, int, uuid, int, int) from public, anon;
grant execute on function public.search_businesses(text, uuid, int, uuid, int, int) to authenticated;
