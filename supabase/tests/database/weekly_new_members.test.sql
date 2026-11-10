begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(8);

select set_config('test.week', (date_trunc('week', now() at time zone 'Africa/Dar_es_Salaam')::date)::text, true);
insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000048' || k)::uuid, 'wm' || k || '@test.invalid'
from unnest(array['01', '02', '03', '04', 'a1']) k;
insert into public.members (id, username, status)
select ('00000000-0000-0000-0000-0000000048' || k)::uuid, 'wm_' || k, 'approved' from unnest(array['01', '02', '03', '04']) k;
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000048a1', 'Chart Admin', 'admin', true);
-- 01 and 02 approved this week; 03 approved 2 weeks ago, after a rejection 3 weeks ago; 04 approved 10 weeks ago.
insert into public.verification_requests (member_id, level, status, submitted_at, decided_at) values
  ('00000000-0000-0000-0000-000000004801', 1, 'approved', now(), current_setting('test.week')::date + time '12:00' - interval '3 hours'),
  ('00000000-0000-0000-0000-000000004802', 1, 'approved', now(), current_setting('test.week')::date + time '13:00' - interval '3 hours'),
  ('00000000-0000-0000-0000-000000004803', 1, 'rejected', now(), current_setting('test.week')::date - 21 + time '12:00' - interval '3 hours'),
  ('00000000-0000-0000-0000-000000004803', 1, 'approved', now(), current_setting('test.week')::date - 14 + time '12:00' - interval '3 hours'),
  ('00000000-0000-0000-0000-000000004804', 1, 'approved', now(), current_setting('test.week')::date - 70 + time '12:00' - interval '3 hours'),
  ('00000000-0000-0000-0000-000000004801', 2, 'approved', now(), current_setting('test.week')::date - 7 + time '12:00' - interval '3 hours');

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000048' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
-- Seed data may already hold approvals; the test compares against the counts before its own rows.
create temp table baseline as
select date_trunc('week', min_decided at time zone 'Africa/Dar_es_Salaam')::date as week_start, count(*)::int as n
from (select v.member_id, min(v.decided_at) as min_decided from public.verification_requests v
      where v.level = 1 and v.status = 'approved' and v.member_id::text not like '00000000-0000-0000-0000-0000000048%'
      group by v.member_id) x
group by 1;
grant select on pg_temp.baseline to authenticated;

create function pg_temp.mine() returns int[] language sql as $$
  select array_agg(w.new_members - coalesce(base.n, 0) order by w.week_start)
  from public.weekly_new_members() w
  left join pg_temp.baseline base on base.week_start = w.week_start;
$$;


set local role authenticated;
select pg_temp.login('a1');
select is((select count(*)::int from public.weekly_new_members()), 8, 'staff get the last 8 weeks');
select is((select max(week_start) from public.weekly_new_members()), current_setting('test.week')::date, 'ending this week');
select is((select min(week_start) from public.weekly_new_members()), current_setting('test.week')::date - 49, 'starting 7 weeks before');
select is(pg_temp.mine(), array[0, 0, 0, 0, 0, 1, 0, 2],
  'each member counts once, in the week of their first approved identity check; business levels do not count');
select is((select count(*)::int from public.weekly_new_members(12)), 12, 'staff can ask for more weeks');
select is((select count(*)::int from public.weekly_new_members(500)), 52, 'up to a year');

select pg_temp.login('01');
select is((select count(*)::int from public.weekly_new_members()), 0, 'a member never gets the figure');

set local role anon;
select throws_ok($$select * from public.weekly_new_members()$$, '42501', null, 'nor does a signed-out visitor');

select * from finish();
rollback;
