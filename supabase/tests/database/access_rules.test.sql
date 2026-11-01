-- Access-rule tests for the core tables (docs/schema.md sections 2, 3, 5 and 6; PRD section 17).
-- Every "who can read" cell gets a check signed in as the right person and as the wrong one.
begin;
create extension if not exists pgtap with schema extensions;
select plan(86);

-- People, one per role. Fixed ids so the checks below read plainly.
--   applicant  ...0a  pending
--   m1, m2     ...01, ...02  approved
--   m3         ...03  approved, profile hidden, connected to m1
--   m4         ...04  approved, has blocked m1
--   suspended  ...05
--   investor   ...06  approved, investor flag
--   unused     ...0b  a sign-in account with no member or staff row
--   admin      ...a1, super admin ...a2, inactive admin ...a3
insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000000' || k)::uuid, k || '@test.invalid'
from unnest(array['0a', '0b', '01', '02', '03', '04', '05', '06', 'a1', 'a2', 'a3']) k;

insert into public.members (id, username, status, category) values
  ('00000000-0000-0000-0000-00000000000a', 'applicant', 'pending', 'professional'),
  ('00000000-0000-0000-0000-000000000001', 'member_one', 'approved', 'professional'),
  ('00000000-0000-0000-0000-000000000002', 'member_two', 'approved', 'businessperson'),
  ('00000000-0000-0000-0000-000000000003', 'member_three', 'approved', 'entrepreneur'),
  ('00000000-0000-0000-0000-000000000004', 'member_four', 'approved', 'other'),
  ('00000000-0000-0000-0000-000000000005', 'suspended', 'suspended', 'other'),
  ('00000000-0000-0000-0000-000000000006', 'investor', 'approved', 'businessperson');

insert into public.staff (id, full_name, role, active) values
  ('00000000-0000-0000-0000-0000000000a1', 'Test Admin', 'admin', true),
  ('00000000-0000-0000-0000-0000000000a2', 'Test Super Admin', 'super_admin', true),
  ('00000000-0000-0000-0000-0000000000a3', 'Test Former Admin', 'admin', false);

insert into public.profiles (member_id, full_name, hidden_from_directory)
select id, 'Fake ' || username, username = 'member_three' from public.members;

insert into public.member_private (member_id, email, phone)
select id, username || '@test.invalid', '+255700000' || lpad((row_number() over (order by id))::text, 3, '0')
from public.members;

insert into public.connections (member_a, member_b) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003');
insert into public.blocks (blocker_id, blocked_id) values
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001');
insert into public.investor_flags (member_id, granted_by, route, ticket_band) values
  ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000a1', 'invitation', 'under_10m'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'application', 'over_50m');
insert into public.verification_requests (member_id, level, status) values
  ('00000000-0000-0000-0000-000000000001', 1, 'approved'),
  ('00000000-0000-0000-0000-000000000002', 1, 'approved'),
  ('00000000-0000-0000-0000-000000000002', 2, 'approved'),
  ('00000000-0000-0000-0000-000000000002', 3, 'pending'),
  ('00000000-0000-0000-0000-00000000000a', 1, 'pending');

insert into public.skills (name) values ('nursing'), ('accounting');
insert into public.skill_synonyms (from_name, skill_id) select 'bookkeeping', id from public.skills where name = 'accounting';
insert into public.profile_skills (member_id, skill_id)
select m, s.id from public.skills s,
  unnest(array['00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a']::uuid[]) m
where s.name = 'nursing';

-- Sign in as someone: an authenticated session with the given email-code state.
create function pg_temp.login(who text, otp boolean default true) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-0000000000' || who, 'role', 'authenticated', 'otp_verified', otp)::text, true);
  select set_config('role', 'authenticated', true);
$$;
-- Run a write and return how many rows it touched (RLS hides rows rather than raising).
create function pg_temp.touched(q text) returns int language plpgsql as $$
declare n int;
begin
  execute q;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------- the base rule
select pg_temp.login('01', otp => false);
select is((select count(*)::int from public.members), 0, 'password-only session: reads no members');
select is((select count(*)::int from public.profiles), 0, 'password-only session: reads no profiles');
select is((select count(*)::int from public.member_private), 0, 'password-only session: reads no private data');

