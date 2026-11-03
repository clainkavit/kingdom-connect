begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(23);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000007' || k)::uuid, 'al' || k || '@test.invalid'
from unnest(array['01', '02', 'a1', 'b1']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000000701', 'al_member', 'approved'),
  ('00000000-0000-0000-0000-000000000702', 'al_leaver', 'pending');
insert into public.staff (id, full_name, role, active) values
  ('00000000-0000-0000-0000-0000000007a1', 'Audit Admin', 'admin', true),
  ('00000000-0000-0000-0000-0000000007b1', 'Audit Super', 'super_admin', true);

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000007' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;

alter table private.audit_log disable trigger append_only;
delete from private.audit_log;
alter table private.audit_log enable trigger append_only;
insert into private.audit_log (actor_staff_id, action, target_type, target_id, before, after, created_at) values
  ('00000000-0000-0000-0000-0000000007a1', 'members.update', 'members', '00000000-0000-0000-0000-000000000702',
   '{"status": "pending", "username": "al_leaver"}', '{"status": "approved", "username": "al_leaver"}',
   '2026-11-01 09:00+03'),
  ('00000000-0000-0000-0000-0000000007b1', 'platform_settings.update', 'platform_settings', null,
   '{"value": 5}', '{"value": 10}', '2026-11-02 09:00+03');
insert into private.audit_log (actor_member_id, action, target_type, target_id, after, created_at) values
  ('00000000-0000-0000-0000-000000000701', 'reports.insert', 'reports', gen_random_uuid(), '{"reason": "spam"}',
   '2026-11-03 09:00+03');
insert into private.audit_log (action, target_type, target_id, after, created_at) values
  ('moderation_actions.insert', 'moderation_actions', gen_random_uuid(), '{"automatic": true}', '2026-11-03 10:00+03');
insert into private.audit_log (id, action, target_type, after, created_at) values
  ('00000000-0000-0000-0007-000000000001', 'tie.first', 'e2e', '{}', '2026-10-30 08:00+03'),
  ('00000000-0000-0000-0007-000000000002', 'tie.second', 'e2e', '{}', '2026-10-30 08:00+03');
insert into private.audit_log (actor_member_id, action, target_type, target_id, after, created_at) values
  ('00000000-0000-0000-0000-000000000702', 'profiles.update', 'profiles', '00000000-0000-0000-0000-000000000702',
   '{"headline": "x"}', '2026-10-31 23:30+03');

select set_config('test.report_entry', (select id::text from private.audit_log where action = 'reports.insert'), true);

set local role authenticated;
select pg_temp.login('01');
select throws_ok($$select * from public.audit_log()$$, 'P0001', 'not_allowed', 'a member cannot read the audit log');
select throws_ok($$select * from private.audit_log$$, '42501', null, 'nor the table');
select pg_temp.login('a1');
select throws_ok($$select * from public.audit_log()$$, 'P0001', 'not_allowed', 'nor an Administrator');
select throws_ok($$select * from public.audit_actions()$$, 'P0001', 'not_allowed', 'nor the action list');

select pg_temp.login('b1');
select is((select array_agg(action order by created_at desc) from public.audit_log()),
  array['moderation_actions.insert', 'reports.insert', 'platform_settings.update', 'members.update',
        'profiles.update', 'tie.second', 'tie.first'],
  'a Super Admin reads every entry, newest first');
select is((select actor_name from public.audit_log() where action = 'members.update'), 'Audit Admin',
  'a staff actor is named');
select is((select row(actor_kind, actor_name)::text from public.audit_log() where action = 'reports.insert'),
  '(member,al_member)', 'a member actor shows the username');
select is((select actor_kind from public.audit_log() where action = 'moderation_actions.insert'), 'system',
  'an entry with no actor is the system');
select is((select after from public.audit_log() where action = 'members.update'),
  '{"status": "approved", "username": "al_leaver"}'::jsonb, 'with before and after values');
select is((select count(*)::int from public.audit_log(actor_staff => '00000000-0000-0000-0000-0000000007a1')), 1,
  'filters by a staff account');
select is((select count(*)::int from public.audit_log(actor_username => 'AL_MEMBER')), 1,
  'filters by a member username');
select is((select count(*)::int from public.audit_log(system_only => true)), 3, 'filters to the system');
select is((select count(*)::int from public.audit_log(action_name => 'platform_settings.update')), 1,
  'filters by action');
select is((select count(*)::int from public.audit_log(from_date => '2026-11-02', to_date => '2026-11-02')), 1,
  'filters by Tanzania date, both ends included');
select is((select array_agg(action) from public.audit_log(page_size => 2)),
  array['moderation_actions.insert', 'reports.insert'], 'a page holds page_size entries');
select is((select array_agg(l.action) from public.audit_log(before_at => '2026-11-03 09:00+03',
           before_id => current_setting('test.report_entry')::uuid) l),
  array['platform_settings.update', 'members.update', 'profiles.update', 'tie.second', 'tie.first'],
  'the next page continues after the last entry');
select is((select count(*)::int from public.audit_log(from_date => '2026-10-31', to_date => '2026-10-31')), 1,
  'an entry at 23:30 Tanzania time belongs to that day');
select is((select array_agg(l.action) from public.audit_log(
             to_date => '2026-10-30',
             before_at => (select created_at from public.audit_log(to_date => '2026-10-30', page_size => 1)),
             before_id => (select id from public.audit_log(to_date => '2026-10-30', page_size => 1))) l),
  array['tie.first'], 'entries with the same time are paged by id, none skipped or repeated');
select is((select array_agg(a order by a) from public.audit_actions() a),
  array['members.update', 'moderation_actions.insert', 'platform_settings.update', 'profiles.update',
        'reports.insert', 'tie.first', 'tie.second'],
  'the action list for the filter');

reset role;
select throws_ok($$update private.audit_log set action = 'x'$$, 'P0001', null,
  'not even the database owner can change an entry');
select throws_ok($$delete from private.audit_log$$, 'P0001', null, 'or delete one');
delete from public.members where id = '00000000-0000-0000-0000-000000000702';
select is((select count(*)::int from private.audit_log where target_id = '00000000-0000-0000-0000-000000000702'), 2,
  'entries stay after the member is deleted');
set local role authenticated;
select pg_temp.login('b1');
select is((select row(actor_kind, actor_id, actor_name)::text from public.audit_log() where action = 'profiles.update'),
  '(member,00000000-0000-0000-0000-000000000702,"")', 'a deleted actor keeps their id');

select * from finish();
rollback;
