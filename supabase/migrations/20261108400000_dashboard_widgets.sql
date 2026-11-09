-- D01: the Release 2 widgets of the member dashboard (S08). "Latest opportunities and more" has tabs: All, Jobs,
-- Training, Tenders, Investments and Ideas. Featured opportunities show with their own list. Both are read-only
-- lists of what the member may already open: published, still open, not reported and not blocked. Neither carries
-- a count or any figure that belongs to the admin dashboard. An empty tab returns no rows, and the screen shows
-- its own empty state.

create function access.dashboard_latest(tab text default 'all', max_rows int default 6)
returns table (item_kind text, item_id uuid, title text, subtype text, sector_en text, sector_sw text,
               published_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select x.item_kind, x.item_id, x.title, x.subtype, x.sector_en, x.sector_sw, x.published_at
  from (
    select 'opportunity'::text as item_kind, c.id as item_id, c.title, c.type as subtype, c.sector_en, c.sector_sw,
           c.published_at
    from private.opportunity_cards c
    where c.status = 'published' and c.open_now and c.listable
      and (dashboard_latest.tab = 'all' or (dashboard_latest.tab = 'jobs' and c.type = 'job')
           or (dashboard_latest.tab = 'tenders' and c.type = 'tender')
           or (dashboard_latest.tab = 'investments' and c.type = 'investment'))
    union all
    select 'training', tr.id, tr.title, tr.format, null, null, tr.published_at
    from public.trainings tr
    where tr.status = 'published' and (tr.starts_at is null or tr.starts_at > now() - interval '3 hours')
      and dashboard_latest.tab in ('all', 'training')
    union all
    select 'idea', s.id, s.title, s.stage, s.sector_en, s.sector_sw, s.published_at
    from public.idea_summaries s
    where dashboard_latest.tab in ('all', 'ideas')
  ) x
  where (select access.is_member())
  order by x.published_at desc nulls last, x.item_id
  limit greatest(1, least(coalesce(max_rows, 6), 20));
$$;

create function access.featured_for_members()
returns table (id uuid, type text, title text, sector_en text, sector_sw text, poster_name text, closing_at date)
language sql stable security definer set search_path = '' as $$
  select c.id, c.type, c.title, c.sector_en, c.sector_sw, c.poster_name, c.closing_at
  from private.opportunity_cards c
  where c.featured and c.status = 'published' and c.open_now and c.listable and (select access.is_member())
  order by c.published_at desc
  limit 5;
$$;

revoke all on function access.dashboard_latest(text, int), access.featured_for_members() from public, anon;
grant execute on function access.dashboard_latest(text, int), access.featured_for_members() to authenticated;

create function public.dashboard_latest(tab text default 'all', max_rows int default 6)
returns table (item_kind text, item_id uuid, title text, subtype text, sector_en text, sector_sw text,
               published_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from access.dashboard_latest(tab, max_rows); $$;
create function public.featured_for_members()
returns table (id uuid, type text, title text, sector_en text, sector_sw text, poster_name text, closing_at date)
language sql stable security invoker set search_path = '' as $$ select * from access.featured_for_members(); $$;
revoke all on function public.dashboard_latest(text, int), public.featured_for_members() from public, anon;
grant execute on function public.dashboard_latest(text, int), public.featured_for_members() to authenticated;
