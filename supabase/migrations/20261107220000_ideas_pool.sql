-- I02: the ideas pool. Summaries leave out ideas between members where either has blocked the other, and
-- tell the owner which ideas are their own. The details are never in this view.
create or replace view public.idea_summaries with (security_barrier = true) as
  select i.id, i.title, i.problem, i.sector_id, s.name_en as sector_en, s.name_sw as sector_sw, i.stage, i.seeking,
         i.investment_min_tzs, i.investment_max_tzs,
         case when i.show_owner then i.owner_id end as owner_id,
         case when i.show_owner then coalesce(p.full_name, m.username::text) end as owner_name,
         0 as interest_count, i.published_at,
         i.owner_id = (select auth.uid()) as is_mine
  from public.ideas i
  join public.sectors s on s.id = i.sector_id
  join public.members m on m.id = i.owner_id
  left join public.profiles p on p.member_id = i.owner_id
  where i.status = 'published' and m.status = 'approved'
    and ((select access.is_member()) or (select access.is_staff()))
    and not access.is_blocked(i.owner_id, (select auth.uid()));
