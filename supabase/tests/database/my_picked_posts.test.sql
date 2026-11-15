begin;
create extension if not exists pgtap with schema extensions;
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(2);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000007201', 'mpp1@test.invalid'), ('00000000-0000-0000-0000-000000007202', 'mpp2@test.invalid');
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000007201', 'mpp_poster', 'approved'),
  ('00000000-0000-0000-0000-000000007202', 'mpp_other', 'approved');
insert into public.opportunities (id, poster_member_id, type, title, status)
values ('00000000-0000-0000-0072-00000000000a', '00000000-0000-0000-0000-000000007201', 'job', 'MPP post', 'draft');
insert into public.pick_requests (opportunity_id, wanted) values ('00000000-0000-0000-0072-00000000000a', 5);

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000072' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
set local role authenticated;
select pg_temp.login('01');
select is((select status from public.my_picked_posts()), 'waiting', 'the poster sees their picked post');
select pg_temp.login('02');
select is((select count(*)::int from public.my_picked_posts()), 0, 'nobody else does');

select * from finish();
rollback;
