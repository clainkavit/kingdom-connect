revoke update (email, phone, address) on public.member_private from authenticated;

create function access.contact_details(member uuid) returns table (phone text, email text, address text)
language sql stable security definer set search_path = '' as $$
  select case when p.share_phone then p.phone end,
         case when p.share_email then p.email end,
         case when p.share_address then p.address end
  from public.member_private p
  join public.members m on m.id = p.member_id and m.status = 'approved'
  where p.member_id = member
    and member <> (select auth.uid())
    and (select access.is_member())
    and access.is_connected((select auth.uid()), member)
    and not access.is_blocked((select auth.uid()), member);
$$;
revoke all on function access.contact_details(uuid) from public, anon;
grant execute on function access.contact_details(uuid) to authenticated;

create function public.get_contact_details(member_id uuid) returns table (phone text, email text, address text)
language sql stable security invoker set search_path = '' as $$
  select c.phone, c.email, c.address from access.contact_details(member_id) c;
$$;
revoke all on function public.get_contact_details(uuid) from public, anon;
grant execute on function public.get_contact_details(uuid) to authenticated;
