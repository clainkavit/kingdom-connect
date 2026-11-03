create function access.is_approved_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select access.otp_verified()
     and exists (select 1 from public.members m where m.id = auth.uid() and m.status = 'approved');
$$;

create function access.accepted_terms_and_privacy() returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from unnest(array['terms', 'privacy']) k
    where access.current_legal_text_id(k) is not null
      and not exists (select 1 from public.legal_acceptances a
                      where a.member_id = auth.uid() and a.legal_text_id = access.current_legal_text_id(k)));
$$;

create or replace function access.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select access.is_approved_member() and access.accepted_terms_and_privacy();
$$;

revoke all on function access.is_approved_member(), access.accepted_terms_and_privacy() from public, anon;
grant execute on function access.is_approved_member(), access.accepted_terms_and_privacy() to authenticated;

drop policy "base rule" on public.legal_acceptances;
create policy "base rule" on public.legal_acceptances as restrictive for all to authenticated
  using ((select access.is_approved_member()) or (select access.is_staff()))
  with check ((select access.is_approved_member()) or (select access.is_staff()));

create function access.my_language() returns text
language sql stable security definer set search_path = '' as $$
  select p.language from public.member_private p
  where p.member_id = auth.uid() and (select access.is_approved_member());
$$;

create function access.set_my_language(chosen text) returns void
language sql volatile security definer set search_path = '' as $$
  update public.member_private set language = chosen
  where member_id = auth.uid() and (select access.is_approved_member());
$$;

revoke all on function access.my_language(), access.set_my_language(text) from public, anon;
grant execute on function access.my_language(), access.set_my_language(text) to authenticated;

create function public.my_language() returns text
language sql stable security invoker set search_path = '' as $$
  select access.my_language();
$$;
create function public.set_my_language(chosen text) returns void
language sql volatile security invoker set search_path = '' as $$
  select access.set_my_language(chosen);
$$;
revoke all on function public.my_language(), public.set_my_language(text) from public, anon;
grant execute on function public.my_language(), public.set_my_language(text) to authenticated;
