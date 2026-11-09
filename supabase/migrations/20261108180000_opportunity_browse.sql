-- O02: members browse and filter opportunities (S16) and open one (S17). Only published posts are listed.
-- A closed or expired post can still be opened, read-only. Hidden, removed, draft and pending posts, posts with
-- an open report, and posts by someone who has blocked the viewer (or the other way round) are never shown.
-- The poster is named by their business when they have an approved one, else by their profile name; a poster
-- whose profile is hidden from the directory shows only a username unless the viewer is connected to them.

create view private.opportunity_cards as
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
               or (m.status = 'approved' and not access.is_blocked(o.poster_member_id, (select auth.uid()))))) as listable
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
       as visible) seen;
revoke all on private.opportunity_cards from public, anon, authenticated;

-- S16: the open posts, featured first and then newest. Filters: type, region and district (or remote only),
-- sector, employment type and how many days back it was posted. 20 a page.
create function access.opportunity_list(kind text default null, region uuid default null, district uuid default null,
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
  where (select access.is_member()) and c.status = 'published' and c.closing_at >= private.tanzania_today()
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

-- S17: one post. Published, closed and expired posts are open to every member (the last two read-only); a
-- poster also opens their own post in any state. Anything else returns no row.
create function access.opportunity_detail(opportunity uuid)
returns table (id uuid, type text, title text, role text, employment_type text, remote boolean, description text,
               status text, region_en text, region_sw text, district_en text, district_sw text, sector_id uuid,
               sector_en text, sector_sw text, closing_at date, published_at timestamptz, featured boolean,
               poster_id uuid, poster_name text, is_mine boolean, skills text[], read_only boolean)
language sql stable security definer set search_path = '' as $$
  select c.id, c.type, c.title, c.role, c.employment_type, c.remote, c.description, c.status, c.region_en,
         c.region_sw, c.district_en, c.district_sw, c.sector_id, c.sector_en, c.sector_sw, c.closing_at,
         c.published_at, c.featured, c.poster_id, c.poster_name, c.is_mine, c.skills,
         c.status <> 'published' or c.closing_at < private.tanzania_today()
  from private.opportunity_cards c
  where c.id = opportunity_detail.opportunity and (select access.is_member())
    and (c.is_mine or (c.listable and c.status in ('published', 'closed', 'expired')));
$$;

revoke all on function access.opportunity_list(text, uuid, uuid, boolean, uuid, text, int, int),
  access.opportunity_detail(uuid) from public, anon;
grant execute on function access.opportunity_list(text, uuid, uuid, boolean, uuid, text, int, int),
  access.opportunity_detail(uuid) to authenticated;

create function public.opportunity_list(kind text default null, region uuid default null, district uuid default null,
                                        remote_only boolean default false, sector uuid default null,
                                        employment text default null, posted_within int default null,
                                        page int default 0)
returns table (id uuid, type text, title text, role text, employment_type text, remote boolean, region_en text,
               region_sw text, district_en text, district_sw text, sector_id uuid, sector_en text, sector_sw text,
               closing_at date, published_at timestamptz, featured boolean, poster_id uuid, poster_name text,
               is_mine boolean, skills text[])
language sql stable security invoker set search_path = '' as $$
  select * from access.opportunity_list(kind, region, district, remote_only, sector, employment, posted_within, page);
$$;
create function public.opportunity_detail(opportunity uuid)
returns table (id uuid, type text, title text, role text, employment_type text, remote boolean, description text,
               status text, region_en text, region_sw text, district_en text, district_sw text, sector_id uuid,
               sector_en text, sector_sw text, closing_at date, published_at timestamptz, featured boolean,
               poster_id uuid, poster_name text, is_mine boolean, skills text[], read_only boolean)
language sql stable security invoker set search_path = '' as $$ select * from access.opportunity_detail(opportunity); $$;
revoke all on function public.opportunity_list(text, uuid, uuid, boolean, uuid, text, int, int),
  public.opportunity_detail(uuid) from public, anon;
grant execute on function public.opportunity_list(text, uuid, uuid, boolean, uuid, text, int, int),
  public.opportunity_detail(uuid) to authenticated;
