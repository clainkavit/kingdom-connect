begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(8);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000008' || k)::uuid, 'md' || k || '@test.invalid'
from unnest(array['01', '02', '03', 'a1']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000000801', 'md_member', 'approved'),
  ('00000000-0000-0000-0000-000000000802', 'md_poster', 'approved'),
  ('00000000-0000-0000-0000-000000000803', 'md_applicant', 'pending');
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000008a1', 'Dash Admin', 'admin', true);
insert into public.profiles (member_id, full_name, region_id, district_id)
select '00000000-0000-0000-0000-000000000801', 'Dash Member', d.region_id, d.id
from public.districts d order by d.id limit 1;
insert into public.verification_requests (member_id, level, status)
  values ('00000000-0000-0000-0000-000000000802', 3, 'approved');
update public.members set posting_suspended_until = 'infinity' where id = '00000000-0000-0000-0000-000000000802';

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000008' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;

select is((select array_agg(p.parameter_name::text order by p.ordinal_position)
           from information_schema.routines r join information_schema.parameters p on p.specific_name = r.specific_name
           where r.routine_schema = 'public' and r.routine_name = 'member_dashboard' and p.parameter_mode = 'OUT'),
  array['full_name', 'region_en', 'region_sw', 'district_en', 'district_sw', 'level', 'posting_paused'],
  'the dashboard returns the member''s own welcome details and level only, never a count (PRD section 7, criterion 1)');

set local role authenticated;
select pg_temp.login('01');
select is((select row(full_name, level)::text from public.member_dashboard()), '("Dash Member",1)',
  'a member gets their own name and level');
select ok((select region_en is not null and district_sw is not null from public.member_dashboard()),
  'with their region and district in both languages');
select pg_temp.login('02');
select is((select level from public.member_dashboard()), 3, 'a Level 3 poster gets level 3');
select is((select posting_paused from public.member_dashboard()), true, 'and whether their posting is paused');
select pg_temp.login('03');
select is((select count(*)::int from public.member_dashboard()), 0, 'an Applicant gets nothing');
select pg_temp.login('a1');
select is((select count(*)::int from public.member_dashboard()), 0, 'nor does staff');

set local role anon;
select throws_ok($$select * from public.member_dashboard()$$, '42501', null, 'a visitor cannot call it');

select * from finish();
rollback;
