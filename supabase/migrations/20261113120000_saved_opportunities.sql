-- O10: a member saves opportunities to find them again. A member reads, adds and removes only their own saves,
-- and can save only a post they are allowed to see. The saved list keeps a post that later closes; a post that
-- is hidden, removed or otherwise out of sight stays on the list as "no longer available", with none of its
-- content.

create table public.saved_opportunities (
  member_id uuid not null default auth.uid() references public.members (id) on delete cascade,
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (member_id, opportunity_id)
);
alter table public.saved_opportunities enable row level security;
revoke all on public.saved_opportunities from anon, authenticated;
grant select (opportunity_id, saved_at), insert (opportunity_id), delete on public.saved_opportunities to authenticated;

create policy "base rule" on public.saved_opportunities as restrictive for all to authenticated
  using ((select access.is_member())) with check ((select access.is_member()));
create policy "your own" on public.saved_opportunities for select to authenticated
  using (member_id = (select auth.uid()));
create policy "save what you can see" on public.saved_opportunities for insert to authenticated
  with check (member_id = (select auth.uid()) and access.can_see_opportunity(opportunity_id));
create policy "remove your own" on public.saved_opportunities for delete to authenticated
  using (member_id = (select auth.uid()));

create function access.saved_opportunities()
returns table (id uuid, saved_at timestamptz, available boolean, open boolean, type text, title text, role text,
               employment_type text, remote boolean, region_en text, region_sw text, district_en text,
               district_sw text, sector_id uuid, sector_en text, sector_sw text, closing_at date, featured boolean,
               poster_id uuid, poster_name text, is_mine boolean, skills text[])
language sql stable security definer set search_path = '' as $$
  select s.opportunity_id, s.saved_at, v.available, v.available and c.status = 'published' and c.open_now,
         case when v.available then c.type end, case when v.available then c.title end,
         case when v.available then c.role end, case when v.available then c.employment_type end,
         case when v.available then c.remote end, case when v.available then c.region_en end,
         case when v.available then c.region_sw end, case when v.available then c.district_en end,
         case when v.available then c.district_sw end, case when v.available then c.sector_id end,
         case when v.available then c.sector_en end, case when v.available then c.sector_sw end,
         case when v.available then c.closing_at end, case when v.available then c.featured end,
         case when v.available then c.poster_id end, case when v.available then c.poster_name end,
         case when v.available then c.is_mine end, case when v.available then c.skills end
  from public.saved_opportunities s
  join private.opportunity_cards c on c.id = s.opportunity_id
  cross join lateral (
    select c.is_mine or (c.listable and c.status in ('published', 'closed', 'expired')) as available) v
  where (select access.is_member()) and s.member_id = (select auth.uid())
  order by s.saved_at desc;
$$;
revoke all on function access.saved_opportunities() from public, anon;
grant execute on function access.saved_opportunities() to authenticated;

create function public.saved_opportunities()
returns table (id uuid, saved_at timestamptz, available boolean, open boolean, type text, title text, role text,
               employment_type text, remote boolean, region_en text, region_sw text, district_en text,
               district_sw text, sector_id uuid, sector_en text, sector_sw text, closing_at date, featured boolean,
               poster_id uuid, poster_name text, is_mine boolean, skills text[])
language sql stable security invoker set search_path = '' as $$ select * from access.saved_opportunities(); $$;
revoke all on function public.saved_opportunities() from public, anon;
grant execute on function public.saved_opportunities() to authenticated;
