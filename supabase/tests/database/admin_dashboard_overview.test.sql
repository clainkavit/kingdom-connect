begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000061a1', 'ov-staff@test.invalid'),
  ('00000000-0000-0000-0000-000000006101', 'ov-member@test.invalid');
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000061a1', 'Overview Staff', 'admin', true);
insert into public.members (id, username, status) values ('00000000-0000-0000-0000-000000006101', 'ov_member', 'approved');

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000061' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;

set local role authenticated;
select pg_temp.login('01');
select throws_ok($$ select * from public.admin_dashboard_overview() $$, 'not_allowed',
  'a member cannot read the staff overview');

select pg_temp.login('a1');
select is((select staff_name from public.admin_dashboard_overview()), 'Overview Staff', 'staff are greeted by name');
reset role;
select is((select count(*)::int from access.admin_dashboard_overview() o
           where o.open_jobs is not null and o.published_ideas is not null), 1,
  'one row of counts');
select ok((select o.registered_businesses >= 0 and o.pending_investor >= 0 from access.admin_dashboard_overview() o),
  'counts are never negative');

select * from finish();
rollback;