select pg_temp.login('0a');
select is((select count(*)::int from public.members), 0, 'applicant: reads no members, not even their own row');
select is((select count(*)::int from public.profiles), 0, 'applicant: reads no profiles');
select is((select count(*)::int from public.skills), 0, 'applicant: reads no skills');
select is((select count(*)::int from public.skill_synonyms), 0, 'applicant: reads no skill synonyms');
select throws_ok($$select * from private.audit_log$$, '42501', null, 'signed-in user: cannot read the audit log');

select pg_temp.login('05');
select is((select count(*)::int from public.profiles), 0, 'suspended member: reads no profiles');
select is((select count(*)::int from public.member_private), 0, 'suspended member: reads no private data');

select pg_temp.login('a3');
select is((select count(*)::int from public.members), 0, 'inactive staff: reads no members');
select is((select count(*)::int from public.staff), 0, 'inactive staff: reads no staff');

reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok($$select * from public.members$$, '42501', null, 'signed-out visitor: refused members');
select throws_ok($$select * from public.profiles$$, '42501', null, 'signed-out visitor: refused profiles');
select throws_ok($$select * from public.regions$$, '42501', null, 'signed-out visitor: refused regions');
reset role;

-- ---------------------------------------------------------------- members
select pg_temp.login('01');
select is((select count(*)::int from public.members), 1, 'member: sees only their own members row');
select is((select username::text from public.members), 'member_one', 'member: the row they see is their own');
select is(pg_temp.touched($$update public.members set status = 'approved' where id = '00000000-0000-0000-0000-00000000000a'$$), 0,
  'member: cannot approve another account');
select throws_ok($$update public.members set username = 'renamed' where id = '00000000-0000-0000-0000-000000000001'$$, '42501', null,
  'member: cannot change their own members row');
select pg_temp.login('a1');
select is((select count(*)::int from public.members), 7, 'staff: see every members row');
select is(pg_temp.touched($$update public.members set status = 'rejected' where id = '00000000-0000-0000-0000-00000000000a'$$), 1,
  'staff: can change a member''s status');

-- ---------------------------------------------------------------- staff
select pg_temp.login('01');
select is((select count(*)::int from public.staff), 0, 'member: sees no staff accounts');
select pg_temp.login('a1');
select is((select count(*)::int from public.staff), 3, 'staff: see the staff accounts');
select throws_ok($$insert into public.staff (id, full_name, role) values ('00000000-0000-0000-0000-00000000000b', 'X', 'admin')$$, '42501', null,
  'admin: cannot create a staff account');
select is(pg_temp.touched($$update public.staff set role = 'super_admin' where id = '00000000-0000-0000-0000-0000000000a1'$$), 0,
  'admin: cannot promote themselves');
select pg_temp.login('a2');
select is(pg_temp.touched($$update public.staff set active = true where id = '00000000-0000-0000-0000-0000000000a3'$$), 1,
  'super admin: can reactivate a staff account');
select pg_temp.login('a3');
select is((select count(*)::int from public.staff), 3, 'reactivated staff: the base rule lets them back in');
select pg_temp.login('a2');
select is(pg_temp.touched($$update public.staff set active = false where id = '00000000-0000-0000-0000-0000000000a3'$$), 1,
  'super admin: can deactivate a staff account');

