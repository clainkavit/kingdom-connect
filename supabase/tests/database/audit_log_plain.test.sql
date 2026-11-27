begin;
create extension if not exists pgtap with schema extensions;
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(14);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000008' || k)::uuid, 'ap' || k || '@test.invalid'
from unnest(array['01', '02', 'a1', 'b1']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000000801', 'ap_member', 'approved'),
  ('00000000-0000-0000-0000-000000000802', 'ap_gone', 'deleted');
insert into public.staff (id, full_name, role, active) values
  ('00000000-0000-0000-0000-0000000008a1', 'Plain Admin', 'admin', true),
  ('00000000-0000-0000-0000-0000000008b1', 'Plain Super', 'super_admin', true);

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000008' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;

alter table private.audit_log disable trigger append_only;
delete from private.audit_log;
alter table private.audit_log enable trigger append_only;
insert into private.audit_log (actor_staff_id, action, target_type, target_id, after, created_at) values
  ('00000000-0000-0000-0000-0000000008b1', 'investor_flags.insert', 'investor_flags', gen_random_uuid(),
   '{"member_id": "00000000-0000-0000-0000-000000000801", "route": "invitation"}', '2026-11-27 08:16+03'),
  ('00000000-0000-0000-0000-0000000008b1', 'platform_settings.update', 'platform_settings', gen_random_uuid(),
   '{"key": "daily_application_cap", "value": 40}', '2026-11-26 15:12+03'),
  ('00000000-0000-0000-0000-0000000008a1', 'application.approved', 'verification_requests', gen_random_uuid(),
   '{"status": "approved"}', '2026-11-26 18:59+03');
insert into private.audit_log (action, target_type, target_id, before, after, created_at) values
  ('platform_settings.update', 'platform_settings', gen_random_uuid(),
   '{"key": "job_alerts_last_run", "value": "2026-11-26"}', '{"key": "job_alerts_last_run", "value": "2026-11-27"}',
   '2026-11-27 07:00+03'),
  ('platform_settings.update', 'platform_settings', gen_random_uuid(),
   '{"key": "daily_application_cap", "value": null}', '{"key": "daily_application_cap", "value": 10}',
   '2026-11-25 07:00+03'),
  ('something.new', 'something', null, null, '{}', '2026-11-24 07:00+03');

set local role authenticated;
select pg_temp.login('a1');
select throws_ok($$select * from public.audit_names(array['00000000-0000-0000-0000-000000000801'::uuid])$$,
  'P0001', 'not_allowed', 'an Administrator cannot look up names');
select pg_temp.login('01');
select throws_ok($$select * from public.audit_names(array['00000000-0000-0000-0000-000000000801'::uuid])$$,
  'P0001', 'not_allowed', 'nor a member');

select pg_temp.login('b1');
select is((select kind from public.audit_log() where action = 'investor_flags.insert'), 'investors',
  'an investor flag change is about investors');
select is((select kind from public.audit_log() where action = 'application.approved'), 'people',
  'an application decision is about members and applications');
select is((select kind from public.audit_log() where action = 'something.new'), 'other',
  'an unknown action is other');
select is((select array_agg(routine order by created_at desc) from public.audit_log() where target_type = 'platform_settings'),
  array[true, false, false], 'only a system job stamping its last run is routine');
select is((select count(*)::int from public.audit_log()), 6, 'routine entries are listed by default');
select is((select count(*)::int from public.audit_log(show_routine => false)), 5, 'and can be left out');
select is((select count(*)::int from public.audit_log(show_routine => false, system_only => true)), 2,
  'a system change that is not a job run stays');
select is((select array_agg(action order by created_at desc) from public.audit_log(kinds => array['investors', 'people'])),
  array['investor_flags.insert', 'application.approved'], 'filters by kinds of change');
select is((select array_agg(action) from public.audit_log(kinds => array['settings'], show_routine => false, page_size => 1)),
  array['platform_settings.update'], 'filters apply before the page is cut');

select is((select name from public.audit_names(array['00000000-0000-0000-0000-0000000008a1'::uuid])), 'Plain Admin',
  'a staff account is named');
select is((select row(name, kind)::text from public.audit_names(array['00000000-0000-0000-0000-000000000801'::uuid])),
  '(@ap_member,member)', 'a member without a profile name shows the username');
select is((select count(*)::int from public.audit_names(array['00000000-0000-0000-0000-000000000802'::uuid])), 0,
  'a deleted member is not named');

select * from finish();
rollback;
