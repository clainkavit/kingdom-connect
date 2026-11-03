begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(19);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'super1@test.invalid'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin@test.invalid'),
  ('00000000-0000-0000-0000-0000000000a3', 'member@test.invalid'),
  ('00000000-0000-0000-0000-0000000000a4', 'newstaff@test.invalid');
insert into public.staff (id, full_name, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'Only Super', 'super_admin'),
  ('00000000-0000-0000-0000-0000000000a2', 'Plain Admin', 'admin');
update public.staff set active = false
where role = 'super_admin' and id <> '00000000-0000-0000-0000-0000000000a1';
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-0000000000a3', 'cap_member', 'approved');

select is((select value from public.platform_settings where key = 'daily_application_cap'), 'null'::jsonb,
  'the daily application cap is off by default');
select is(private.application_cap_reached(), false, 'with the cap off, sign-up stays open');
update public.platform_settings set value = to_jsonb(private.sign_ups_today()) where key = 'daily_application_cap';
select is(private.application_cap_reached(), true, 'once today''s sign-ups reach the cap, sign-up is refused');
update public.platform_settings set value = to_jsonb(private.sign_ups_today() + 1) where key = 'daily_application_cap';
select is(private.application_cap_reached(), false, 'below the cap, sign-up stays open');
select throws_ok($$update public.platform_settings set value = '0' where key = 'daily_application_cap'$$,
  '22023', null, 'the cap is a whole number from 1');
select throws_ok($$update public.platform_settings set value = '"lots"' where key = 'daily_application_cap'$$,
  '22023', null, 'or off');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated", "otp_verified": true}', true);
update public.platform_settings set value = '5' where key = 'daily_application_cap';
reset role;
select is((select value from public.platform_settings where key = 'daily_application_cap'),
  to_jsonb(private.sign_ups_today() + 1), 'an Administrator cannot change the cap');
set local role authenticated;
select throws_ok(
  $$insert into public.staff (id, full_name, role) values ('00000000-0000-0000-0000-0000000000a4', 'X', 'admin')$$,
  '42501', null, 'an Administrator cannot create staff');
update public.staff set active = false where id = '00000000-0000-0000-0000-0000000000a1';
reset role;
select is((select active from public.staff where id = '00000000-0000-0000-0000-0000000000a1'), true,
  'an Administrator cannot deactivate staff');
set local role authenticated;

select throws_ok(
  $$insert into public.members (id, username) values ('00000000-0000-0000-0000-0000000000a2', 'staff_member')$$,
  '42501', null, 'a staff account cannot give itself a member profile');

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated", "otp_verified": true}', true);
update public.platform_settings set value = '25' where key = 'daily_application_cap';
reset role;
select is((select value from public.platform_settings where key = 'daily_application_cap'), '25'::jsonb,
  'a Super Administrator changes the cap');
select is((select count(*)::int from private.audit_log
           where action = 'platform_settings.update' and actor_staff_id = '00000000-0000-0000-0000-0000000000a1'
             and after ->> 'key' = 'daily_application_cap'), 1,
  'and the change is in the audit log');
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated", "otp_verified": true}', true);

update public.staff set active = false where id = '00000000-0000-0000-0000-0000000000a2';
select is((select active from public.staff where id = '00000000-0000-0000-0000-0000000000a2'), false,
  'a Super Administrator deactivates an Administrator');
reset role;
select is((select count(*)::int from private.audit_log
           where action = 'staff.update' and target_id = '00000000-0000-0000-0000-0000000000a2'
             and actor_staff_id = '00000000-0000-0000-0000-0000000000a1'), 1,
  'the deactivation is in the audit log with the Super Administrator who made it');
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated", "otp_verified": true}', true);
update public.staff set active = true where id = '00000000-0000-0000-0000-0000000000a2';
select is((select active from public.staff where id = '00000000-0000-0000-0000-0000000000a2'), true,
  'and reactivates them');
select throws_ok($$update public.staff set active = false where id = '00000000-0000-0000-0000-0000000000a1'$$,
  '42501', null, 'a Super Administrator cannot deactivate their own account');
reset role;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000a3"}', true);
select throws_ok($$update public.staff set role = 'admin' where id = '00000000-0000-0000-0000-0000000000a1'$$,
  '42501', 'the last active Super Administrator cannot be removed',
  'the last active Super Administrator cannot be demoted');
select throws_ok($$update public.staff set active = false where id = '00000000-0000-0000-0000-0000000000a1'$$,
  '42501', 'the last active Super Administrator cannot be removed', 'or deactivated');
select throws_ok(
  $$insert into public.connections (member_a, member_b)
    values (least('00000000-0000-0000-0000-0000000000a2'::uuid, '00000000-0000-0000-0000-0000000000a3'),
            greatest('00000000-0000-0000-0000-0000000000a2'::uuid, '00000000-0000-0000-0000-0000000000a3'))$$,
  '23503', null, 'a staff account can never be one side of a connection: connections hold members only');

select * from finish();
rollback;
