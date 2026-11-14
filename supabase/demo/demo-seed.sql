-- Demo content for a test environment (PRD section 17, Test data). Fake people only: every account is
-- test.<name>@example.test with a test_ username and a +2557000001xx phone. Names, businesses and posts
-- are invented. Load it with `pnpm demo:load`, which refuses to run unless test_data_only is on.
-- Safe to run again: fixed ids (de300000-...) and every insert skips rows that already exist.
-- __DEMO_PASSWORD__ is replaced by the loader; it never lives in this file.

-- People -----------------------------------------------------------------------------------------
create temporary table demo_people (
  id uuid, username text, full_name text, headline text, profession text, district text,
  categories text[], skills text[], photo boolean, status text
) on commit drop;
insert into demo_people values
  ('de300000-0000-4000-8000-000000000001', 'test_amina_nurse', 'Amina Mushi', 'Nurse at a district health centre', 'Nurse', 'Ilemela', '{professional}', '{nursing,first aid}', true, 'approved'),
  ('de300000-0000-4000-8000-000000000002', 'test_baraka_dev', 'Baraka Mollel', 'Builds websites and mobile apps', 'Software developer', 'Arusha', '{professional}', '{software development,web design}', true, 'approved'),
  ('de300000-0000-4000-8000-000000000003', 'test_neema_acct', 'Neema Kimaro', 'Bookkeeping and tax for small businesses', 'Accountant', 'Ilala', '{professional}', '{accounting,tax}', true, 'approved'),
  ('de300000-0000-4000-8000-000000000004', 'test_juma_shop', 'Juma Hassan', 'Runs a general store in Kinondoni', 'Shop owner', 'Kinondoni', '{businessperson}', '{retail,stock control}', true, 'approved'),
  ('de300000-0000-4000-8000-000000000005', 'test_rehema_build', 'Rehema Mrema', 'Builds classrooms and homes', 'Contractor', 'Temeke', '{businessperson}', '{construction,project management}', true, 'approved'),
  ('de300000-0000-4000-8000-000000000006', 'test_daudi_farm', 'Daudi Massawe', 'Grows vegetables and coffee near Moshi', 'Farmer', 'Moshi', '{businessperson}', '{farming,irrigation}', true, 'approved'),
  ('de300000-0000-4000-8000-000000000007', 'test_grace_teach', 'Grace Mwakyusa', 'Secondary school maths teacher', 'Teacher', 'Mbeya', '{professional}', '{teaching,mathematics}', true, 'approved'),
  ('de300000-0000-4000-8000-000000000008', 'test_salma_tailor', 'Salma Omari', 'Makes school uniforms and dresses', 'Tailor', 'Tanga', '{other}', '{tailoring}', false, 'approved'),
  ('de300000-0000-4000-8000-000000000009', 'test_peter_driver', 'Peter Ndege', 'Delivery and transport driver', 'Driver', 'Morogoro', '{other}', '{driving,logistics}', false, 'approved'),
  ('de300000-0000-4000-8000-000000000010', 'test_lucy_market', 'Lucy Kessy', 'Marketing for small brands', 'Marketer', 'Dodoma', '{professional}', '{marketing,social media}', true, 'approved'),
  ('de300000-0000-4000-8000-000000000011', 'test_hamisi_garage', 'Hamisi Said', 'Car and motorbike mechanic', 'Mechanic', 'Kahama', '{businessperson}', '{mechanics}', false, 'approved'),
  ('de300000-0000-4000-8000-000000000012', 'test_zawadi_pharm', 'Zawadi Ally', 'Pharmacist', 'Pharmacist', 'Iringa', '{professional}', '{pharmacy}', false, 'pending');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select '00000000-0000-0000-0000-000000000000', p.id, 'authenticated', 'authenticated',
  'test.' || replace(substr(p.username, 6), '_', '.') || '@example.test',
  extensions.crypt('__DEMO_PASSWORD__', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
from demo_people p
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), now(), now(), now()
from auth.users u join demo_people p on p.id = u.id
on conflict (provider_id, provider) do nothing;

insert into public.members (id, username, status, category, categories, approved_at)
select id, username, status, categories[1], categories, case when status = 'approved' then now() - interval '20 days' end
from demo_people
on conflict (id) do nothing;

insert into public.member_private (member_id, email, phone, address)
select p.id, u.email, '+2557000001' || lpad(row_number() over (order by p.id)::text, 2, '0'), 'Fake address for the demo'
from demo_people p join auth.users u on u.id = p.id
on conflict (member_id) do nothing;

