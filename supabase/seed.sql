-- Fake people for local development and tests only (PRD section 17, Test data).
-- Every account signs in with the password kingdom-test-only.
-- Safe to run again: fixed ids, and every insert skips rows that already exist.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', a.id, 'authenticated', 'authenticated', a.email,
  extensions.crypt('kingdom-test-only', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', ''
from (values
  ('5eed0000-0000-4000-8000-000000000001'::uuid, 'test.applicant@example.test'),
  ('5eed0000-0000-4000-8000-000000000002'::uuid, 'test.level1@example.test'),
  ('5eed0000-0000-4000-8000-000000000003'::uuid, 'test.level2@example.test'),
  ('5eed0000-0000-4000-8000-000000000004'::uuid, 'test.level3@example.test'),
  ('5eed0000-0000-4000-8000-000000000005'::uuid, 'test.investor@example.test'),
  ('5eed0000-0000-4000-8000-000000000006'::uuid, 'test.suspended@example.test'),
  ('5eed0000-0000-4000-8000-0000000000a1'::uuid, 'test.admin@example.test'),
  ('5eed0000-0000-4000-8000-0000000000a2'::uuid, 'test.superadmin@example.test')
) as a (id, email)
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), now(), now(), now()
from auth.users u
where u.email like 'test.%@example.test'
on conflict (provider_id, provider) do nothing;

insert into public.staff (id, full_name, role) values
  ('5eed0000-0000-4000-8000-0000000000a1', 'Test Administrator', 'admin'),
  ('5eed0000-0000-4000-8000-0000000000a2', 'Test Super Administrator', 'super_admin')
on conflict (id) do nothing;

insert into public.members (id, username, status, category, approved_at) values
  ('5eed0000-0000-4000-8000-000000000001', 'test_applicant', 'pending', 'professional', null),
  ('5eed0000-0000-4000-8000-000000000002', 'test_level1', 'approved', 'professional', now()),
  ('5eed0000-0000-4000-8000-000000000003', 'test_level2', 'approved', 'businessperson', now()),
  ('5eed0000-0000-4000-8000-000000000004', 'test_level3', 'approved', 'businessperson', now()),
  ('5eed0000-0000-4000-8000-000000000005', 'test_investor', 'approved', 'entrepreneur', now()),
  ('5eed0000-0000-4000-8000-000000000006', 'test_suspended', 'suspended', 'other', now())
on conflict (id) do nothing;

insert into public.profiles (member_id, full_name, headline, profession, region_id, district_id)
select p.member_id, p.full_name, p.headline, p.profession, d.region_id, d.id
from (values
  ('5eed0000-0000-4000-8000-000000000001'::uuid, 'Test Applicant', 'Fake applicant for testing', 'Nurse', 'Mwanza', 'Ilemela'),
  ('5eed0000-0000-4000-8000-000000000002'::uuid, 'Test Level 1 Member', 'Fake professional for testing', 'Accountant', 'Mwanza', 'Nyamagana'),
  ('5eed0000-0000-4000-8000-000000000003'::uuid, 'Test Level 2 Member', 'Fake verified business for testing', 'Shop owner', 'Dar es Salaam', 'Kinondoni'),
  ('5eed0000-0000-4000-8000-000000000004'::uuid, 'Test Level 3 Member', 'Fake opportunity poster for testing', 'Contractor', 'Arusha', 'Arusha'),
  ('5eed0000-0000-4000-8000-000000000005'::uuid, 'Test Investor Member', 'Fake member with the investor flag', 'Entrepreneur', 'Dodoma', 'Dodoma'),
  ('5eed0000-0000-4000-8000-000000000006'::uuid, 'Test Suspended Member', 'Fake suspended member for testing', 'Driver', 'Mwanza', 'Magu')
) as p (member_id, full_name, headline, profession, region, district)
join public.regions r on r.name_en = p.region
join public.districts d on d.region_id = r.id and d.name_en = p.district
on conflict (member_id) do nothing;

insert into public.member_private (member_id, email, phone, address)
select m.id, replace(m.username::text, 'test_', 'test.') || '@example.test',
  '+2557000000' || lpad(right(m.id::text, 2), 2, '0'), 'Fake address for testing'
from public.members m
where m.id::text like '5eed0000-%'
on conflict (member_id) do nothing;

insert into public.skills (name) values
  ('nursing'), ('accounting'), ('retail'), ('construction'), ('investment'), ('driving')
on conflict (name) do nothing;

insert into public.profile_skills (member_id, skill_id)
select x.member_id, s.id
from (values
  ('5eed0000-0000-4000-8000-000000000001'::uuid, 'nursing'),
  ('5eed0000-0000-4000-8000-000000000002'::uuid, 'accounting'),
  ('5eed0000-0000-4000-8000-000000000003'::uuid, 'retail'),
  ('5eed0000-0000-4000-8000-000000000004'::uuid, 'construction'),
  ('5eed0000-0000-4000-8000-000000000005'::uuid, 'investment'),
  ('5eed0000-0000-4000-8000-000000000006'::uuid, 'driving')
) as x (member_id, skill)
join public.skills s on s.name = x.skill
on conflict (member_id, skill_id) do nothing;

insert into public.verification_requests (id, member_id, level, status, reviewer_id, submitted_at, decided_at) values
  ('5eed0000-0000-4000-8000-00000000f101', '5eed0000-0000-4000-8000-000000000001', 1, 'pending', null, now(), null),
  ('5eed0000-0000-4000-8000-00000000f201', '5eed0000-0000-4000-8000-000000000002', 1, 'approved', '5eed0000-0000-4000-8000-0000000000a1', now(), now()),
  ('5eed0000-0000-4000-8000-00000000f301', '5eed0000-0000-4000-8000-000000000003', 1, 'approved', '5eed0000-0000-4000-8000-0000000000a1', now(), now()),
  ('5eed0000-0000-4000-8000-00000000f302', '5eed0000-0000-4000-8000-000000000003', 2, 'approved', '5eed0000-0000-4000-8000-0000000000a1', now(), now()),
  ('5eed0000-0000-4000-8000-00000000f401', '5eed0000-0000-4000-8000-000000000004', 1, 'approved', '5eed0000-0000-4000-8000-0000000000a1', now(), now()),
  ('5eed0000-0000-4000-8000-00000000f402', '5eed0000-0000-4000-8000-000000000004', 2, 'approved', '5eed0000-0000-4000-8000-0000000000a1', now(), now()),
  ('5eed0000-0000-4000-8000-00000000f403', '5eed0000-0000-4000-8000-000000000004', 3, 'approved', '5eed0000-0000-4000-8000-0000000000a1', now(), now()),
  ('5eed0000-0000-4000-8000-00000000f501', '5eed0000-0000-4000-8000-000000000005', 1, 'approved', '5eed0000-0000-4000-8000-0000000000a1', now(), now()),
  ('5eed0000-0000-4000-8000-00000000f601', '5eed0000-0000-4000-8000-000000000006', 1, 'approved', '5eed0000-0000-4000-8000-0000000000a1', now(), now())
on conflict (id) do nothing;

insert into public.investor_flags (id, member_id, granted_by, route, ticket_band) values
  ('5eed0000-0000-4000-8000-00000000f5f1', '5eed0000-0000-4000-8000-000000000005', '5eed0000-0000-4000-8000-0000000000a1', 'invitation', '10m_to_50m')
on conflict (id) do nothing;
