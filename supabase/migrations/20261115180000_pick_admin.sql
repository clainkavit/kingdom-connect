-- D07 (A18 Picks for posters): the people already asked for a request, with their answer, and a lookup by username
-- for Add a member. Staff only.

create function access.pick_people(request uuid)
returns table (pick_id uuid, member_id uuid, full_name text, headline text, why text, status text, rank int,
               answered_by timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select access.is_staff()) then raise exception 'not_allowed'; end if;
  return query
  select p.id, p.member_id, coalesce(pr.full_name, m.username::text), pr.headline, p.why, p.status, p.rank,
         p.answered_by
  from public.picks p
  join public.members m on m.id = p.member_id
  left join public.profiles pr on pr.member_id = p.member_id
  where p.request_id = pick_people.request
  order by p.rank;
end $$;

create function access.pick_member_by_username(username text)
returns table (member_id uuid, full_name text, headline text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select access.is_staff()) then raise exception 'not_allowed'; end if;
  return query
  select m.id, coalesce(pr.full_name, m.username::text), pr.headline
  from public.members m left join public.profiles pr on pr.member_id = m.id
  where m.username = lower(btrim(pick_member_by_username.username)) and m.status = 'approved';
end $$;

revoke all on function access.pick_people(uuid), access.pick_member_by_username(text) from public, anon;
grant execute on function access.pick_people(uuid), access.pick_member_by_username(text) to authenticated;

create function public.pick_people(request uuid)
returns table (pick_id uuid, member_id uuid, full_name text, headline text, why text, status text, rank int,
               answered_by timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from access.pick_people(request); $$;
create function public.pick_member_by_username(username text)
returns table (member_id uuid, full_name text, headline text)
language sql stable security invoker set search_path = '' as $$
  select * from access.pick_member_by_username(username);
$$;
revoke all on function public.pick_people(uuid), public.pick_member_by_username(text) from public, anon;
grant execute on function public.pick_people(uuid), public.pick_member_by_username(text) to authenticated;
