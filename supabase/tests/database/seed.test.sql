begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

select is(
  (select status from public.members where username = 'test_applicant'),
  'pending', 'seed: an Applicant whose application is pending');
select is(
  (select status from public.members where username = 'test_suspended'),
  'suspended', 'seed: a suspended Member');

select is(
  (select array_agg(username::text order by username) from public.members
   where status = 'approved' and username like 'test\_%'),
  array['test_level1', 'test_level1b', 'test_level2', 'test_level3'],
  'seed: four approved Members');

select is(
  (select max(v.level) from public.verification_requests v join public.members m on m.id = v.member_id
   where m.username = 'test_level1' and v.status = 'approved'), 1, 'seed: test_level1 is Level 1');
select is(
  (select max(v.level) from public.verification_requests v join public.members m on m.id = v.member_id
   where m.username = 'test_level2' and v.status = 'approved'), 2, 'seed: test_level2 is Level 2');
select is(
  (select max(v.level) from public.verification_requests v join public.members m on m.id = v.member_id
   where m.username = 'test_level3' and v.status = 'approved'), 3, 'seed: test_level3 is Level 3');
select is(
  (select count(*)::int from public.verification_requests v join public.members m on m.id = v.member_id
   where m.username = 'test_applicant' and v.status = 'pending'), 1, 'seed: the Applicant has a pending request');

select ok(
  exists (select 1 from public.investor_flags f join public.members m on m.id = f.member_id
          where m.username = 'test_level1b' and f.revoked_at is null),
  'seed: test_level1b holds a live investor flag');

select is(
  (select array_agg(role order by role) from public.staff where full_name like 'Test %' and active),
  array['admin', 'super_admin'], 'seed: an active Administrator and Super Administrator');

select is(
  (select count(*)::int from public.members m
   where m.username like 'test\_%'
     and not exists (select 1 from public.profiles p where p.member_id = m.id and p.region_id is not null and p.district_id is not null)),
  0, 'seed: every test account has a profile with a region and district');
select is(
  (select count(*)::int from public.members m
   where m.username like 'test\_%' and m.status = 'approved'
     and not exists (select 1 from public.profile_skills s where s.member_id = m.id)),
  0, 'seed: every approved Member has skills');
select is(
  (select count(*)::int from public.members m
   where m.username like 'test\_%' and not exists (select 1 from public.member_private p where p.member_id = m.id)),
  0, 'seed: every test account has contact details');

select is(
  (select count(*)::int from auth.users where email like 'test.%@example.test'),
  8, 'seed: eight sign-in accounts, one per role');
select is(
  (select count(*)::int from auth.users
   where email like 'test.%@example.test'
     and encrypted_password = extensions.crypt('kingdom-test-only', encrypted_password)),
  8, 'seed: every account signs in with the shared test password');
select is(
  (select count(*)::int from auth.users u
   where u.email like 'test.%@example.test' and u.email_confirmed_at is not null
     and exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email')),
  8, 'seed: every account has a confirmed email identity');

select is(
  (select count(*)::int from public.member_private p join public.members m on m.id = p.member_id
   where m.username like 'test\_%' and p.phone not like '+2557000000%'),
  0, 'seed: phone numbers are all in the one fake test pattern');
select is(
  (select count(*)::int from public.member_private p join public.members m on m.id = p.member_id
   where m.username like 'test\_%' and p.id_fingerprint is not null),
  0, 'seed: no ID numbers, real or fake');

select ok(
  exists (select 1 from public.connections c
          join public.members a on a.id = c.member_a join public.members b on b.id = c.member_b
          where a.username = 'test_level1' and b.username = 'test_level2'),
  'seed: test_level1 and test_level2 are connected');
select is(
  (select count(*)::int from public.members m join public.profiles p on p.member_id = m.id
   where m.username like 'test\_%' and (m.username ilike '%investor%' or p.full_name ilike '%investor%' or p.headline ilike '%investor%')),
  0, 'seed: no member-visible field names the investor flag');

select * from finish();
rollback;
