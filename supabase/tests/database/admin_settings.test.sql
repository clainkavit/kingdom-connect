begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(18);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000044' || k)::uuid, 'as' || k || '@test.invalid' from unnest(array['01', 'a1', 'a2']) k;
insert into public.members (id, username, status) values ('00000000-0000-0000-0000-000000004401', 'as_member', 'approved');
insert into public.member_private (member_id, phone, email, language)
values ('00000000-0000-0000-0000-000000004401', '+255712004401', 'as01@test.invalid', 'en');
insert into public.verification_requests (member_id, level, status, submitted_at, decided_at)
values ('00000000-0000-0000-0000-000000004401', 1, 'approved', now(), now());
insert into public.staff (id, full_name, role, active) values
  ('00000000-0000-0000-0000-0000000044a1', 'Plain Admin', 'admin', true),
  ('00000000-0000-0000-0000-0000000044a2', 'Super Admin', 'super_admin', true);

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000044' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;

set local role authenticated;
select pg_temp.login('01');
select is((select count(*)::int from public.platform_settings_list()), 0, 'a member reads no settings');
select is(public.set_platform_setting('platform_name', '"Hacked"'), 'not_super_admin', 'nor changes one');
select pg_temp.login('a1');
select is((select count(*)::int from public.platform_settings_list()), 0, 'an Administrator reads none either');
select is(public.set_platform_setting('platform_name', '"Hacked"'), 'not_super_admin', 'and cannot change one');
select is((select count(*)::int from public.legal_text_versions()), 0, 'nor read the legal text versions');

select pg_temp.login('a2');
select is((select count(*)::int from public.platform_settings_list()), 4, 'a Super Administrator reads the four settings');
select is(public.set_platform_setting('platform_name', '"  Kingdom Connect Tanzania  "'), 'ok', 'and changes the platform name');
select is((select value #>> '{}' from public.platform_settings_list() where key = 'platform_name'), 'Kingdom Connect Tanzania',
  'which is trimmed');
select is(public.set_platform_setting('platform_name', '"x"'), 'invalid_value', 'a one-letter name is refused');
select is(public.set_platform_setting('featured_slot_limit', '21'), 'invalid_value', 'the featured slots are 1 to 20');
select is(public.set_platform_setting('featured_slot_limit', '3'), 'ok', 'and can be changed');
select is(public.set_platform_setting('featured_slot_limit', '3'), 'unchanged', 'a change to the same value is reported as unchanged');
select is(public.set_platform_setting('daily_application_cap', '0'), 'invalid_value', 'the cap is off (null) or 1 to 999999');
select is(public.set_platform_setting('daily_application_cap', '50'), 'ok', 'and can be set');
select is(public.set_platform_setting('real_registrations_open', 'true'), 'unknown_setting',
  'a setting this screen does not manage is refused');
select ok((select bool_and(version ~ '^[0-9]+\.[0-9]+$') and count(*) >= 5 from public.legal_text_versions()),
  'the legal text versions list the loaded texts');

reset role;
select is((select (before ->> 'value') || '>' || (after ->> 'value') from private.audit_log
           where target_type = 'platform_settings' and action = 'platform_settings.update'
             and (after ->> 'key') = 'featured_slot_limit'), '5>3', 'the audit log keeps the before and after values');
set local role anon;
select throws_ok($$select * from public.platform_settings_list()$$, '42501', null, 'a signed-out visitor cannot ask');

select * from finish();
rollback;
