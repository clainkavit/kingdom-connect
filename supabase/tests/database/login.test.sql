begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

select has_table('private', 'login_attempts', 'private.login_attempts exists');
select has_table('private', 'login_otps', 'private.login_otps exists');
select has_table('private', 'mfa_sessions', 'private.mfa_sessions exists');
select hasnt_column('private', 'login_otps', 'code', 'login codes are stored as a hash only');

set local role authenticated;
select throws_ok('select * from private.login_otps', '42501', null, 'signed-in users cannot read login codes');
select throws_ok('select * from private.mfa_sessions', '42501', null, 'signed-in users cannot read verified sessions');
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
  'signed-in users cannot call the hook');

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

select * from finish();
rollback;
