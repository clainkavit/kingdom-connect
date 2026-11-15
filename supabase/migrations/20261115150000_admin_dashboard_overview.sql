-- U06 (combined canvas, Admin-Dashboard): the staff dashboard adds registered businesses, open opportunities by
-- type, ideas in the pool and what waits in each queue, and greets the staff member by name. Staff only.

create function access.admin_dashboard_overview()
returns table (staff_name text, registered_businesses int, open_jobs int, open_partnerships int, open_tenders int,
               open_other int, published_ideas int, pending_business_l2 int, pending_business_l3 int,
               pending_investor int, moderation_opportunities int, moderation_tenders int, moderation_ideas int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select access.is_staff()) then
    raise exception 'not_allowed';
  end if;
  return query
  select (select s.full_name from public.staff s where s.id = auth.uid()),
         (select count(*)::int from public.businesses b where b.status = 'approved'),
         (select count(*)::int from public.opportunities o where o.status = 'published' and o.type = 'job'),
         (select count(*)::int from public.opportunities o where o.status = 'published' and o.type = 'partnership'),
         (select count(*)::int from public.opportunities o where o.status = 'published' and o.type = 'tender'),
         (select count(*)::int from public.opportunities o
          where o.status = 'published' and o.type not in ('job', 'partnership', 'tender')),
         (select count(*)::int from public.ideas i where i.status = 'published'),
         (select count(*)::int from public.verification_requests v where v.status = 'pending' and v.level = 2),
         (select count(*)::int from public.verification_requests v where v.status = 'pending' and v.level = 3),
         (select count(*)::int from public.investor_applications a where a.status = 'pending'),
         (select count(*)::int from public.opportunities o where o.status = 'pending_review' and o.type <> 'tender'),
         (select count(*)::int from public.opportunities o where o.status = 'pending_review' and o.type = 'tender'),
         (select count(*)::int from public.ideas i where i.status = 'pending_moderation');
end;
$$;
revoke all on function access.admin_dashboard_overview() from public, anon;
grant execute on function access.admin_dashboard_overview() to authenticated;

create function public.admin_dashboard_overview()
returns table (staff_name text, registered_businesses int, open_jobs int, open_partnerships int, open_tenders int,
               open_other int, published_ideas int, pending_business_l2 int, pending_business_l3 int,
               pending_investor int, moderation_opportunities int, moderation_tenders int, moderation_ideas int)
language sql stable security invoker set search_path = '' as $$
  select * from access.admin_dashboard_overview();
$$;
revoke all on function public.admin_dashboard_overview() from public, anon;
grant execute on function public.admin_dashboard_overview() to authenticated;
