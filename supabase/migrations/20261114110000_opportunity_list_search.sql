-- S16 layout (14 Nov 2026): the Opportunities list takes search words, and each row carries a short summary of
-- the description and the post's skills the member already has, so the row can tick them. Words match as in R23's
-- Search page: every word must appear in the title, role, description, poster, place or skills. No total is
-- returned: members see no platform-wide figures (PRD section 7, decided 22 Oct 2026).

drop function public.opportunity_list(text, uuid, uuid, boolean, uuid, text, int, int, boolean);
drop function access.opportunity_list(text, uuid, uuid, boolean, uuid, text, int, int, boolean);

create function access.opportunity_list(kind text default null, region uuid default null, district uuid default null,
                                        remote_only boolean default false, sector uuid default null,
                                        employment text default null, posted_within int default null,
                                        page int default 0, best boolean default false, q text default null)
returns table (id uuid, type text, title text, role text, employment_type text, remote boolean, region_en text,
               region_sw text, district_en text, district_sw text, sector_id uuid, sector_en text, sector_sw text,
               closing_at date, published_at timestamptz, featured boolean, poster_id uuid, poster_name text,
               is_mine boolean, skills text[], skills_total int, skills_matched int, summary text,
               skills_mine text[])
language sql stable security definer set search_path = '' as $$
  select c.id, c.type, c.title, c.role, c.employment_type, c.remote, c.region_en, c.region_sw, c.district_en,
         c.district_sw, c.sector_id, c.sector_en, c.sector_sw, c.closing_at, c.published_at, c.featured, c.poster_id,
         c.poster_name, c.is_mine, c.skills, m.total, m.matched,
         left(btrim(regexp_replace(coalesce(c.description, ''), '\s+', ' ', 'g')), 180), m.mine
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
               skills_mine text[])
language sql stable security invoker set search_path = '' as $$
  select * from access.opportunity_list(kind, region, district, remote_only, sector, employment, posted_within, page,
                                        best, q);
$$;
revoke all on function public.opportunity_list(text, uuid, uuid, boolean, uuid, text, int, int, boolean, text)
  from public, anon;
grant execute on function public.opportunity_list(text, uuid, uuid, boolean, uuid, text, int, int, boolean, text)
  to authenticated;