insert into public.profiles (member_id, full_name, headline, profession, region_id, district_id, photo_path, last_active_at)
select p.id, p.full_name, p.headline, p.profession, d.region_id, d.id,
  case when p.photo then p.id::text || '/photo' end, now() - interval '2 hours'
from demo_people p join public.districts d on d.name_en = p.district
on conflict (member_id) do nothing;

insert into public.skills (name) select distinct unnest(skills) from demo_people on conflict (name) do nothing;
insert into public.profile_skills (member_id, skill_id)
select p.id, s.id from demo_people p cross join unnest(p.skills) k join public.skills s on s.name = k
on conflict (member_id, skill_id) do nothing;

insert into public.verification_requests (id, member_id, level, status, reviewer_id, submitted_at, decided_at)
select ('de300000-0000-4000-8000-0000000001' || substr(p.id::text, 35, 2))::uuid, p.id, 1, 'approved',
  '5eed0000-0000-4000-8000-0000000000a1', now() - interval '21 days', now() - interval '20 days'
from demo_people p where p.status = 'approved'
on conflict (id) do nothing;

insert into public.legal_acceptances (member_id, legal_text_id, context_type)
select p.id, access.current_legal_text_id(k), 'reaccept'
from demo_people p cross join unnest(array['terms', 'privacy']) k
where p.status = 'approved' and access.current_legal_text_id(k) is not null
on conflict do nothing;

-- An applicant with ID and face photos, waiting in the verification queue (A02, A03) ------------
select private.set_identity('de300000-0000-4000-8000-000000000012', 'nida', '19900101-12345-00001-12')
where not exists (select 1 from public.verification_requests where id = 'de300000-0000-4000-8000-000000000f12');
insert into public.registration_drafts (member_id, step, data, submitted_at) values
  ('de300000-0000-4000-8000-000000000012', 6, '{"fullName": "Zawadi Ally", "category": "professional"}', now() - interval '3 hours')
on conflict (member_id) do nothing;
insert into public.verification_requests (id, member_id, level, status, submitted_at) values
  ('de300000-0000-4000-8000-000000000f12', 'de300000-0000-4000-8000-000000000012', 1, 'pending', now() - interval '3 hours')
on conflict (id) do nothing;
insert into public.verification_documents (request_id, kind, storage_path) values
  ('de300000-0000-4000-8000-000000000f12', 'face_photo', 'de300000-0000-4000-8000-000000000012/face'),
  ('de300000-0000-4000-8000-000000000f12', 'id_photo', 'de300000-0000-4000-8000-000000000012/id'),
  ('5eed0000-0000-4000-8000-00000000f101', 'face_photo', '5eed0000-0000-4000-8000-000000000001/face'),
  ('5eed0000-0000-4000-8000-00000000f101', 'id_photo', '5eed0000-0000-4000-8000-000000000001/id')
on conflict (request_id, kind) do nothing;

-- Businesses: two verified, two posters, one waiting with its documents (S40, A02) -------------
insert into public.businesses (id, member_id, name, sector_id, size, description, level, status)
select b.id, b.member_id, b.name, s.id, b.size, b.description, b.level, b.status
from (values
  ('de300000-0000-4000-8000-00000000b004'::uuid, 'de300000-0000-4000-8000-000000000004'::uuid, 'Juma General Store (demo)', 'Trade', 'micro', 'Food, soap and household goods for the neighbourhood.', 2, 'approved'),
  ('de300000-0000-4000-8000-00000000b005'::uuid, 'de300000-0000-4000-8000-000000000005'::uuid, 'Mrema Builders (demo)', 'Construction', 'small', 'Classrooms, homes and small commercial buildings.', 3, 'approved'),
  ('de300000-0000-4000-8000-00000000b006'::uuid, 'de300000-0000-4000-8000-000000000006'::uuid, 'Kilimo Bora Farms (demo)', 'Agriculture', 'small', 'Vegetables for Moshi and Arusha markets, and coffee.', 3, 'approved'),
  ('de300000-0000-4000-8000-00000000b011'::uuid, 'de300000-0000-4000-8000-000000000011'::uuid, 'Said Auto Garage (demo)', 'Transport and logistics', 'micro', 'Repairs for cars, motorbikes and bajaji.', null, 'pending')
) as b (id, member_id, name, sector, size, description, level, status)
join public.sectors s on s.name_en = b.sector
on conflict (id) do nothing;

