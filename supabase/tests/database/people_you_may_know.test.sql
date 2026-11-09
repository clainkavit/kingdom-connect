begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(18);

select set_config('test.region', (select id::text from public.regions where name_en = 'Mwanza'), true);
select set_config('test.district', (select id::text from public.districts
                                     where region_id = current_setting('test.region')::uuid order by name_en limit 1), true);

-- 01 is the member. 02 is the hub they are connected to. 03 to 12 are candidates, 13 has an empty profile.
insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000039' || k)::uuid, 'pk' || k || '@test.invalid'
from unnest(array['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13']) k;
insert into public.members (id, username, status, approved_at)
select ('00000000-0000-0000-0000-0000000039' || k)::uuid, 'pk_' || k,
       case when k = '11' then 'suspended' else 'approved' end, now() - make_interval(days => k::int)
from unnest(array['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13']) k;
insert into public.member_private (member_id, phone, email, language)
select ('00000000-0000-0000-0000-0000000039' || k)::uuid, '+2557120039' || k, 'pk' || k || '@test.invalid', 'en'
from unnest(array['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13']) k;
insert into public.verification_requests (member_id, level, status, submitted_at, decided_at)
select ('00000000-0000-0000-0000-0000000039' || k)::uuid, 1, 'approved', now(), now()
from unnest(array['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13']) k;
insert into public.skills (name) values ('accounting'), ('auditing'), ('tax') on conflict (name) do nothing;

insert into public.profiles (member_id, full_name, region_id, district_id, profession, study_institution, study_course,
                             hidden_from_directory, last_active_at) values
  ('00000000-0000-0000-0000-000000003901', 'Me', current_setting('test.region')::uuid, current_setting('test.district')::uuid,
   'nurse', 'Shihezi University', 'Medicine', false, now()),
  ('00000000-0000-0000-0000-000000003902', 'Hub Member', current_setting('test.region')::uuid, null, null, null, null, false, now()),
  -- 03: mutual connection, two shared skills, same district
  ('00000000-0000-0000-0000-000000003903', 'Candidate P1', current_setting('test.region')::uuid, current_setting('test.district')::uuid,
   null, null, null, false, now() - interval '5 days'),
  -- 04: same profession and same institution
  ('00000000-0000-0000-0000-000000003904', 'Candidate P2', null, null, 'Nurse', 'shihezi university', 'Medicine', false, now() - interval '3 days'),
  -- 05: same region only, under the minimum
  ('00000000-0000-0000-0000-000000003905', 'Candidate P3', current_setting('test.region')::uuid, null, null, null, null, false, now()),
  -- 06: hidden from the directory, two shared skills
  ('00000000-0000-0000-0000-000000003906', 'Hidden P4', null, null, null, null, null, true, now()),
  -- 07: blocked by the member
  ('00000000-0000-0000-0000-000000003907', 'Blocked P5', null, null, 'nurse', null, null, false, now()),
  -- 08: the member has a pending request to them
  ('00000000-0000-0000-0000-000000003908', 'Pending P6', null, null, 'nurse', null, null, false, now()),
  -- 09: declined the member 30 days ago
  ('00000000-0000-0000-0000-000000003909', 'Declined P7', null, null, 'nurse', null, null, false, now()),
  -- 10: declined the member 100 days ago, two shared skills
  ('00000000-0000-0000-0000-000000003910', 'Old decline P8', null, null, null, null, null, false, now() - interval '1 day'),
  -- 11: suspended
  ('00000000-0000-0000-0000-000000003911', 'Suspended P9', null, null, 'nurse', null, null, false, now()),
  -- 12: the member declined their request 20 days ago
  ('00000000-0000-0000-0000-000000003912', 'Declined by me P10', null, null, 'nurse', null, null, false, now()),
  ('00000000-0000-0000-0000-000000003913', 'Empty Member', current_setting('test.region')::uuid, null, null, null, null, false, now());
insert into public.profile_skills (member_id, skill_id)
select ('00000000-0000-0000-0000-0000000039' || k)::uuid, s.id
from unnest(array['01', '03', '06', '10']) k, public.skills s where s.name in ('accounting', 'auditing');
insert into public.connections (member_a, member_b) values
  ('00000000-0000-0000-0000-000000003901', '00000000-0000-0000-0000-000000003902'),
  ('00000000-0000-0000-0000-000000003902', '00000000-0000-0000-0000-000000003903');
insert into public.blocks (blocker_id, blocked_id)
  values ('00000000-0000-0000-0000-000000003901', '00000000-0000-0000-0000-000000003907');
