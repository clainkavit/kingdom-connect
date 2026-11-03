begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(30);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'owner@test.invalid'),
  ('00000000-0000-0000-0000-0000000000f2', 'friend@test.invalid'),
  ('00000000-0000-0000-0000-0000000000f3', 'stranger@test.invalid'),
  ('00000000-0000-0000-0000-0000000000f4', 'blocked@test.invalid'),
  ('00000000-0000-0000-0000-0000000000f5', 'staff@test.invalid');
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-0000000000f1', 'prof_owner', 'approved'),
  ('00000000-0000-0000-0000-0000000000f2', 'prof_friend', 'approved'),
  ('00000000-0000-0000-0000-0000000000f3', 'prof_stranger', 'approved'),
  ('00000000-0000-0000-0000-0000000000f4', 'prof_blocked', 'approved');
insert into public.member_private (member_id, email, phone) values
  ('00000000-0000-0000-0000-0000000000f1', 'owner@test.invalid', '+255700000031');
insert into public.profiles (member_id, full_name) values
  ('00000000-0000-0000-0000-0000000000f1', 'Profile Owner'),
  ('00000000-0000-0000-0000-0000000000f2', 'Profile Friend'),
  ('00000000-0000-0000-0000-0000000000f3', 'Profile Stranger'),
  ('00000000-0000-0000-0000-0000000000f4', 'Profile Blocked');
insert into public.staff (id, full_name, role) values ('00000000-0000-0000-0000-0000000000f5', 'Profile Staff', 'admin');
insert into public.connections (member_a, member_b)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2');
insert into public.blocks (blocker_id, blocked_id)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f4');

select is(private.set_skills('00000000-0000-0000-0000-0000000000f1', array[' Project  Management ', 'EXCEL', 'excel', '']),
  'ok', 'skills are saved');
select is((select array_agg(s.name::text order by s.name) from public.profile_skills ps join public.skills s on s.id = ps.skill_id
           where ps.member_id = '00000000-0000-0000-0000-0000000000f1'),
  array['excel', 'project management'], 'tags are lowercased, trimmed, spaced once and kept once');
select is(private.set_skills('00000000-0000-0000-0000-0000000000f1', array(select 'skill ' || g from generate_series(1, 21) g)),
  'too_many', 'at most 20 skills');
select is(private.set_skills('00000000-0000-0000-0000-0000000000f1', array[repeat('a', 41)]), 'too_long',
  'each skill is at most 40 characters');
select is(private.set_skills('00000000-0000-0000-0000-0000000000f5', array['x']), 'not_a_member',
  'staff have no member profile to add skills to');

insert into public.skills (name) values ('javascript');
insert into public.skill_synonyms (from_name, skill_id) select 'js', id from public.skills where name = 'javascript';
select is(private.set_skills('00000000-0000-0000-0000-0000000000f2', array['JS']), 'ok', 'a synonym is accepted');
select is((select s.name::text from public.profile_skills ps join public.skills s on s.id = ps.skill_id
           where ps.member_id = '00000000-0000-0000-0000-0000000000f2'),
  'javascript', 'and saved as the skill it stands for');

select is(private.set_skills('00000000-0000-0000-0000-0000000000f3', array['ms excel']), 'ok', 'a new tag becomes a new skill');
insert into public.skill_synonyms (from_name, skill_id) select 'ms excel', id from public.skills where name = 'excel';
select is((select s.name::text from public.profile_skills ps join public.skills s on s.id = ps.skill_id
           where ps.member_id = '00000000-0000-0000-0000-0000000000f3'),
  'excel', 'adding a synonym merges profiles that used the variant');
select is((select count(*)::int from public.skills where name = 'ms excel'), 0, 'and removes the variant skill');
select throws_ok($$insert into public.skill_synonyms (from_name, skill_id) select 'excel', id from public.skills where name = 'excel'$$,
  '22023', null, 'a skill cannot be a synonym of itself');
insert into public.skill_synonyms (from_name, skill_id) select 'xls', id from public.skills where name = 'excel';
select is((select s.name::text from public.skill_synonyms y join public.skills s on s.id = y.skill_id where y.from_name = 'xls'),
  'excel', 'a synonym points at a real skill');