insert into public.business_private (business_id, brela_no, tin, licence_no, licence_expires_on, address)
select b.id, b.brela, b.tin, b.licence, current_date + b.days, 'Fake business address'
from (values
  ('de300000-0000-4000-8000-00000000b004'::uuid, 'DEMO-BRELA-004', '100-200-004', 'DEMO-LIC-004', 300, 'Kinondoni'),
  ('de300000-0000-4000-8000-00000000b005'::uuid, 'DEMO-BRELA-005', '100-200-005', 'DEMO-LIC-005', 400, 'Temeke'),
  ('de300000-0000-4000-8000-00000000b006'::uuid, 'DEMO-BRELA-006', '100-200-006', 'DEMO-LIC-006', 20, 'Moshi'),
  ('de300000-0000-4000-8000-00000000b011'::uuid, 'DEMO-BRELA-011', '100-200-011', 'DEMO-LIC-011', 365, 'Kahama')
) as b (id, brela, tin, licence, days, district)
join public.districts d on d.name_en = b.district
on conflict (business_id) do nothing;

insert into public.verification_requests (id, member_id, level, status, business_id, reviewer_id, submitted_at, decided_at) values
  ('de300000-0000-4000-8000-000000000204', 'de300000-0000-4000-8000-000000000004', 2, 'approved', 'de300000-0000-4000-8000-00000000b004', '5eed0000-0000-4000-8000-0000000000a1', now() - interval '15 days', now() - interval '14 days'),
  ('de300000-0000-4000-8000-000000000205', 'de300000-0000-4000-8000-000000000005', 2, 'approved', 'de300000-0000-4000-8000-00000000b005', '5eed0000-0000-4000-8000-0000000000a1', now() - interval '15 days', now() - interval '14 days'),
  ('de300000-0000-4000-8000-000000000305', 'de300000-0000-4000-8000-000000000005', 3, 'approved', 'de300000-0000-4000-8000-00000000b005', '5eed0000-0000-4000-8000-0000000000a1', now() - interval '12 days', now() - interval '11 days'),
  ('de300000-0000-4000-8000-000000000206', 'de300000-0000-4000-8000-000000000006', 2, 'approved', 'de300000-0000-4000-8000-00000000b006', '5eed0000-0000-4000-8000-0000000000a1', now() - interval '15 days', now() - interval '14 days'),
  ('de300000-0000-4000-8000-000000000306', 'de300000-0000-4000-8000-000000000006', 3, 'approved', 'de300000-0000-4000-8000-00000000b006', '5eed0000-0000-4000-8000-0000000000a1', now() - interval '12 days', now() - interval '11 days'),
  ('de300000-0000-4000-8000-000000000211', 'de300000-0000-4000-8000-000000000011', 2, 'pending', 'de300000-0000-4000-8000-00000000b011', null, now() - interval '1 day', null)
on conflict (id) do nothing;
insert into public.verification_documents (request_id, kind, storage_path) values
  ('de300000-0000-4000-8000-000000000211', 'brela', 'de300000-0000-4000-8000-000000000011/demo-brela.pdf'),
  ('de300000-0000-4000-8000-000000000211', 'tin', 'de300000-0000-4000-8000-000000000011/demo-tin.pdf'),
  ('de300000-0000-4000-8000-000000000211', 'licence', 'de300000-0000-4000-8000-000000000011/demo-licence.png')
on conflict (request_id, kind) do nothing;

