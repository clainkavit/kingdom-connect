begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

select has_table('public', 'registration_drafts', 'registration_drafts exists');
select has_table('public', 'verification_documents', 'verification_documents exists');
select is((select public from storage.buckets where id = 'identity-documents'), false,
  'the identity documents bucket is private');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'applicant@test.invalid'),
  ('00000000-0000-0000-0000-0000000000d2', 'twin@test.invalid'),
  ('00000000-0000-0000-0000-0000000000d3', 'member@test.invalid'),
  ('00000000-0000-0000-0000-0000000000d4', 'admin@test.invalid');
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-0000000000d1', 'reg_applicant', 'pending'),
  ('00000000-0000-0000-0000-0000000000d2', 'reg_twin', 'pending'),
  ('00000000-0000-0000-0000-0000000000d3', 'reg_member', 'approved');
insert into public.member_private (member_id, email, phone) values
  ('00000000-0000-0000-0000-0000000000d1', 'applicant@test.invalid', '+255700000001'),
  ('00000000-0000-0000-0000-0000000000d2', 'twin@test.invalid', '+255700000002');
insert into public.staff (id, full_name, role) values ('00000000-0000-0000-0000-0000000000d4', 'Reg Admin', 'admin');

select is(private.set_identity('00000000-0000-0000-0000-0000000000d1', 'nida', '1234'), 'invalid',
  'a NIDA number must be 20 digits');
select is(private.set_identity('00000000-0000-0000-0000-0000000000d1', 'nida', '1990 0101 1234 5678 9012'), 'ok',
  'a 20-digit NIDA number is stored');
select isnt(
  (select extensions.pgp_sym_decrypt(id_encrypted, private.vault_secret('id_encryption_key'))
   from public.member_private where member_id = '00000000-0000-0000-0000-0000000000d1'),
  null, 'the ID number is stored encrypted and can be decrypted with the key');
select is(
  (select position('1990' in encode(id_encrypted, 'escape')) from public.member_private
   where member_id = '00000000-0000-0000-0000-0000000000d1'),
  0, 'the stored ID number is not readable as plain text');
select is(private.set_identity('00000000-0000-0000-0000-0000000000d2', 'nida', '19900101123456789012'), 'duplicate',
  'the same ID for another applicant is refused');
select is(
  (select count(*)::int from private.audit_log where action = 'registration.duplicate_id'
     and target_id = '00000000-0000-0000-0000-0000000000d2'),
  1, 'the duplicate is written to the audit log for admins');
select is(private.set_identity('00000000-0000-0000-0000-0000000000d2', 'passport', 'AB123456'), 'ok',
  'a different ID type with its own number is fine');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated", "otp_verified": true}', true);
select lives_ok(
  $$insert into public.registration_drafts (step, data) values (2, '{"fullName": "Test Applicant"}')$$,
  'an applicant saves their draft'
);
select lives_ok($$update public.registration_drafts set step = 3$$, 'and changes it');
select is((select count(*)::int from public.profiles), 0, 'an applicant reads no member profiles');
select is((select count(*)::int from public.member_private where member_id <> '00000000-0000-0000-0000-0000000000d1'), 0,
  'or anyone else''s private details');
select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('identity-documents', '00000000-0000-0000-0000-0000000000d1/face'),
    ('identity-documents', '00000000-0000-0000-0000-0000000000d1/id')$$,
  'an applicant uploads their photos into their own folder'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('identity-documents', '00000000-0000-0000-0000-0000000000d2/face')$$,
  '42501', null, 'but not into anyone else''s'
);

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000d2", "role": "authenticated", "otp_verified": true}', true);
select is((select count(*)::int from public.registration_drafts), 0, 'an applicant never sees another draft');
select is((select count(*)::int from storage.objects where bucket_id = 'identity-documents'), 0,
  'or another applicant''s photos');

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000d4", "role": "authenticated", "otp_verified": true}', true);
select is((select count(*)::int from public.registration_drafts), 0, 'admins never see drafts');
reset role;

create temporary table place as
  select d.id as district_id, d.region_id,
         (select id from public.districts where region_id <> d.region_id limit 1) as elsewhere
  from public.districts d limit 1;

select is(private.submit_registration('00000000-0000-0000-0000-0000000000d1'), 'incomplete',
  'a draft without the personal details is refused');
update public.registration_drafts set data = (select jsonb_build_object(
  'fullName', 'Test Applicant', 'category', 'professional', 'address', 'Plot 1, Test Street',
  'regionId', region_id, 'districtId', elsewhere, 'categoryDetails', jsonb_build_object('profession', 'Accountant'),
  'acceptTerms', true, 'acceptPrivacy', true) from place)
where member_id = '00000000-0000-0000-0000-0000000000d1';
select is(private.submit_registration('00000000-0000-0000-0000-0000000000d1'), 'incomplete',
  'a district outside the chosen region is refused');
