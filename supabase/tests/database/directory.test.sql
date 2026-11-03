begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(21);

insert into auth.users (id, email) select ('00000000-0000-0000-0000-0000000001' || n)::uuid, 'dir' || n || '@test.invalid'
from unnest(array['01', '02', '03', '04', '05', '06', '07']) n;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000000101', 'dir_me', 'approved'),
  ('00000000-0000-0000-0000-000000000102', 'dir_listed', 'approved'),
  ('00000000-0000-0000-0000-000000000103', 'dir_hidden', 'approved'),
  ('00000000-0000-0000-0000-000000000104', 'dir_blocked', 'approved'),
  ('00000000-0000-0000-0000-000000000105', 'dir_student', 'approved'),
  ('00000000-0000-0000-0000-000000000106', 'dir_pending', 'pending'),
  ('00000000-0000-0000-0000-000000000107', 'dir_i_blocked', 'approved');
insert into public.member_private (member_id, email, phone) values
  ('00000000-0000-0000-0000-000000000102', 'dir02@test.invalid', '+255700000102');
insert into public.profiles (member_id, full_name, headline, profession, region_id, district_id, hidden_from_directory, study_institution)
select m, n, 'Headline of ' || n, prof, d.region_id, d.id, hidden, inst
from (values
  ('00000000-0000-0000-0000-000000000101'::uuid, 'Dir Me', 'Nurse', false, null),
  ('00000000-0000-0000-0000-000000000102'::uuid, 'Zawadi Listed', 'Accountant', false, null),
  ('00000000-0000-0000-0000-000000000103'::uuid, 'Hidden Friend', 'Accountant', true, null),
  ('00000000-0000-0000-0000-000000000104'::uuid, 'Blocked Person', 'Accountant', false, null),
  ('00000000-0000-0000-0000-000000000105'::uuid, 'Student Person', 'Intern', false, 'Test College'),
  ('00000000-0000-0000-0000-000000000106'::uuid, 'Pending Person', 'Accountant', false, null),
  ('00000000-0000-0000-0000-000000000107'::uuid, 'I Blocked', 'Accountant', false, null)
) v (m, n, prof, hidden, inst),
lateral (select id, region_id from public.districts order by name_en limit 1) d;
update public.profiles set region_id = null, district_id = null where member_id = '00000000-0000-0000-0000-000000000105';
insert into public.connections (member_a, member_b)
  values ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000103');
insert into public.blocks (blocker_id, blocked_id) values
  ('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000107');
select is(private.set_skills('00000000-0000-0000-0000-000000000102', array['bookkeeping', 'excel', 'tax', 'audit']), 'ok', 'fixture skills');
insert into public.skills (name) values ('javascript') on conflict do nothing;
insert into public.skill_synonyms (from_name, skill_id) select 'dir js', id from public.skills where name = 'javascript';
select is(private.set_skills('00000000-0000-0000-0000-000000000105', array['javascript']), 'ok', 'fixture skill');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-000000000101", "role": "authenticated", "otp_verified": true}', true);

select ok('00000000-0000-0000-0000-000000000102' = any(array(select member_id from public.search_directory())),
  'a listed member appears');
select ok(not ('00000000-0000-0000-0000-000000000103' = any(array(select member_id from public.search_directory()))),
  'a hidden profile is not listed, even for a connection');
select ok(not ('00000000-0000-0000-0000-000000000104' = any(array(select member_id from public.search_directory()))),
  'a member who blocked you is not listed');
select ok(not ('00000000-0000-0000-0000-000000000107' = any(array(select member_id from public.search_directory()))),
  'a member you blocked is not listed');
select ok(not exists (select 1 from public.search_directory() r
                      where row_to_json(r)::text ~ '(dir02@test\.invalid|\+255700000102)'),
  'no contact value comes back, either');
select ok('00000000-0000-0000-0000-000000000105' = any(array(select member_id from public.search_directory(q => 'dir js'))),
  'the search box finds a skill through its synonym');
select is((select count(*)::int from public.search_directory(q => '%')), 0,
  'a % in the search is a character, not a wildcard');
select is(access.like_pattern('a\%b_'), '%a\\\%b\_%',
  'a backslash in the search is escaped too');
select ok(not ('00000000-0000-0000-0000-000000000106' = any(array(select member_id from public.search_directory()))),
  'an applicant is not listed');
select ok(not ('00000000-0000-0000-0000-000000000101' = any(array(select member_id from public.search_directory()))),
  'you are not listed to yourself');
select ok(not exists (select 1 from pg_proc p, unnest(p.proargnames) a
                   where p.proname = 'search_directory' and a ~ '(email|phone|address|share_)'),
  'no contact field is in the result');
select is((select top_skills from public.search_directory(q => 'tax')), array['tax', 'audit', 'bookkeeping'],
  'top 3 skills, the matching one first');
select is((select array_agg(member_id) from public.search_directory(q => 'zawadi')),
  array['00000000-0000-0000-0000-000000000102'::uuid], 'search matches the name');
select is((select array_agg(member_id) from public.search_directory(profession => 'INTERN')),
  array['00000000-0000-0000-0000-000000000105'::uuid], 'filter by profession');
select is((select array_agg(member_id) from public.search_directory(skill => 'DIR JS')),
  array['00000000-0000-0000-0000-000000000105'::uuid], 'filter by skill, through its synonym');
select is((select array_agg(member_id) from public.search_directory(studying => true)),
  array['00000000-0000-0000-0000-000000000105'::uuid], 'filter by currently studying');
select is((select count(*)::int from public.search_directory(region => (select region_id from public.profiles where member_id = '00000000-0000-0000-0000-000000000102'))
           where member_id = '00000000-0000-0000-0000-000000000105'), 0, 'filter by region');
select is(array(select member_id from public.search_directory()), array(select member_id from public.search_directory()),
  'the order holds between calls on the same day');
reset role;
select throws_ok($$set local role anon; select * from public.search_directory()$$, '42501', null,
  'signed-out visitors cannot search the directory');

select * from finish();
rollback;