-- Opportunities, with a tender document and responses (S16 to S21, A04) ------------------------
create temporary table demo_opps (
  id uuid, poster uuid, staff uuid, type text, title text, role text, employment text, district text,
  remote boolean, sector text, days int, status text, description text, skills text[]
) on commit drop;
insert into demo_opps values
  ('de300000-0000-4000-8000-00000000c001', 'de300000-0000-4000-8000-000000000005', null, 'job', 'Site supervisor for a school building in Temeke', 'Site supervisor', 'contract', 'Temeke', false, 'Construction', 21, 'published',
   'Supervise a team of 12 builders on a two-classroom block for six months. You keep the daily log, check materials on delivery, and make sure the work follows the drawings and safety rules. At least three years on building sites.', '{construction,project management}'),
  ('de300000-0000-4000-8000-00000000c002', 'de300000-0000-4000-8000-000000000006', null, 'job', 'Part-time bookkeeper for a farm business', 'Bookkeeper', 'part_time', 'Moshi', true, 'Finance', 30, 'published',
   'Keep the books for a growing vegetable and coffee farm: record sales and costs each week, prepare a monthly summary, and help with TRA filings. Two days a week; most of the work can be done remotely with a visit once a month.', '{accounting,tax}'),
  ('de300000-0000-4000-8000-00000000c003', 'de300000-0000-4000-8000-000000000005', null, 'tender', 'Supply of 2,000 cement bags for a classroom project', null, null, 'Temeke', false, 'Construction', 14, 'published',
   'Mrema Builders invites suppliers to quote for 2,000 bags of 42.5N cement, delivered in four loads to a school site in Temeke over eight weeks. Quotes must include delivery. No fee is charged to collect the tender document or to bid.', '{}'),
  ('de300000-0000-4000-8000-00000000c004', 'de300000-0000-4000-8000-000000000006', null, 'partnership', 'Partner to run a cold room for vegetables in Moshi', null, null, 'Moshi', false, 'Agriculture', 45, 'published',
   'We have a site and a buyer list for a small solar cold room at the Moshi market. We are looking for a partner who can run it day to day: receiving produce, keeping records and handling customers. Profit is shared by agreement.', '{farming}'),
  ('de300000-0000-4000-8000-00000000c005', 'de300000-0000-4000-8000-000000000006', null, 'investment', 'Investment for a second tractor (about TZS 40M)', null, null, 'Moshi', false, 'Agriculture', 60, 'published',
   'A second tractor would let us plough for neighbouring farms in the season and double our own planted area. We are looking for an investor for about TZS 40 million, repaid from ploughing income over three years. Records are available after the NDA.', '{}'),
  ('de300000-0000-4000-8000-00000000c006', '5eed0000-0000-4000-8000-000000000004', null, 'collaboration', 'Web developer to build a booking site for a builders'' firm', null, null, null, true, 'ICT', 25, 'published',
   'We need a simple website where clients can see our past projects and book a site visit. You would work with us for about four weeks. The site should load fast on a phone and be easy for our office to update.', '{software development,web design}'),
  ('de300000-0000-4000-8000-00000000c007', null, '5eed0000-0000-4000-8000-0000000000a1', 'job', 'Community health volunteers for Mwanza (6 places)', 'Community health volunteer', 'part_time', 'Ilemela', false, 'Health', 20, 'published',
   'A partner clinic in Ilemela is looking for six community health volunteers for weekend outreach: home visits, health talks and referring people to the clinic. Training is given. Nurses and nursing students are welcome to apply.', '{nursing,first aid}'),
  ('de300000-0000-4000-8000-00000000c008', 'de300000-0000-4000-8000-000000000005', null, 'job', 'Driver for building material deliveries in Dar es Salaam', 'Driver', 'full_time', 'Temeke', false, 'Transport and logistics', 30, 'pending_review',
   'Drive our 5-tonne truck between suppliers and our building sites in Dar es Salaam. You need a class C licence, a clean record and good knowledge of the city. Loading help is provided at each site. Working hours are Monday to Saturday.', '{driving,logistics}');

insert into public.opportunities
  (id, poster_member_id, poster_staff_id, type, title, role, employment_type, region_id, district_id, remote, sector_id,
   description, closing_at, no_fee_declared, status, published_at, approved_at)
select o.id, o.poster, o.staff, o.type, o.title, o.role, o.employment, d.region_id, d.id, o.remote, s.id,
  o.description, current_date + o.days, o.poster is not null, o.status,
  case when o.status = 'published' then now() - (o.days % 7 || ' days')::interval end,
  case when o.status = 'published' then now() - (o.days % 7 || ' days')::interval end
from demo_opps o
join public.sectors s on s.name_en = o.sector
left join public.districts d on d.name_en = o.district
on conflict (id) do nothing;

insert into public.skills (name) select distinct unnest(skills) from demo_opps on conflict (name) do nothing;
insert into public.opportunity_skills (opportunity_id, skill_id)
select o.id, s.id from demo_opps o cross join unnest(o.skills) k join public.skills s on s.name = k
on conflict do nothing;

insert into public.tender_details (opportunity_id, issuing_org, reference_no, scope, eligibility, required_documents, closing_time, estimated_value_tzs, document_path)
values ('de300000-0000-4000-8000-00000000c003', 'Mrema Builders (demo)', 'MB-DEMO-2026-01',
  '2,000 bags of 42.5N cement in four deliveries over eight weeks.', 'Registered suppliers with a valid business licence.',
  '{"Business licence","TIN certificate","Price quotation"}', '16:00', 36000000,
  'de300000-0000-4000-8000-000000000005/demo-tender.pdf')
on conflict (opportunity_id) do nothing;

