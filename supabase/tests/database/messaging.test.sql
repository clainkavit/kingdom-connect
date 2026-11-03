begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000004' || k)::uuid, 'ms' || k || '@test.invalid'
from unnest(array['01', '02', '03', '04', '05', 'a1']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000000401', 'ms_writer', 'approved'),
  ('00000000-0000-0000-0000-000000000402', 'ms_reader', 'approved'),
  ('00000000-0000-0000-0000-000000000403', 'ms_stranger', 'approved'),
  ('00000000-0000-0000-0000-000000000404', 'ms_removed', 'approved'),
  ('00000000-0000-0000-0000-000000000405', 'ms_blocked', 'approved');
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000004a1', 'Messaging Admin', 'admin', true);
insert into public.profiles (member_id, full_name) values
  ('00000000-0000-0000-0000-000000000401', 'Writer Person'),
  ('00000000-0000-0000-0000-000000000402', 'Reader Person');
insert into public.connections (member_a, member_b) values
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000402'),
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000404'),
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000405');
insert into public.message_threads (id, member_a, member_b) values
  ('00000000-0000-0000-0002-000000000004', '00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000404'),
  ('00000000-0000-0000-0002-000000000005', '00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000405');
insert into public.profiles (member_id, full_name)
  values ('00000000-0000-0000-0000-000000000405', 'Blocked Person');
insert into public.messages (thread_id, sender_id, body)
  values ('00000000-0000-0000-0002-000000000005', '00000000-0000-0000-0000-000000000405', 'before the block');

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000004' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
create function pg_temp.notices(who text) returns int language sql security definer as $$
  select count(*)::int from public.notifications
  where member_id = ('00000000-0000-0000-0000-0000000004' || who)::uuid and kind = 'C3';
$$;
create function pg_temp.thread() returns uuid language sql security definer as $$
  select id from public.message_threads
  where member_a = '00000000-0000-0000-0000-000000000401' and member_b = '00000000-0000-0000-0000-000000000402';
$$;
create function pg_temp.first_message() returns uuid language sql security definer as $$
  select id from public.messages where thread_id = pg_temp.thread() order by created_at limit 1;
$$;
grant execute on function pg_temp.notices(text), pg_temp.thread(), pg_temp.first_message() to authenticated;

set local role authenticated;

select pg_temp.login('01');
select lives_ok($$insert into public.message_threads (member_a, member_b)
  values ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000402')$$,
  'a Member opens a thread with a connection');
select throws_ok($$insert into public.message_threads (member_a, member_b)
  values ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000402')$$, '23505', null,
  'one thread per pair');
select throws_ok($$insert into public.message_threads (member_a, member_b)
  values ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000403')$$, '42501', null,
  'no thread with someone who is not a connection');
select lives_ok($$insert into public.messages (thread_id, body) values (pg_temp.thread(), 'Hello from the writer')$$,
  'a connection sends a message');
select is(pg_temp.notices('02'), 1, 'the reader gets C3');
insert into public.messages (thread_id, body) values (pg_temp.thread(), 'A second message');
select is(pg_temp.notices('02'), 1, 'only one C3 per thread until it is read');
select throws_ok($$insert into public.messages (thread_id, sender_id, body)
  values (pg_temp.thread(), '00000000-0000-0000-0000-000000000402', 'pretend')$$, '42501', null,
  'a Member cannot send as someone else');
select throws_ok($$insert into public.messages (thread_id, body) values (pg_temp.thread(), repeat('x', 4001))$$,
  '23514', null, 'a message is at most 4000 characters');
select is((select unread from public.my_threads() where thread_id = pg_temp.thread()), false,
  'your own messages are not unread for you');

select lives_ok($$insert into public.message_attachments (message_id, storage_path, file_name, mime, size)
  values (pg_temp.first_message(), pg_temp.thread() || '/' || pg_temp.first_message() || '/cv.pdf', 'cv.pdf',
          'application/pdf', 1000)$$, 'the sender attaches a PDF');
select throws_ok($$insert into public.message_attachments (message_id, storage_path, file_name, mime, size)
  values (pg_temp.first_message(), pg_temp.thread() || '/' || pg_temp.first_message() || '/a.txt', 'a.txt',
          'text/plain', 1000)$$, '23514', null, 'only PDF and images');
select throws_ok($$insert into public.message_attachments (message_id, storage_path, file_name, mime, size)
  values (pg_temp.first_message(), pg_temp.thread() || '/' || pg_temp.first_message() || '/big.pdf', 'big.pdf',
          'application/pdf', 10485761)$$, '23514', null, 'up to 10 MB');
select lives_ok($$insert into storage.objects (bucket_id, name)
  values ('message-files', pg_temp.thread() || '/' || pg_temp.first_message() || '/cv.pdf')$$,
  'the sender uploads the file');

select pg_temp.login('02');
select is((select count(*)::int from public.messages), 2, 'the other member reads the thread');
select is((select count(*)::int from storage.objects where bucket_id = 'message-files'), 1,
  'and can open the attachment');
select is((select unread from public.my_threads() where thread_id = pg_temp.thread()), true, 'it shows as unread');
insert into public.thread_reads (thread_id) values (pg_temp.thread())
  on conflict (thread_id, member_id) do update set last_read_at = now();
select is((select unread from public.my_threads() where thread_id = pg_temp.thread()), false,
  'opening the thread marks it read');
update public.notifications set read_at = now() where kind = 'C3';
update public.messages set deleted_at = now() where id = pg_temp.first_message();
select is((select count(*)::int from public.messages where deleted_at is not null), 0,
  'a Member cannot delete the other member''s message');

select pg_temp.login('01');
insert into public.messages (thread_id, body) values (pg_temp.thread(), 'After you read');
select is(pg_temp.notices('02'), 2, 'once opened, the next message sends a new C3');
select pg_temp.login('02');
update public.notifications set read_at = now() where kind = 'C3';
select pg_temp.login('01');
insert into public.messages (thread_id, body) values (pg_temp.thread(), 'Not opened yet');
select is(pg_temp.notices('02'), 2, 'reading the notice without opening the thread sends no new C3');

select pg_temp.login('03');
select is((select count(*)::int from public.messages), 0, 'a stranger reads nothing');
select is((select count(*)::int from storage.objects where bucket_id = 'message-files'), 0,
  'nor the attachment');
select throws_ok($$insert into storage.objects (bucket_id, name)
  values ('message-files', pg_temp.thread() || '/' || pg_temp.first_message() || '/x.pdf')$$, '42501', null,
  'nor uploads into the thread');

select pg_temp.login('a1');
select is((select count(*)::int from public.messages where thread_id = pg_temp.thread()), 0,
  'staff cannot read a thread that is not reported');
select is((select count(*)::int from public.message_threads where id = pg_temp.thread()), 0,
  'nor see the thread');
select is((select count(*)::int from public.message_attachments), 0, 'nor its attachments');
select is((select count(*)::int from storage.objects where bucket_id = 'message-files'), 0, 'nor its files');

select pg_temp.login('01');
update public.messages set deleted_at = now() where id = pg_temp.first_message();
select is((select body from public.messages where id = pg_temp.first_message()), '',
  'deleting clears the text on the server');
select is((select count(*)::int from public.message_attachments), 0, 'and removes its attachments');
select pg_temp.login('02');
select is((select count(*)::int from storage.objects where bucket_id = 'message-files'), 0,
  'so the deleted message''s file can no longer be opened');
select pg_temp.login('01');

reset role;
update public.message_threads set status = 'reported', reported_at = now() where id = pg_temp.thread();
set local role authenticated;

select pg_temp.login('a1');
select is((select count(*)::int from public.messages where thread_id = pg_temp.thread()), 4,
  'staff read a reported thread');

select pg_temp.login('01');
select throws_ok($$update public.messages set deleted_at = now()
  where id = (select id from public.messages where thread_id = pg_temp.thread() and deleted_at is null limit 1)$$,
  'P0001', 'thread_reported',
  'nothing can be deleted once the thread is reported');

reset role;
delete from public.connections where member_b = '00000000-0000-0000-0000-000000000404';
insert into public.blocks (blocker_id, blocked_id)
  values ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000405');
set local role authenticated;
select pg_temp.login('01');
select throws_ok($$insert into public.messages (thread_id, body) values ('00000000-0000-0000-0002-000000000004', 'hi')$$,
  '42501', null, 'no sending after the connection is removed');
select throws_ok($$insert into public.messages (thread_id, body) values ('00000000-0000-0000-0002-000000000005', 'hi')$$,
  '42501', null, 'no sending after a block');
select is((select count(*)::int from public.message_threads), 3, 'the threads stay readable to their members');
select is((select full_name from public.my_threads() where thread_id = '00000000-0000-0000-0002-000000000005'), null,
  'but the inbox shows nothing of a blocked member');

reset role;
set local role anon;
select throws_ok($$select * from public.my_threads()$$, '42501', null, 'a visitor cannot list threads');

select * from finish();
rollback;
