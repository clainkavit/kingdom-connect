-- The Opportunities list picks its page of 20 first, then scores only those rows for Scan's reasons. Scoring
-- every open post before the limit took 0.4 s at 2,000 posts; this takes 0.12 s (measured 18 Nov 2026).

create or replace function access.opportunity_list(kind text default null, region uuid default null,
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
  select p.id, p.type, p.title, p.role, p.employment_type, p.remote, p.region_en, p.region_sw, p.district_en,
         p.district_sw, p.sector_id, p.sector_en, p.sector_sw, p.closing_at, p.published_at, p.featured,
         case when (select access.is_member()) then p.poster_id end,
         p.poster_name, p.is_mine, p.skills, p.total, p.matched,
         left(btrim(regexp_replace(coalesce(p.description, ''), '\s+', ' ', 'g')), 180), p.mine,
         exists (select 1 from public.businesses b
                 where b.member_id = p.poster_id and b.status = 'approved' and b.level >= 2),
         x.reasons
  from (
    select c.*, m.total, m.matched, m.mine,
           row_number() over (
             order by case when coalesce(opportunity_list.best, false) then m.matched end desc nulls last,
                      case when coalesce(opportunity_list.best, false) and m.total > 0
                           then m.matched::numeric / m.total end desc nulls last,
                      c.featured desc, c.published_at desc, c.id) as ord
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
    order by ord
    limit 20 offset greatest(coalesce(opportunity_list.page, 0), 0) * 20
  ) p
  left join lateral (
    select o.reasons from private.opportunity_match(p.id, (select auth.uid())) o
    where (select access.is_member()) and not p.is_mine and o.listed) x on true
  order by p.ord;
$$;