insert into public.responses (id, opportunity_id, member_id, kind, note, attachment_path, status, created_at) values
  ('de300000-0000-4000-8000-00000000e001', 'de300000-0000-4000-8000-00000000c001', 'de300000-0000-4000-8000-000000000009', 'application', 'I have driven and supervised deliveries on two school sites.', 'de300000-0000-4000-8000-000000000009/demo-cv.pdf', 'new', now() - interval '2 days'),
  ('de300000-0000-4000-8000-00000000e002', 'de300000-0000-4000-8000-00000000c002', 'de300000-0000-4000-8000-000000000003', 'application', 'I keep books for three shops and file their TRA returns.', 'de300000-0000-4000-8000-000000000003/demo-cv.pdf', 'shortlisted', now() - interval '3 days'),
  ('de300000-0000-4000-8000-00000000e003', 'de300000-0000-4000-8000-00000000c006', 'de300000-0000-4000-8000-000000000002', 'interest', 'I build fast mobile sites; happy to show past work.', null, 'new', now() - interval '1 day'),
  ('de300000-0000-4000-8000-00000000e004', 'de300000-0000-4000-8000-00000000c007', 'de300000-0000-4000-8000-000000000001', 'application', 'Registered nurse, free most weekends.', null, 'new', now() - interval '5 hours')
on conflict (id) do nothing;

-- Ideas, an NDA partner and a milestone plan with both signed agreements (S22 to S34) ----------
insert into public.ideas (id, owner_id, title, problem, sector_id, stage, seeking, investment_min_tzs, investment_max_tzs, show_owner, status, submitted_at, published_at)
select i.id, i.owner, i.title, i.problem, s.id, i.stage, i.seeking, i.min, i.max, i.show_owner, i.status,
  now() - interval '6 days', case when i.status = 'published' then now() - interval '5 days' end
from (values
  ('de300000-0000-4000-8000-00000000d001'::uuid, 'de300000-0000-4000-8000-000000000006'::uuid, 'Solar cold storage for market traders', 'Vegetable traders throw away up to a third of their stock because it spoils before it sells.', 'Agriculture', 'prototype', 'both', 20000000::bigint, 60000000::bigint, true, 'published'),
  ('de300000-0000-4000-8000-00000000d002'::uuid, 'de300000-0000-4000-8000-000000000001'::uuid, 'Booking clinic visits by SMS', 'Patients wait for hours because clinics cannot plan the day.', 'Health', 'idea', 'partner', null, null, true, 'published'),
  ('de300000-0000-4000-8000-00000000d003'::uuid, 'de300000-0000-4000-8000-000000000008'::uuid, 'A school uniform tailoring co-op', 'Parents buy poor uniforms late because local tailors cannot take big orders alone.', 'Manufacturing', 'early_revenue', 'investor', 5000000, 15000000, false, 'published'),
  ('de300000-0000-4000-8000-00000000d004'::uuid, 'de300000-0000-4000-8000-000000000009'::uuid, 'Motorbike delivery for pharmacies', 'Small pharmacies lose sales because they cannot deliver medicine to homes.', 'Transport and logistics', 'idea', 'both', 3000000, 10000000, true, 'published'),
  ('de300000-0000-4000-8000-00000000d005'::uuid, 'de300000-0000-4000-8000-000000000010'::uuid, 'Building bricks from recycled plastic', 'Plastic waste blocks drains while building materials keep getting dearer.', 'Manufacturing', 'idea', 'investor', 10000000, 30000000, true, 'pending_moderation')
) as i (id, owner, title, problem, sector, stage, seeking, min, max, show_owner, status)
join public.sectors s on s.name_en = i.sector
on conflict (id) do nothing;

insert into public.idea_details (idea_id, description, business_model, market) values
  ('de300000-0000-4000-8000-00000000d001', 'A 20 m3 solar-powered cold room at the market, rented to traders by the crate per day.', 'Daily rent per crate; a small membership for regular traders.', 'About 300 vegetable traders at the Moshi market.'),
  ('de300000-0000-4000-8000-00000000d002', 'Patients send an SMS to book a slot and get a reminder the day before.', 'A monthly fee per clinic.', 'Private and faith-based clinics in Mwanza.'),
  ('de300000-0000-4000-8000-00000000d003', 'Ten tailors share an order book, fabric buying and quality checks.', 'Margin on school orders paid in advance.', 'Primary and secondary schools in Tanga.'),
  ('de300000-0000-4000-8000-00000000d004', 'Two riders on call for five pharmacies, paid per delivery.', 'Delivery fee shared with the pharmacy.', 'Pharmacies in Morogoro town.'),
  ('de300000-0000-4000-8000-00000000d005', 'Shredded plastic mixed with sand and pressed into bricks.', 'Sale of bricks to builders.', 'Small builders in Dodoma.')
on conflict (idea_id) do nothing;

insert into public.idea_access_requests (id, idea_id, requester_id, role, status, decided_at) values
  ('de300000-0000-4000-8000-00000000a001', 'de300000-0000-4000-8000-00000000d001', '5eed0000-0000-4000-8000-000000000005', 'investor', 'nda_accepted', now() - interval '4 days'),
  ('de300000-0000-4000-8000-00000000a002', 'de300000-0000-4000-8000-00000000d002', 'de300000-0000-4000-8000-000000000002', 'partner', 'pending', null)
