begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

select has_table('private', 'login_attempts', 'private.login_attempts exists');
select has_table('private', 'login_otps', 'private.login_otps exists');
select has_table('private', 'mfa_sessions', 'private.mfa_sessions exists');
select hasnt_column('private', 'login_otps', 'code', 'login codes are stored as a hash only');

set local role authenticated;
select throws_ok('select * from private.login_otps', '42501', null, 'signed-in sessions cannot read login codes');
select throws_ok('select * from private.mfa_sessions', '42501', null, 'signed-in sessions cannot read verified sessions');
reset role;
set local role anon;
select throws_ok('select * from private.login_attempts', '42501', null, 'signed-out visitors cannot read login attempts');
reset role;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'member@test.invalid'),
  ('00000000-0000-0000-0000-00000000000a', 'applicant@test.invalid'),
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.invalid');
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000000001', 'hook_member', 'approved'),
  ('00000000-0000-0000-0000-00000000000a', 'hook_applicant', 'pending');
insert into public.staff (id, full_name, role) values ('00000000-0000-0000-0000-0000000000a1', 'Hook Admin', 'admin');
insert into auth.sessions (id, user_id) values
  ('11111111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'),
  ('11111111-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001'),
  ('11111111-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a'),
  ('11111111-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1');
insert into private.mfa_sessions (session_id, user_id) values
  ('11111111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001');

create function pg_temp.claims(uid text, sid text) returns jsonb language sql as $$
  select private.custom_access_token_hook(jsonb_build_object(
    'user_id', uid,
    'claims', jsonb_build_object('sub', uid, 'session_id', sid, 'role', 'authenticated', 'aal', 'aal1')
  )) -> 'claims';
$$;

select is(pg_temp.claims('00000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001') ->> 'otp_verified', 'true',
  'hook: a session that passed the email code is marked otp_verified');
select is(pg_temp.claims('00000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002') ->> 'otp_verified', 'false',
  'hook: a password-only session of the same person is not');
select is(pg_temp.claims('00000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001') ->> 'user_status', 'approved',
  'hook: user_status carries the Member status');
select is(pg_temp.claims('00000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a') ->> 'user_status', 'pending',
  'hook: an Applicant is marked pending');
select is(pg_temp.claims('00000000-0000-0000-0000-0000000000a1', '11111111-0000-0000-0000-0000000000a1') ->> 'user_status', 'staff',
  'hook: an active Administrator is marked staff');
select is(pg_temp.claims('00000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001') ->> 'aal', 'aal1',
  'hook: keeps the claims Supabase requires');

select ok(has_function_privilege('supabase_auth_admin', 'private.custom_access_token_hook(jsonb)', 'execute'),
  'the Auth server can call the hook');
select ok(not has_function_privilege('authenticated', 'private.custom_access_token_hook(jsonb)', 'execute'),
  'signed-in sessions cannot call the hook');

update public.members set status = 'suspended' where id = '00000000-0000-0000-0000-000000000001';
select is((select count(*)::int from auth.sessions where user_id = '00000000-0000-0000-0000-000000000001'), 0,
  'suspending a Member signs them out of every session');
select is((select count(*)::int from private.mfa_sessions where user_id = '00000000-0000-0000-0000-000000000001'), 0,
  'and their verified sessions go with them');

update public.members set status = 'rejected' where id = '00000000-0000-0000-0000-00000000000a';
select is((select count(*)::int from auth.sessions where user_id = '00000000-0000-0000-0000-00000000000a'), 0,
  'rejecting an Applicant signs them out');

update public.staff set active = false where id = '00000000-0000-0000-0000-0000000000a1';
select is((select count(*)::int from auth.sessions where user_id = '00000000-0000-0000-0000-0000000000a1'), 0,
  'deactivating an Administrator signs them out');

insert into auth.sessions (id, user_id) values ('11111111-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001');
insert into private.login_otps (user_id, session_id, code_hash, expires_at) values
  ('00000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003', 'x', now() + interval '10 minutes');