update public.registration_drafts
set data = data || jsonb_build_object('districtId', (select district_id from place), 'acceptPrivacy', false)
where member_id = '00000000-0000-0000-0000-0000000000d1';
select is(private.submit_registration('00000000-0000-0000-0000-0000000000d1'), 'legal_not_accepted',
  'submitting needs both legal boxes ticked');
update public.registration_drafts set data = data || '{"acceptPrivacy": true}'
where member_id = '00000000-0000-0000-0000-0000000000d1';
select is(private.submit_registration('00000000-0000-0000-0000-0000000000d1'), 'ok', 'a complete draft is submitted');
select is(private.submit_registration('00000000-0000-0000-0000-0000000000d1'), 'already_submitted',
  'and only once');
select is((select status from public.verification_requests where member_id = '00000000-0000-0000-0000-0000000000d1'),
  'pending', 'submitting creates a pending application');
select is((select count(*)::int from public.verification_documents), 2, 'with the face and ID photos');
select is((select profession from public.profiles where member_id = '00000000-0000-0000-0000-0000000000d1'),
  'Accountant', 'the profile is filled from the draft');
select is((select count(*)::int from public.notifications
           where member_id = '00000000-0000-0000-0000-0000000000d1' and kind = 'A1'), 1,
  'the applicant is told their application was received');
select is(private.set_identity('00000000-0000-0000-0000-0000000000d1', 'passport', 'ZZ999999'), 'not_editable',
  'the ID cannot be changed after submitting');

insert into public.registration_drafts (member_id, data)
select '00000000-0000-0000-0000-0000000000d2', jsonb_build_object(
  'fullName', 'Twin Applicant', 'category', 'other', 'address', 'Plot 2', 'regionId', region_id,
  'districtId', district_id, 'categoryDetails', jsonb_build_object('description', 'Farmer'),
  'acceptTerms', true, 'acceptPrivacy', true)
from place;
select is(private.submit_registration('00000000-0000-0000-0000-0000000000d2'), 'missing_photos',
  'an applicant without photos cannot submit');
insert into storage.objects (bucket_id, name) values
  ('identity-documents', '00000000-0000-0000-0000-0000000000d2/face'),
  ('identity-documents', '00000000-0000-0000-0000-0000000000d2/id');
select is(private.submit_registration('00000000-0000-0000-0000-0000000000d2'), 'ok',
  'an applicant who first tried a registered ID can submit with their own');
select is(
  (select duplicate_suspected_of from public.verification_requests
   where member_id = '00000000-0000-0000-0000-0000000000d2'),
  '00000000-0000-0000-0000-0000000000d1'::uuid,
  'but the application is flagged as a suspected duplicate for the admin queue'
);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d5', 'prober@test.invalid');
insert into public.members (id, username, status)
  values ('00000000-0000-0000-0000-0000000000d5', 'reg_prober', 'pending');
insert into public.member_private (member_id, email, phone)
  values ('00000000-0000-0000-0000-0000000000d5', 'prober@test.invalid', '+255700000005');
select private.set_identity('00000000-0000-0000-0000-0000000000d5', 'nida', '19900101123456789012')
from generate_series(1, 3);
select is(private.set_identity('00000000-0000-0000-0000-0000000000d5', 'nida', '19900101123456789099'), 'too_many',
  'after three registered IDs in a day, more tries are refused');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000d1", "role": "authenticated", "otp_verified": true}', true);
select isnt((select submitted_at from public.registration_drafts), null, 'an applicant sees that they have submitted');
update public.registration_drafts set step = 4;
select is((select step from public.registration_drafts), 3, 'a submitted draft cannot be changed');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('identity-documents', '00000000-0000-0000-0000-0000000000d1/face2')$$,
  '42501', null, 'only the face and ID photo can be stored, and not after submitting'
);
select is((select count(*)::int from public.verification_documents), 2, 'an applicant reads their own documents');
select is((select count(*)::int from storage.objects where bucket_id = 'identity-documents'), 2,
  'and their own photos');

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000d3", "role": "authenticated", "otp_verified": true}', true);
select is((select count(*)::int from public.verification_documents), 0, 'a member reads no one else''s documents');
select is((select count(*)::int from storage.objects where bucket_id = 'identity-documents'), 0,
  'or their photos');

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000d4", "role": "authenticated", "otp_verified": true}', true);
select is((select count(*)::int from public.verification_documents), 4, 'staff read every application''s documents');
select is((select count(*)::int from storage.objects where bucket_id = 'identity-documents'), 4,
  'and every photo');
reset role;
select throws_ok(
  $$update public.platform_settings set value = 'true' where key = 'test_data_only'$$,
  'P0001', null, 'test_data_only cannot be switched through the API'
);

select * from finish();
rollback;