-- ---------------------------------------------------------------- profiles and profile_skills
select pg_temp.login('01');
select ok(exists(select 1 from public.profiles where member_id = '00000000-0000-0000-0000-000000000002'), 'member: sees another approved member''s profile');
select ok(not exists(select 1 from public.profiles where member_id = '00000000-0000-0000-0000-00000000000a'), 'member: does not see an applicant''s profile');
select ok(not exists(select 1 from public.profiles where member_id = '00000000-0000-0000-0000-000000000005'), 'member: does not see a suspended member''s profile');
select ok(exists(select 1 from public.profiles where member_id = '00000000-0000-0000-0000-000000000003'), 'member: sees a hidden profile of an existing connection');
select ok(not exists(select 1 from public.profiles where member_id = '00000000-0000-0000-0000-000000000004'), 'member: does not see the profile of someone who blocked them');
select ok(exists(select 1 from public.profile_skills where member_id = '00000000-0000-0000-0000-000000000002'), 'member: sees the skills of a visible profile');
select ok(not exists(select 1 from public.profile_skills where member_id in ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a')),
  'member: does not see the skills of a hidden-from-them profile');
select is(pg_temp.touched($$update public.profiles set headline = 'Hacked' where member_id = '00000000-0000-0000-0000-000000000002'$$), 0,
  'member: cannot edit another member''s profile');
select is(pg_temp.touched($$update public.profiles set headline = 'Nurse in Mwanza' where member_id = '00000000-0000-0000-0000-000000000001'$$), 1,
  'member: can edit their own profile');
select throws_ok($$insert into public.profile_skills (member_id, skill_id) select '00000000-0000-0000-0000-000000000002', id from public.skills limit 1$$, '42501', null,
  'member: cannot add a skill to another member''s profile');
select lives_ok($$insert into public.profile_skills (member_id, skill_id) select '00000000-0000-0000-0000-000000000001', id from public.skills where name = 'nursing'$$,
  'member: can add a skill to their own profile');

select pg_temp.login('02');
select ok(not exists(select 1 from public.profiles where member_id = '00000000-0000-0000-0000-000000000003'), 'member: does not see a hidden profile when not connected');
select ok(not exists(select 1 from public.profile_skills where member_id = '00000000-0000-0000-0000-000000000003'), 'member: does not see the skills of a hidden profile');

select pg_temp.login('03');
select ok(exists(select 1 from public.profiles where member_id = '00000000-0000-0000-0000-000000000003'), 'member: sees their own hidden profile');

select pg_temp.login('04');
select ok(not exists(select 1 from public.profiles where member_id = '00000000-0000-0000-0000-000000000001'), 'member: does not see the profile of someone they blocked');

select pg_temp.login('a1');
select is((select count(*)::int from public.profiles), 7, 'staff: see every profile, hidden and pending included');

-- ---------------------------------------------------------------- member_private
select pg_temp.login('01');
select is((select count(*)::int from public.member_private), 1, 'member: sees only their own private row');
select ok(not exists(select 1 from public.member_private where member_id = '00000000-0000-0000-0000-000000000003'),
  'member: does not see a connection''s private row (contact details go through get_contact_details)');
select is(pg_temp.touched($$update public.member_private set share_phone = true where member_id = '00000000-0000-0000-0000-000000000001'$$), 1,
  'member: can change their own sharing switches');
select is(pg_temp.touched($$update public.member_private set phone = '+255711111111' where member_id = '00000000-0000-0000-0000-000000000002'$$), 0,
  'member: cannot change another member''s phone');
select throws_ok($$update public.member_private set id_fingerprint = '\x00' where member_id = '00000000-0000-0000-0000-000000000001'$$, '42501', null,
  'member: cannot write their own ID fields (registration function only)');
select throws_ok($$update public.member_private set phone = '0711111111' where member_id = '00000000-0000-0000-0000-000000000001'$$, '23514', null,
  'a phone number must start with +255');
select pg_temp.login('a1');
select is((select count(*)::int from public.member_private), 7, 'staff: see every private row');

-- ---------------------------------------------------------------- investor_flags
select pg_temp.login('06');
select is((select count(*)::int from public.investor_flags), 1, 'investor: sees their own flag and no other investor''s');
select pg_temp.login('01');
select is((select count(*)::int from public.investor_flags), 0, 'member: sees no investor flags, not even a count');
select throws_ok($$insert into public.investor_flags (member_id, granted_by, route) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'application')$$,
  '42501', null, 'member: cannot grant themselves a flag');
select pg_temp.login('a1');
select is((select count(*)::int from public.investor_flags), 2, 'staff: see the investor flags');
select throws_ok($$insert into public.investor_flags (member_id, granted_by, route) values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 'invitation')$$,
  '42501', null, 'staff: cannot record someone else as the one who granted a flag');

