begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(44);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000003' || k)::uuid, 'cn' || k || '@test.invalid'
from unnest(array['01', '02', '03', '04', '05', '06', '07']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000000301', 'cn_asker', 'approved'),
  ('00000000-0000-0000-0000-000000000302', 'cn_receiver', 'approved'),
  ('00000000-0000-0000-0000-000000000303', 'cn_stranger', 'approved'),
  ('00000000-0000-0000-0000-000000000304', 'cn_applicant', 'pending'),
  ('00000000-0000-0000-0000-000000000305', 'cn_busy', 'approved'),
  ('00000000-0000-0000-0000-000000000306', 'cn_blocked', 'approved'),
  ('00000000-0000-0000-0000-000000000307', 'cn_hidden', 'approved');
insert into public.profiles (member_id, full_name, hidden_from_directory) values
  ('00000000-0000-0000-0000-000000000301', 'Asker Person', false),
  ('00000000-0000-0000-0000-000000000302', 'Receiver Person', false),
  ('00000000-0000-0000-0000-000000000303', 'Stranger Person', false),
  ('00000000-0000-0000-0000-000000000305', 'Busy Person', false),
  ('00000000-0000-0000-0000-000000000306', 'Blocked Person', false),
  ('00000000-0000-0000-0000-000000000307', 'Hidden Person', true);

create temp table targets as
select ('00000000-0000-0000-0001-' || lpad(n::text, 12, '0'))::uuid as id, n from generate_series(1, 31) n;
grant select on targets to authenticated;
insert into auth.users (id, email) select id, 'cnt' || n || '@test.invalid' from targets;
insert into public.members (id, username, status) select id, 'cn_target_' || n, 'approved' from targets;

insert into public.connection_requests (requester_id, receiver_id)
  values ('00000000-0000-0000-0000-000000000306', '00000000-0000-0000-0000-000000000301');
insert into public.connections (member_a, member_b)
  values ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000306');

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000003' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
create function pg_temp.notices(who text, k text) returns int language sql security definer as $$
  select count(*)::int from public.notifications
  where member_id = ('00000000-0000-0000-0000-0000000003' || who)::uuid and kind = k;
$$;
grant execute on function pg_temp.notices(text, text) to authenticated;

set local role authenticated;

select pg_temp.login('01');
select lives_ok($$insert into public.connection_requests (receiver_id, note)
  values ('00000000-0000-0000-0000-000000000302', 'We met at the Sunday service.')$$,
  'a Member sends a request with a note');
select is(pg_temp.notices('02', 'C1'), 1, 'the receiver gets C1');
select throws_ok($$insert into public.connection_requests (receiver_id)
  values ('00000000-0000-0000-0000-000000000302')$$, 'P0001', 'already_sent',
  'only one open request per pair');
select throws_ok($$insert into public.connection_requests (requester_id, receiver_id)
  values ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000302')$$, '42501', null,
  'a Member cannot send a request as someone else');
select throws_ok($$insert into public.connection_requests (receiver_id, note)
  values ('00000000-0000-0000-0000-000000000303', repeat('x', 301))$$, '23514', null,
  'the note is at most 300 characters');
select throws_ok($$insert into public.connection_requests (receiver_id)
  values ('00000000-0000-0000-0000-000000000304')$$, 'P0001', 'not_available',
  'an Applicant cannot receive a request');
select throws_ok($$select status from public.connection_requests$$, '42501', null,
  'the requester cannot read the status of their requests');
select is((select count(*)::int from public.my_sent_requests() where full_name = 'Receiver Person'), 1,
  'the requester sees the request as sent');
select throws_ok($$update public.connection_requests set status = 'accepted'
  where receiver_id = '00000000-0000-0000-0000-000000000302'$$, 'P0001', 'request_closed',
  'the requester cannot accept their own request');

select pg_temp.login('03');
select is((select count(*)::int from public.connection_requests), 0, 'a stranger sees no request');

select pg_temp.login('02');
select is((select note from public.my_received_requests() where full_name = 'Asker Person'),
  'We met at the Sunday service.', 'the receiver sees the open request and its note');
select throws_ok($$select status from public.connection_requests$$, '42501', null,
  'the receiver cannot read the status column either');
select throws_ok($$insert into public.connection_requests (receiver_id)
  values ('00000000-0000-0000-0000-000000000301')$$, 'P0001', 'they_asked_you',
  'the receiver is told to accept instead of sending a second request');
select is(public.connection_state('00000000-0000-0000-0000-000000000301'), 'received',
  'the receiver sees the state as received');
update public.connection_requests set status = 'declined' where id = (select request_id from public.my_received_requests());
select is((select count(*)::int from public.my_received_requests()), 0,
  'a declined request leaves the receiver''s list');

select pg_temp.login('01');
select is(pg_temp.notices('01', 'C2'), 0, 'declining sends no notice');
select is((select count(*)::int from public.my_sent_requests() where full_name = 'Receiver Person'), 1,
  'the sender cannot tell the request was declined: it still looks sent');
select is(public.connection_state('00000000-0000-0000-0000-000000000302'), 'sent',
  'the state still reads sent');
select throws_ok($$insert into public.connection_requests (receiver_id)
  values ('00000000-0000-0000-0000-000000000302')$$, 'P0001', 'already_sent',
  'a declined request still counts as open for the sender until it expires');

reset role;
update public.connection_requests set expires_at = now() - interval '1 minute'
  where requester_id = '00000000-0000-0000-0000-000000000301';
set local role authenticated;
select is((select count(*)::int from public.my_sent_requests() where full_name = 'Receiver Person'), 0,
  'after 30 days the request expires');
select lives_ok($$insert into public.connection_requests (receiver_id)
  values ('00000000-0000-0000-0000-000000000302')$$, 'after it expires, the sender may ask again');

select pg_temp.login('02');
update public.connection_requests set status = 'accepted' where id = (select request_id from public.my_received_requests());
select is(public.connection_state('00000000-0000-0000-0000-000000000301'), 'connected', 'accepting connects them');

select pg_temp.login('01');
select is(pg_temp.notices('01', 'C2'), 1, 'the requester gets C2');
select throws_ok($$insert into public.connection_requests (receiver_id)
  values ('00000000-0000-0000-0000-000000000302')$$, 'P0001', 'already_connected',
  'no request to a connection');
delete from public.connections where '00000000-0000-0000-0000-000000000302' in (member_a, member_b);
select is(public.connection_state('00000000-0000-0000-0000-000000000302'), 'none', 'either member removes the connection');
select lives_ok($$insert into public.connection_requests (receiver_id)
  values ('00000000-0000-0000-0000-000000000302')$$, 'after removing, either may ask again');
update public.connection_requests set status = 'withdrawn' where id = (select request_id from public.my_sent_requests()
  where full_name = 'Receiver Person');
select is((select count(*)::int from public.my_sent_requests() where full_name = 'Receiver Person'), 0,
  'the sender withdraws a request');

insert into public.blocks (blocker_id, blocked_id)
  values ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000306');
select is(public.connection_state('00000000-0000-0000-0000-000000000306'), 'none',
  'blocking removes the connection and closes the request they sent you');
select is((select array_agg(full_name) from public.my_blocks()), array['Blocked Person'],
  'the blocker sees who they blocked, to unblock');

select pg_temp.login('06');
select is((select count(*)::int from public.my_sent_requests()), 0,
  'the blocked member''s request closes, so nothing of the blocker is shown to them');
select throws_ok($$insert into public.connection_requests (receiver_id)
  values ('00000000-0000-0000-0000-000000000301')$$, 'P0001', 'not_available',
  'a blocked member cannot send a request');

select pg_temp.login('07');
insert into public.connection_requests (receiver_id) values ('00000000-0000-0000-0000-000000000303');
select pg_temp.login('03');
select is((select count(*)::int from public.profiles where member_id = '00000000-0000-0000-0000-000000000307'), 1,
  'a hidden member who asks first can be seen by the receiver while the request is open');
update public.connection_requests set status = 'declined' where id = (select request_id from public.my_received_requests());
select is((select count(*)::int from public.profiles where member_id = '00000000-0000-0000-0000-000000000307'), 0,
  'once the request is answered, the hidden profile is hidden again');

select pg_temp.login('03');
insert into public.connection_requests (receiver_id) values ('00000000-0000-0000-0000-000000000302');
select pg_temp.login('02');
update public.connection_requests set status = 'declined' where id = (select request_id from public.my_received_requests());
select lives_ok($$insert into public.connection_requests (receiver_id)
  values ('00000000-0000-0000-0000-000000000303')$$, 'after declining, the decliner may ask back');
select is(public.connection_state('00000000-0000-0000-0000-000000000303'), 'connected',
  'asking back accepts the declined request, so the decline never shows');
select is(pg_temp.notices('03', 'C2'), 1, 'the first sender hears they are connected');
select is(pg_temp.notices('03', 'C1'), 1,
  'the first sender gets no request from the decliner (the one C1 is from the hidden member earlier)');
select pg_temp.login('03');
delete from public.connections where '00000000-0000-0000-0000-000000000302' in (member_a, member_b);
select lives_ok($$insert into public.connection_requests (receiver_id)
  values ('00000000-0000-0000-0000-000000000302')$$, 'after removing that connection, either may ask again');

select pg_temp.login('05');
select is((select count(*)::int from (
  select public.connection_state(id) from targets where n <= 30
) s), 30, 'fixture: thirty receivers');
do $$
declare t uuid;
begin
  for t in select id from targets where n <= 30 loop
    insert into public.connection_requests (receiver_id) values (t);
  end loop;
end $$;
select throws_ok($$insert into public.connection_requests (receiver_id)
  select id from targets where n = 31$$, 'P0001', 'daily_limit', 'the 31st request in a day is refused');

reset role;
set local role anon;
select throws_ok($$select * from public.my_sent_requests()$$, '42501', null, 'a visitor cannot read sent requests');
select throws_ok($$select * from public.my_received_requests()$$, '42501', null, 'a visitor cannot read received requests');
select throws_ok($$select * from public.my_blocks()$$, '42501', null, 'a visitor cannot read blocks');
select throws_ok($$select public.connection_state('00000000-0000-0000-0000-000000000301')$$, '42501', null,
  'a visitor cannot read a connection state');

select * from finish();
rollback;