insert into public.connection_requests (requester_id, receiver_id, status, responded_at) values
  ('00000000-0000-0000-0000-000000003901', '00000000-0000-0000-0000-000000003908', 'sent', null),
  ('00000000-0000-0000-0000-000000003901', '00000000-0000-0000-0000-000000003909', 'declined', now() - interval '30 days'),
  ('00000000-0000-0000-0000-000000003901', '00000000-0000-0000-0000-000000003910', 'declined', now() - interval '100 days'),
  ('00000000-0000-0000-0000-000000003912', '00000000-0000-0000-0000-000000003901', 'declined', now() - interval '20 days');
set local session_replication_role = replica;
update public.connection_requests set status = 'declined', responded_at = now() - interval '30 days'
where receiver_id = '00000000-0000-0000-0000-000000003909';
update public.connection_requests set status = 'declined', responded_at = now() - interval '100 days'
where receiver_id = '00000000-0000-0000-0000-000000003910';
update public.connection_requests set status = 'declined', responded_at = now() - interval '20 days'
where requester_id = '00000000-0000-0000-0000-000000003912';
set local session_replication_role = origin;

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000039' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;

set local role authenticated;
select pg_temp.login('01');
select is((select string_agg(full_name, ', ') from (select full_name from public.people_you_may_know()
                                                       where member_id::text like '00000000-0000-0000-0000-0000000039%') x),
  'Candidate P1, Old decline P8, Candidate P2',
  'suggestions come best first, ties to the most recently active, without the connected, hidden, blocked, pending, declined, suspended or weak');
select is((select string_agg(score::text, ',' order by score desc) from public.people_you_may_know()), '50,20,20',
  'scores follow the weights: mutual 15 each, skills 10 each, district 15, profession 10, study 10');
select is((select reasons -> 0 ->> 'code' || ',' || (reasons -> 1 ->> 'code') from public.people_you_may_know()
           where full_name = 'Candidate P1'), 'skills,mutual', 'the top two reasons come as codes');
select is((select reasons -> 1 -> 'detail' from public.people_you_may_know() where full_name = 'Candidate P1'),
  '{"count": 1}'::jsonb, 'a mutual connection shows as a count only');
select is((select mutual_connections from public.people_you_may_know() where full_name = 'Candidate P1'), 1,
  'with the same count beside the row');
select is((select position('Hub Member' in people_you_may_know::text) from public.people_you_may_know() where full_name = 'Candidate P1'),
  0, 'the mutual connection''s name is never returned');
select is((select reasons -> 0 ->> 'code' || ',' || (reasons -> 1 ->> 'code') from public.people_you_may_know()
           where full_name = 'Candidate P2'), 'profession,study', 'same profession and institution are reasons');
select is((select count(*)::int from public.people_you_may_know() where full_name = 'Candidate P3'), 0,
  'the same region alone is under the minimum');
select is((select count(*)::int from public.people_you_may_know(2)), 2, 'a row limit applies');

select pg_temp.login('13');
select is((select string_agg(full_name, ', ') from (select full_name from public.people_you_may_know()
                                                       where member_id::text like '00000000-0000-0000-0000-0000000039%') x),
  'Me, Hub Member, Candidate P1, Candidate P3',
  'a member with an empty profile gets the newest verified members in their region');
select is((select reasons -> 0 ->> 'code' from public.people_you_may_know()
           where member_id::text like '00000000-0000-0000-0000-0000000039%' limit 1), 'newest_in_region', 'with that as the reason');

select pg_temp.login('01');
select is((select count(*)::int from public.people_you_may_know() where full_name in ('Hub Member')), 0,
  'a connection is never suggested');

reset role;
select is((select count(*)::int from public.matching_settings where feature = 'people'), 9, 'the people weights are stored');
set local role authenticated;
select pg_temp.login('01');
select is((select count(*)::int from public.matching_settings_list()), 0, 'and not readable by members');

reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000039a2', 'pka2@test.invalid');
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000039a2', 'People Super', 'super_admin', true);
set local role authenticated;
select pg_temp.login('a2');
select is(public.set_matching_setting('people', 'mutual_max', 11), 'invalid_points', 'the mutual count is 1 to 10');
select is(public.set_matching_setting('people', 'minimum', 60), 'ok', 'a Super Administrator changes a people weight');
select pg_temp.login('01');
select is((select count(*)::int from public.people_you_may_know()), 0, 'which applies at once');

set local role anon;
select throws_ok($$select * from public.people_you_may_know()$$, '42501', null, 'a signed-out visitor cannot ask');

select * from finish();
rollback;