-- ---------------------------------------------------------------- regions, districts, sectors, platform_settings
select pg_temp.login('0a');
select is((select count(*)::int from public.regions), 31, 'applicant: reads the 31 regions');
select is((select count(*)::int from public.districts), 150, 'applicant: reads the 150 districts');
select lives_ok($$select * from public.sectors$$, 'applicant: can read sectors');
select ok(exists(select 1 from public.platform_settings where key = 'featured_slot_limit'), 'applicant: reads platform settings');
select pg_temp.login('01', otp => false);
select is((select count(*)::int from public.regions), 31, 'password-only session: reads the regions for the address step');
select pg_temp.login('01');
select throws_ok($$insert into public.regions (name_en, name_sw) values ('Atlantis', 'Atlantis')$$, '42501', null, 'member: cannot add a region');
select pg_temp.login('0a');
select throws_ok($$insert into public.sectors (name_en, name_sw) values ('X', 'X')$$, '42501', null, 'applicant: cannot add a sector');
select pg_temp.login('a1');
select lives_ok($$insert into public.sectors (name_en, name_sw) values ('Test sector', 'Sekta ya majaribio')$$, 'staff: can add a sector');
select is(pg_temp.touched($$update public.platform_settings set value = '3' where key = 'featured_slot_limit'$$), 0,
  'admin: cannot change platform settings');
select pg_temp.login('a2');
select is(pg_temp.touched($$update public.platform_settings set value = '4' where key = 'featured_slot_limit'$$), 1,
  'super admin: can change platform settings');

-- ---------------------------------------------------------------- skills and skill_synonyms
select pg_temp.login('01');
select is((select count(*)::int from public.skills), 2, 'member: reads the skill list');
select is((select count(*)::int from public.skill_synonyms), 1, 'member: reads the synonym list');
select lives_ok($$insert into public.skills (name) values ('welding')$$, 'member: can create a new skill tag');
select throws_ok($$insert into public.skills (name) values ('Welding ')$$, '23514', null, 'a skill name must be lowercased and trimmed');
select is(pg_temp.touched($$update public.skills set name = 'nurse' where name = 'nursing'$$), 0, 'member: cannot rename a skill');
select throws_ok($$insert into public.skill_synonyms (from_name, skill_id) select 'nurse', id from public.skills where name = 'nursing'$$, '42501', null,
  'member: cannot add a synonym');
select pg_temp.login('a1');
select is(pg_temp.touched($$update public.skills set name = 'nurse' where name = 'nursing'$$), 1, 'staff: can merge or rename a skill');

-- ---------------------------------------------------------------- connections and blocks
select pg_temp.login('01');
select is((select count(*)::int from public.connections), 1, 'member: sees their own connection');
select is((select count(*)::int from public.blocks), 0, 'member: does not see that someone blocked them');
select pg_temp.login('02');
select is((select count(*)::int from public.connections), 0, 'member: does not see other people''s connections');
select pg_temp.login('04');
select is((select count(*)::int from public.blocks), 1, 'member: sees the blocks they made');
select pg_temp.login('a1');
select is((select count(*)::int from public.connections), 0, 'staff: do not see connections');

-- ---------------------------------------------------------------- verification_requests
select pg_temp.login('01');
select is((select count(*)::int from public.verification_requests), 0, 'member: no direct read of verification requests (my_application_status() only)');
select pg_temp.login('a1');
select is((select count(*)::int from public.verification_requests), 5, 'staff: see every verification request');

-- ---------------------------------------------------------------- helper functions
select pg_temp.login('01');
select ok(access.is_member(), 'is_member(): true for an approved member');
select ok(not access.is_staff(), 'is_staff(): false for a member');
select ok(access.is_connected('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003'), 'is_connected(): true for the two connected members');
select ok(access.is_blocked('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004'), 'is_blocked(): true either way round');
select pg_temp.login('02');
select is(access.member_level('00000000-0000-0000-0000-000000000002'), 2, 'member_level(): highest approved level, ignoring pending ones');
select pg_temp.login('a2');
select ok(access.is_super_admin(), 'is_super_admin(): true for an active super admin');

reset role;
select * from finish();
rollback;
