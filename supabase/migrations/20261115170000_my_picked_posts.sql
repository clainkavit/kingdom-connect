-- O16: which of the poster's own posts use Let Kingdom Connect pick, so My posts (S21) links to S50 instead of
-- responses.
create function access.my_picked_posts()
returns table (opportunity_id uuid, status text)
language sql stable security definer set search_path = '' as $$
  select r.opportunity_id, r.status
  from public.pick_requests r join public.opportunities o on o.id = r.opportunity_id
  where o.poster_member_id = auth.uid() and (select access.is_member());
$$;
revoke all on function access.my_picked_posts() from public, anon;
grant execute on function access.my_picked_posts() to authenticated;

create function public.my_picked_posts()
returns table (opportunity_id uuid, status text)
language sql stable security invoker set search_path = '' as $$ select * from access.my_picked_posts(); $$;
revoke all on function public.my_picked_posts() from public, anon;
grant execute on function public.my_picked_posts() to authenticated;
