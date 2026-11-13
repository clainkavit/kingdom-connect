-- R24: how many of the caller's conversations hold a message they have not read, for the badge on Messages.
-- A thread counts by the same rule as my_threads(): a message from the other person, not deleted, after the
-- caller last read the thread.

create function access.unread_thread_count() returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from access.my_threads() t where t.unread;
$$;
revoke all on function access.unread_thread_count() from public, anon;
grant execute on function access.unread_thread_count() to authenticated;

create function public.unread_thread_count() returns int
language sql stable security invoker set search_path = '' as $$ select access.unread_thread_count(); $$;
revoke all on function public.unread_thread_count() from public, anon;
grant execute on function public.unread_thread_count() to authenticated;
