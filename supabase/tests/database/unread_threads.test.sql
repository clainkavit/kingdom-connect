begin;
create extension if not exists pgtap with schema extensions;
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(6);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000036' || k)::uuid, 'ut' || k || '@test.invalid'
from unnest(array['01', '02', '03']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000003601', 'ut_me', 'approved'),
  ('00000000-0000-0000-0000-000000003602', 'ut_friend', 'approved'),
  ('00000000-0000-0000-0000-000000003603', 'ut_other', 'approved');
insert into public.message_threads (id, member_a, member_b) values
  ('00000000-0000-0000-0036-000000000001', '00000000-0000-0000-0000-000000003601', '00000000-0000-0000-0000-000000003602'),
  ('00000000-0000-0000-0036-000000000002', '00000000-0000-0000-0000-000000003601', '00000000-0000-0000-0000-000000003603'),
  ('00000000-0000-0000-0036-000000000003', '00000000-0000-0000-0000-000000003602', '00000000-0000-0000-0000-000000003603');
insert into public.messages (thread_id, sender_id, body, created_at, deleted_at) values
  ('00000000-0000-0000-0036-000000000001', '00000000-0000-0000-0000-000000003602', 'hello', now() - interval '2 minutes', null),
  ('00000000-0000-0000-0036-000000000001', '00000000-0000-0000-0000-000000003602', 'are you there', now() - interval '1 minute', null),
  ('00000000-0000-0000-0036-000000000002', '00000000-0000-0000-0000-000000003601', 'my own message', now(), null),
  ('00000000-0000-0000-0036-000000000002', '00000000-0000-0000-0000-000000003603', 'taken back', now(), now()),
  ('00000000-0000-0000-0036-000000000003', '00000000-0000-0000-0000-000000003602', 'not my thread', now(), null);

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000036' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;

select is(public.unread_thread_count(), 0, 'nobody signed in counts nothing');

set local role authenticated;
select pg_temp.login('01');
select is(public.unread_thread_count(), 1,
  'one thread waits: two unread messages count once; own and deleted messages and others'' threads do not count');

insert into public.thread_reads (thread_id) values ('00000000-0000-0000-0036-000000000001');
select is(public.unread_thread_count(), 0, 'reading the thread clears it');

reset role;
insert into public.messages (thread_id, sender_id, body, created_at)
  values ('00000000-0000-0000-0036-000000000001', '00000000-0000-0000-0000-000000003602', 'one more', now() + interval '1 second');
set local role authenticated;
select pg_temp.login('01');
select is(public.unread_thread_count(), 1, 'a new message after reading counts again');

select pg_temp.login('03');
select is(public.unread_thread_count(), 2, 'another member counts their own threads: one from each sender');
select pg_temp.login('02');
select is(public.unread_thread_count(), 0, 'the sender has nothing unread');

select * from finish();
rollback;
