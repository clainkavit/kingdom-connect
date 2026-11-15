begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000007301', 'pa1@test.invalid'), ('00000000-0000-0000-0000-000000007302', 'pa2@test.invalid'),
  ('00000000-0000-0000-0000-0000000073a1', 'pa-staff@test.invalid');
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000007301', 'pa_poster', 'approved'),
  ('00000000-0000-0000-0000-000000007302', 'pa_member', 'approved');
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000073a1', 'PA Staff', 'admin', true);
insert into public.opportunities (id, poster_member_id, type, title, status)
values ('00000000-0000-0000-0073-00000000000a', '00000000-0000-0000-0000-000000007301', 'job', 'PA post', 'draft');
insert into public.pick_requests (id, opportunity_id, wanted, status)
values ('00000000-0000-0000-0073-0000000000b1', '00000000-0000-0000-0073-00000000000a', 5, 'asking');
insert into public.picks (request_id, member_id, picked_by, why, rank)
values ('00000000-0000-0000-0073-0000000000b1', '00000000-0000-0000-0000-000000007302',
        '00000000-0000-0000-0000-0000000073a1', 'Careful worker.', 1);

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000073' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
set local role authenticated;
select pg_temp.login('01');
select throws_ok($$ select * from public.pick_people('00000000-0000-0000-0073-0000000000b1') $$, 'not_allowed',
  'the poster cannot see who was asked');
select throws_ok($$ select * from public.pick_member_by_username('pa_member') $$, 'not_allowed',
  'members cannot look people up for picks');
select pg_temp.login('a1');
select is((select status from public.pick_people('00000000-0000-0000-0073-0000000000b1')), 'asked',
  'staff see each asked member and their answer');
select is((select member_id from public.pick_member_by_username(' PA_member ')),
  '00000000-0000-0000-0000-000000007302'::uuid, 'staff add a member by username');

select * from finish();
rollback;