on conflict (id) do nothing;

insert into public.saved_ideas (investor_id, idea_id)
values ('5eed0000-0000-4000-8000-000000000005', 'de300000-0000-4000-8000-00000000d003')
on conflict do nothing;

insert into public.milestone_plans (id, member_a, member_b, idea_id, started_by, status, stage1_agreed_at, expires_at)
values ('de300000-0000-4000-8000-00000000f001', '5eed0000-0000-4000-8000-000000000005', 'de300000-0000-4000-8000-000000000006',
  'de300000-0000-4000-8000-00000000d001', 'de300000-0000-4000-8000-000000000006', 'active', now() - interval '3 days', now() + interval '11 days')
on conflict (id) do nothing;
insert into public.milestones (plan_id, position, title, description, target_date, responsible_member_id, status, done_at, confirmed_at) values
  ('de300000-0000-4000-8000-00000000f001', 1, 'Agree the site with the market office', 'Signed letter from the market office.', current_date - 1, 'de300000-0000-4000-8000-000000000006', 'confirmed', now() - interval '2 days', now() - interval '1 day'),
  ('de300000-0000-4000-8000-00000000f001', 2, 'Get three quotes for the cold room', 'Quotes from three suppliers, compared together.', current_date + 10, 'de300000-0000-4000-8000-000000000006', 'open', null, null),
  ('de300000-0000-4000-8000-00000000f001', 3, 'First payment into the project account', 'Paid outside the platform, as agreed in the signed plan.', current_date + 25, '5eed0000-0000-4000-8000-000000000005', 'open', null, null)
on conflict (plan_id, position) do nothing;
insert into public.plan_documents (plan_id, uploaded_by, storage_path, size) values
  ('de300000-0000-4000-8000-00000000f001', 'de300000-0000-4000-8000-000000000006', 'de300000-0000-4000-8000-00000000f001/de300000-0000-4000-8000-000000000006.pdf', 900),
  ('de300000-0000-4000-8000-00000000f001', '5eed0000-0000-4000-8000-000000000005', 'de300000-0000-4000-8000-00000000f001/5eed0000-0000-4000-8000-000000000005.pdf', 900)
on conflict (plan_id, uploaded_by) do nothing;

-- Training and events, one of each full with a waitlist (S35 to S38) ---------------------------
insert into public.trainings (id, poster_member_id, poster_staff_id, title, provider, format, details, venue, starts_at, seats, downloads_allowed, status, submitted_at, published_at) values
  ('de300000-0000-4000-8000-00000000a101', 'de300000-0000-4000-8000-000000000003', null, 'Bookkeeping basics for small shops', 'Neema Kimaro (demo)', 'in_person', 'Two evenings: recording sales and costs, and a simple monthly summary.', 'Mkuyuni church hall', now() + interval '9 days', 30, true, 'published', now() - interval '4 days', now() - interval '3 days'),
  ('de300000-0000-4000-8000-00000000a102', null, '5eed0000-0000-4000-8000-0000000000a1', 'Safe food handling for traders', 'District health office (demo)', 'online', 'A one-hour online session with questions at the end.', null, now() + interval '5 days', 100, false, 'published', now() - interval '2 days', now() - interval '2 days'),
  ('de300000-0000-4000-8000-00000000a103', 'de300000-0000-4000-8000-000000000002', null, 'Build your first website in a weekend', 'Baraka Mollel (demo)', 'in_person', 'Bring a laptop. We build and publish a one-page site together.', 'Arusha community centre', now() + interval '14 days', 2, true, 'published', now() - interval '3 days', now() - interval '2 days')
on conflict (id) do nothing;

insert into public.events (id, poster_member_id, poster_staff_id, title, details, starts_at, venue, link, capacity, status, submitted_at, published_at) values
  ('de300000-0000-4000-8000-00000000a201', null, '5eed0000-0000-4000-8000-0000000000a1', 'Mkuyuni business breakfast', 'Meet other members, hear from two local business owners, and share what you are working on.', now() + interval '6 days', 'Mkuyuni church hall', null, 80, 'published', now() - interval '3 days', now() - interval '3 days'),
  ('de300000-0000-4000-8000-00000000a202', 'de300000-0000-4000-8000-000000000004', null, 'Traders'' meetup in Kinondoni', 'Shop owners compare suppliers and prices. Tea provided.', now() + interval '12 days', 'Kinondoni community hall', null, 2, 'published', now() - interval '2 days', now() - interval '1 day'),
  ('de300000-0000-4000-8000-00000000a203', null, '5eed0000-0000-4000-8000-0000000000a1', 'Online: how verification works', 'A short online session on Levels 1 to 3 and what each one unlocks.', now() + interval '3 days', null, 'https://example.test/live/verification', 200, 'published', now() - interval '1 day', now() - interval '1 day')