delete from auth.sessions where id = '11111111-0000-0000-0000-000000000003';
select is((select count(*)::int from private.login_otps where session_id = '11111111-0000-0000-0000-000000000003'), 0,
  'signing out removes the session''s pending code');

select throws_ok($$insert into private.login_otps (user_id, session_id, code_hash, expires_at, attempts)
  values ('00000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002', 'x', now(), 4)$$,
  '23514', null, 'a code allows at most 3 attempts');


select is((select attempt from private.start_login_attempt('hook_member', '00000000-0000-0000-0000-000000000001', 5)), 1,
  'an attempt is counted before its password is checked');
select private.start_login_attempt('hook_member', '00000000-0000-0000-0000-000000000001', 5) from generate_series(1, 3);
select is((select row(allowed, attempt)::text from private.start_login_attempt('hook_member', '00000000-0000-0000-0000-000000000001', 5)),
  row(true, 5)::text, 'the fifth attempt is still checked');
select is((select allowed from private.start_login_attempt('hook_member', '00000000-0000-0000-0000-000000000001', 5)), false,
  'a sixth attempt started at the same moment is refused before its password is checked');
select ok((select just_locked from private.finish_failed_login('hook_member', 5, 5, 15)),
  'a wrong password on the fifth attempt locks the account');
select ok((select locked_until > now() + interval '14 minutes' from private.login_attempts where identifier = 'hook_member'),
  'for 15 minutes');
select is((select allowed from private.start_login_attempt('hook_member', '00000000-0000-0000-0000-000000000001', 5)), false,
  'nothing is checked while locked');
select private.start_login_attempt('nobody_by_this_name', null, 5) from generate_series(1, 5);
select ok((select just_locked from private.finish_failed_login('nobody_by_this_name', 5, 5, 15)),
  'a name that matches no account locks the same way, so locking reveals nothing');
update private.login_attempts set locked_until = now() - interval '1 second' where identifier = 'hook_member';
select is((select row(allowed, attempt)::text from private.start_login_attempt('hook_member', '00000000-0000-0000-0000-000000000001', 5)),
  row(true, 1)::text, 'counting starts again once a lock has run out');

insert into auth.sessions (id, user_id) values ('11111111-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a');
select ok(private.issue_login_code('00000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-000000000004', 'right', 10, 10),
  'a code is issued');
select is((select row(result, attempts_left)::text from private.check_login_code('11111111-0000-0000-0000-000000000004', 'wrong', 3)),
  row('wrong_code', 2)::text, 'a wrong code uses one of 3 tries');
select is((select result from private.check_login_code('11111111-0000-0000-0000-000000000004', 'right', 3)), 'ok',
  'the right code is accepted');
select ok(exists (select 1 from private.mfa_sessions where session_id = '11111111-0000-0000-0000-000000000004'),
  'and marks the session as having passed the email code');
select is((select result from private.check_login_code('11111111-0000-0000-0000-000000000004', 'right', 3)), 'no_code',
  'a used code cannot be used again');

insert into auth.sessions (id, user_id) values ('11111111-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a');
select ok(private.issue_login_code('00000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-000000000005', 'right', 10, 10), 'another code');
select private.check_login_code('11111111-0000-0000-0000-000000000005', 'wrong', 3) from generate_series(1, 3);
select is((select result from private.check_login_code('11111111-0000-0000-0000-000000000005', 'right', 3)), 'too_many',
  'after 3 wrong tries even the right code is refused');

update private.login_otps set expires_at = now() - interval '1 second' where session_id = '11111111-0000-0000-0000-000000000005';
select ok(private.issue_login_code('00000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-000000000005', 'later', 10, 10), 'a new code');
update private.login_otps set expires_at = now() - interval '1 second' where session_id = '11111111-0000-0000-0000-000000000005';
select is((select result from private.check_login_code('11111111-0000-0000-0000-000000000005', 'later', 3)), 'expired',
  'an expired code is refused');

select ok(not private.issue_login_code('00000000-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-000000000005', 'x', 10, 3),
  'no more codes once a person has had the hourly limit');

select * from finish();
rollback;
