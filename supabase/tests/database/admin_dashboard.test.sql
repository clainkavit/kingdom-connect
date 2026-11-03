begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(10);

delete from public.reports;
select set_config('test.verified', (select count(*) from public.members where status = 'approved')::text, true);
select set_config('test.rejected', (select count(*) from public.members where status = 'rejected')::text, true);
select set_config('test.pending', (select count(*) from public.verification_requests
                                   where status = 'pending' and level = 1)::text, true);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000009' || k)::uuid, 'ad' || k || '@test.invalid'
from unnest(array['01', '02', '03', '04', 'a1', 'a2']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000000901', 'ad_member', 'approved'),
  ('00000000-0000-0000-0000-000000000902', 'ad_applicant', 'pending'),
  ('00000000-0000-0000-0000-000000000903', 'ad_rejected', 'rejected'),
  ('00000000-0000-0000-0000-000000000904', 'ad_member_two', 'approved');
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000009a1', 'Dash Staff', 'admin', true),
         ('00000000-0000-0000-0000-0000000009a2', 'Former Staff', 'admin', false);
insert into public.verification_requests (member_id, level, status, submitted_at) values
  ('00000000-0000-0000-0000-000000000902', 1, 'pending', '2026-11-02 09:00+03'),
  ('00000000-0000-0000-0000-000000000901', 2, 'pending', '2026-11-02 10:00+03');
insert into public.reports (reporter_id, target_type, target_id, subject_id, reason) values
  ('00000000-0000-0000-0000-000000000901', 'profile', '00000000-0000-0000-0000-000000000904',
   '00000000-0000-0000-0000-000000000904', 'spam'),
  ('00000000-0000-0000-0000-000000000903', 'profile', '00000000-0000-0000-0000-000000000904',
   '00000000-0000-0000-0000-000000000904', 'spam');
update public.platform_settings set value = '25' where key = 'daily_application_cap';

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000009' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;

set local role authenticated;
select pg_temp.login('01');
select throws_ok($$select * from public.admin_dashboard_stats()$$, 'P0001', 'not_allowed',
  'a member cannot read the admin dashboard');

select pg_temp.login('a2');
select throws_ok($$select * from public.admin_dashboard_stats()$$, 'P0001', 'not_allowed',
  'nor a deactivated staff account');

select pg_temp.login('a1');
select is((select verified_members from public.admin_dashboard_stats()), current_setting('test.verified')::int + 2,
  'counts approved members only');
select is((select cardinality(pending_submitted_at) from public.admin_dashboard_stats()),
  current_setting('test.pending')::int + 1, 'counts Level 1 applications waiting, not Level 2 requests');
select ok((select '2026-11-02 09:00+03'::timestamptz = any (pending_submitted_at) from public.admin_dashboard_stats()),
  'with each submission time, for the age of the oldest and the 2-working-day alert');
select is((select rejected_members from public.admin_dashboard_stats()), current_setting('test.rejected')::int + 1,
  'counts rejected members');
select is((select open_report_cases from public.admin_dashboard_stats()), 1,
  'counts open report cases, not reports');
select is((select daily_cap from public.admin_dashboard_stats()), 25, 'shows the daily cap');
select ok((select sign_ups_today >= 0 from public.admin_dashboard_stats()), 'and the sign-ups today');

set local role anon;
select throws_ok($$select * from public.admin_dashboard_stats()$$, '42501', null, 'a visitor cannot call it');

select * from finish();
rollback;