on conflict (id) do nothing;

insert into public.registrations (member_id, training_id, event_id, status, waitlist_position) values
  ('de300000-0000-4000-8000-000000000004', 'de300000-0000-4000-8000-00000000a101', null, 'registered', null),
  ('de300000-0000-4000-8000-000000000010', 'de300000-0000-4000-8000-00000000a103', null, 'registered', null),
  ('de300000-0000-4000-8000-000000000007', 'de300000-0000-4000-8000-00000000a103', null, 'registered', null),
  ('de300000-0000-4000-8000-000000000008', 'de300000-0000-4000-8000-00000000a103', null, 'waitlisted', 1),
  ('de300000-0000-4000-8000-000000000005', null, 'de300000-0000-4000-8000-00000000a202', 'registered', null),
  ('de300000-0000-4000-8000-000000000003', null, 'de300000-0000-4000-8000-00000000a202', 'registered', null),
  ('de300000-0000-4000-8000-000000000001', null, 'de300000-0000-4000-8000-00000000a201', 'registered', null)
on conflict do nothing;

-- News (S39, A11) -------------------------------------------------------------------------------
insert into public.news_items (id, staff_id, title, body, image_path, pinned, status, published_at) values
  ('de300000-0000-4000-8000-00000000a301', '5eed0000-0000-4000-8000-0000000000a1', 'Welcome to the pilot', 'Thank you for joining. In the first weeks we will check every new member within two working days. Tell us what works and what does not through the report button or at the Sunday desk.', null, true, 'published', now() - interval '10 days'),
  ('de300000-0000-4000-8000-00000000a302', '5eed0000-0000-4000-8000-0000000000a1', 'Business breakfast next week', 'Our first business breakfast is next week at the church hall. Register in Events so we know how much tea to make.', 'news/de300000-0000-4000-8000-00000000a302.png', false, 'published', now() - interval '2 days'),
  ('de300000-0000-4000-8000-00000000a303', '5eed0000-0000-4000-8000-0000000000a1', 'Stay safe: no one may charge you to apply', 'No opportunity on the platform may ask you for money to apply, to collect a tender document or to get a job. If anyone asks, report the post or the conversation.', null, false, 'published', now() - interval '6 days'),
  ('de300000-0000-4000-8000-00000000a304', '5eed0000-0000-4000-8000-0000000000a1', 'New: low-data mode', 'On a small data bundle? Turn on low-data mode in Settings and photos will not download on that phone.', null, false, 'published', now() - interval '1 day')
on conflict (id) do nothing;

-- Connections, requests and conversations with attachments (S13 to S15) ------------------------
insert into public.connections (member_a, member_b)
select least(a, b), greatest(a, b) from (values
  ('5eed0000-0000-4000-8000-000000000002'::uuid, 'de300000-0000-4000-8000-000000000003'::uuid),
  ('5eed0000-0000-4000-8000-000000000003'::uuid, 'de300000-0000-4000-8000-000000000004'::uuid),
  ('5eed0000-0000-4000-8000-000000000004'::uuid, 'de300000-0000-4000-8000-000000000005'::uuid),
  ('5eed0000-0000-4000-8000-000000000005'::uuid, 'de300000-0000-4000-8000-000000000006'::uuid),
  ('de300000-0000-4000-8000-000000000001'::uuid, 'de300000-0000-4000-8000-000000000007'::uuid),
  ('de300000-0000-4000-8000-000000000004'::uuid, 'de300000-0000-4000-8000-000000000005'::uuid),
  ('de300000-0000-4000-8000-000000000002'::uuid, 'de300000-0000-4000-8000-000000000010'::uuid)
) as c (a, b)
on conflict (member_a, member_b) do nothing;

insert into public.connection_requests (id, requester_id, receiver_id, note, status)
select * from (values
('de300000-0000-4000-8000-00000000a401'::uuid, 'de300000-0000-4000-8000-000000000002'::uuid, '5eed0000-0000-4000-8000-000000000002'::uuid, 'Hello! I saw you do accounting. I am building a bookkeeping app and would like your advice.', 'sent'),
  ('de300000-0000-4000-8000-00000000a402'::uuid, 'de300000-0000-4000-8000-000000000007'::uuid, '5eed0000-0000-4000-8000-000000000003'::uuid, 'Our school is looking for a supplier of exercise books.', 'sent')
) as r (id, requester_id, receiver_id, note, status)
-- The request trigger runs before on conflict, so skip rows that are already here.
where not exists (select 1 from public.connection_requests c where c.id = r.id);