select throws_ok($$insert into public.skills (name) values ('xls')$$, '23505', null,
  'a skill cannot take the name of a synonym, so chains cannot break');
select throws_ok($$insert into public.skill_synonyms (from_name, skill_id) select 'Two  Spaces', id from public.skills where name = 'excel'$$,
  '23514', null, 'a synonym is a tidy tag like any skill');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000f5", "role": "authenticated", "otp_verified": true}', true);
insert into public.skill_synonyms (from_name, skill_id) select 'spreadsheets', id from public.skills where name = 'excel';
reset role;
select is((select count(*)::int from private.audit_log
           where action = 'skill_synonyms.insert' and actor_staff_id = '00000000-0000-0000-0000-0000000000f5'), 1,
  'an Administrator adds a synonym, and it is in the audit log');
set local role authenticated;

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000f3", "role": "authenticated", "otp_verified": true}', true);
select throws_ok($$insert into public.skill_synonyms (from_name, skill_id) select 'sheets', id from public.skills where name = 'excel'$$,
  '42501', null, 'a member cannot add a synonym');
select throws_ok($$insert into public.profile_skills (member_id, skill_id) select '00000000-0000-0000-0000-0000000000f3', id from public.skills limit 1$$,
  '42501', null, 'a member cannot add skills except through set_skills()');

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated", "otp_verified": true}', true);
update public.profiles set headline = 'Accountant in Mwanza', hidden_from_directory = true
where member_id = '00000000-0000-0000-0000-0000000000f1';
select is((select headline from public.profiles where member_id = '00000000-0000-0000-0000-0000000000f1'),
  'Accountant in Mwanza', 'the owner edits their profile');
select throws_ok($$update public.profiles set full_name = 'Someone Else' where member_id = '00000000-0000-0000-0000-0000000000f1'$$,
  '42501', null, 'the verified full name is locked');
select throws_ok($$update public.profiles set headline = repeat('x', 121) where member_id = '00000000-0000-0000-0000-0000000000f1'$$,
  '23514', null, 'a headline is at most 120 characters');
select throws_ok($$update public.profiles set photo_path = '00000000-0000-0000-0000-0000000000f2/photo' where member_id = '00000000-0000-0000-0000-0000000000f1'$$,
  '23514', null, 'the photo must be the owner''s own');
select is((select count(*)::int from public.profiles where member_id = '00000000-0000-0000-0000-0000000000f1'), 1,
  'the owner sees their own hidden profile');

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000f2", "role": "authenticated", "otp_verified": true}', true);
select is((select count(*)::int from public.profiles where member_id = '00000000-0000-0000-0000-0000000000f1'), 1,
  'a connection sees a hidden profile');
select is((select count(*)::int from public.member_private where member_id = '00000000-0000-0000-0000-0000000000f1'), 0,
  'but never its contact details');

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000f3", "role": "authenticated", "otp_verified": true}', true);
select is((select count(*)::int from public.profiles where member_id = '00000000-0000-0000-0000-0000000000f1'), 0,
  'another member does not see a hidden profile');
select is((select count(*)::int from public.profile_skills where member_id = '00000000-0000-0000-0000-0000000000f1'), 0,
  'or its skills');

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000f4", "role": "authenticated", "otp_verified": true}', true);
reset role;
update public.profiles set hidden_from_directory = false where member_id = '00000000-0000-0000-0000-0000000000f1';
insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-0000-0000-0000000000f1/photo');
set local role authenticated;
select is((select count(*)::int from public.profiles where member_id = '00000000-0000-0000-0000-0000000000f1'), 0,
  'a blocked member does not see the profile, even when it is listed');
select is((select count(*)::int from storage.objects where bucket_id = 'avatars'), 0, 'or its photo');

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000f3", "role": "authenticated", "otp_verified": true}', true);
select is((select count(*)::int from storage.objects where bucket_id = 'avatars'), 1,
  'a member who can see the profile can open its photo');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-0000-0000-0000000000f1/photo2')$$,
  '42501', null, 'a member stores only their own photo');
reset role;

select * from finish();
rollback;