insert into public.message_threads (id, member_a, member_b) values
  ('de300000-0000-4000-8000-00000000a501', least('5eed0000-0000-4000-8000-000000000003'::uuid, 'de300000-0000-4000-8000-000000000004'::uuid), greatest('5eed0000-0000-4000-8000-000000000003'::uuid, 'de300000-0000-4000-8000-000000000004'::uuid)),
  ('de300000-0000-4000-8000-00000000a502', least('5eed0000-0000-4000-8000-000000000002'::uuid, 'de300000-0000-4000-8000-000000000003'::uuid), greatest('5eed0000-0000-4000-8000-000000000002'::uuid, 'de300000-0000-4000-8000-000000000003'::uuid))
on conflict (id) do nothing;

insert into public.messages (id, thread_id, sender_id, body, created_at) values
  ('de300000-0000-4000-8000-00000000a601', 'de300000-0000-4000-8000-00000000a501', 'de300000-0000-4000-8000-000000000004', 'Habari! Do you still buy soap in cartons? I found a cheaper supplier in Kariakoo.', now() - interval '26 hours'),
  ('de300000-0000-4000-8000-00000000a602', 'de300000-0000-4000-8000-00000000a501', '5eed0000-0000-4000-8000-000000000003', 'Yes, every two weeks. Can you send me their price list?', now() - interval '25 hours'),
  ('de300000-0000-4000-8000-00000000a603', 'de300000-0000-4000-8000-00000000a501', 'de300000-0000-4000-8000-000000000004', 'Here it is, and a photo of the cartons.', now() - interval '3 hours'),
  ('de300000-0000-4000-8000-00000000a604', 'de300000-0000-4000-8000-00000000a502', 'de300000-0000-4000-8000-000000000003', 'Thank you for connecting. I can help with your monthly summary if you like.', now() - interval '2 days'),
  ('de300000-0000-4000-8000-00000000a605', 'de300000-0000-4000-8000-00000000a502', '5eed0000-0000-4000-8000-000000000002', 'That would be great. Is Thursday good?', now() - interval '47 hours')
on conflict (id) do nothing;

insert into public.message_attachments (message_id, storage_path, file_name, mime, size) values
  ('de300000-0000-4000-8000-00000000a603', 'de300000-0000-4000-8000-00000000a501/de300000-0000-4000-8000-00000000a603/price-list.pdf', 'price-list.pdf', 'application/pdf', 900),
  ('de300000-0000-4000-8000-00000000a603', 'de300000-0000-4000-8000-00000000a501/de300000-0000-4000-8000-00000000a603/cartons.png', 'cartons.png', 'image/png', 4000)
on conflict (storage_path) do nothing;

-- Reports waiting for staff (A06, A07) -----------------------------------------------------------
insert into public.reports (id, reporter_id, target_type, target_id, subject_id, reason, note, status, created_at) values
  ('de300000-0000-4000-8000-00000000a701', 'de300000-0000-4000-8000-000000000001', 'profile', 'de300000-0000-4000-8000-000000000009', 'de300000-0000-4000-8000-000000000009', 'asked_for_money', 'Asked me to pay TZS 20,000 to be put on a job list.', 'open', now() - interval '6 hours'),
  ('de300000-0000-4000-8000-00000000a702', 'de300000-0000-4000-8000-000000000007', 'opportunity', 'de300000-0000-4000-8000-00000000c004', 'de300000-0000-4000-8000-000000000006', 'spam', 'Posted the same thing twice in another group.', 'open', now() - interval '1 day')
on conflict (id) do nothing;

-- Notifications so the bell is not empty -------------------------------------------------------
insert into public.notifications (id, member_id, kind, payload, created_at)
select n.id, n.member_id, n.kind, n.payload::jsonb, now() - n.ago::interval
from (values
  ('de300000-0000-4000-8000-00000000a801'::uuid, '5eed0000-0000-4000-8000-000000000002'::uuid, 'C1', '{"requester_name": "Baraka Mollel"}', '3 hours'),
  ('de300000-0000-4000-8000-00000000a802'::uuid, '5eed0000-0000-4000-8000-000000000003'::uuid, 'M1', '{"sender_name": "Juma Hassan"}', '3 hours')
) as n (id, member_id, kind, payload, ago)
where exists (select 1 from pg_catalog.pg_class where relname = 'notifications')
on conflict (id) do nothing;
