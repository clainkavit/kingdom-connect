begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(31);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'first@test.invalid'),
  ('00000000-0000-0000-0000-0000000000e2', 'second@test.invalid'),
  ('00000000-0000-0000-0000-0000000000e3', 'member@test.invalid'),
  ('00000000-0000-0000-0000-0000000000e4', 'admin@test.invalid'),
  ('00000000-0000-0000-0000-0000000000e5', 'former@test.invalid');
insert into public.members (id, username, status, resubmissions_used) values
  ('00000000-0000-0000-0000-0000000000e1', 'queue_first', 'pending', 0),
  ('00000000-0000-0000-0000-0000000000e2', 'queue_second', 'pending', 1),
  ('00000000-0000-0000-0000-0000000000e3', 'queue_member', 'approved', 0);
insert into public.member_private (member_id, email, phone, language) values
  ('00000000-0000-0000-0000-0000000000e1', 'first@test.invalid', '+255700000011', 'sw'),
  ('00000000-0000-0000-0000-0000000000e2', 'second@test.invalid', '+255700000012', 'en'),
  ('00000000-0000-0000-0000-0000000000e3', 'member@test.invalid', '+255700000013', 'en');
insert into public.staff (id, full_name, role, active) values
  ('00000000-0000-0000-0000-0000000000e4', 'Queue Admin', 'admin', true),
  ('00000000-0000-0000-0000-0000000000e5', 'Former Admin', 'admin', false);
insert into public.verification_requests (id, member_id, level) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', 1),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000e2', 1);
insert into public.verification_documents (request_id, kind, storage_path) values
  ('00000000-0000-0000-0000-0000000000f1', 'face_photo', '00000000-0000-0000-0000-0000000000e1/face');
update public.member_private
set id_type = 'passport',
    id_encrypted = extensions.pgp_sym_encrypt('QQ123456', private.vault_secret('id_encryption_key'))
where member_id = '00000000-0000-0000-0000-0000000000e3';

select is(
  private.decide_application('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000f1', 'approved'),
  'not_staff', 'a member cannot decide an application');
select is(
  private.decide_application('00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000f1', 'approved'),
  'not_staff', 'nor can an inactive staff account');
select is(
  private.decide_application('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000f1', 'rejected'),
  'reason_required', 'a rejection needs a reason');
update public.members set status = 'suspended' where id = '00000000-0000-0000-0000-0000000000e1';
select is(
  private.decide_application('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000f1', 'approved'),
  'member_not_pending', 'an application is not decided while the member is not pending');
update public.members set status = 'pending' where id = '00000000-0000-0000-0000-0000000000e1';
select is(
  private.decide_application('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000f1', 'rejected', 'other'),
  'reason_required', 'the reason "other" needs a note');
select is(
  private.decide_application('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000f1', 'rejected',
    'id_photo_unclear', 'Call me on 0712 345 678'),
  'note_has_contact_details', 'a note cannot carry contact details');

select is(
  private.decide_application('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000f1', 'rejected',
    'id_photo_unclear', 'Take it in daylight', '192.0.2.10'),
  'ok', 'staff reject with a preset reason and a note');
select is((select status from public.members where id = '00000000-0000-0000-0000-0000000000e1'), 'rejected',
  'the applicant is rejected');
select is(
  (select reason from public.verification_requests where id = '00000000-0000-0000-0000-0000000000f1'),
  'Picha ya kitambulisho haisomeki vizuri. Take it in daylight',
  'the reason is written in the applicant''s language, with the note as typed');
select is(
  (select payload ->> 'reason' from public.notifications
   where member_id = '00000000-0000-0000-0000-0000000000e1' and kind = 'A3'),
  'Picha ya kitambulisho haisomeki vizuri. Take it in daylight',
  'a first rejection sends A3 with the reason');
select is(
  (select count(*)::int from private.audit_log
   where action = 'application.rejected' and target_id = '00000000-0000-0000-0000-0000000000f1'
     and actor_staff_id = '00000000-0000-0000-0000-0000000000e4' and ip_address = '192.0.2.10'),
  1, 'the rejection is in the audit log with the admin and IP');
select is(
  private.decide_application('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000f1', 'approved'),
  'already_decided', 'a decided application cannot be decided again');

select is(
  private.decide_application('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000f2', 'rejected',
    'face_mismatch'),
  'ok', 'staff reject a resubmitted application');
select is(
  (select count(*)::int from public.notifications
   where member_id = '00000000-0000-0000-0000-0000000000e2' and kind = 'A4'),
  1, 'a second rejection sends A4, the final one');

update public.verification_requests set status = 'pending', decided_at = null
where id = '00000000-0000-0000-0000-0000000000f2';
update public.members set status = 'pending' where id = '00000000-0000-0000-0000-0000000000e2';
select is(
  private.mark_duplicate('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000f2', 'no_such_user'),
  'unknown_member', 'a duplicate must name a real member');
select is(
  private.mark_duplicate('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000f2', 'queue_second'),
  'unknown_member', 'an application cannot duplicate itself');
select is(
  private.mark_duplicate('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000f2', ' QUEUE_MEMBER '),
  'ok', 'staff mark a suspected duplicate by username');
select is(
  (select duplicate_suspected_of from public.verification_requests where id = '00000000-0000-0000-0000-0000000000f2'),
  '00000000-0000-0000-0000-0000000000e3'::uuid, 'the application points at the other member');
select is(
  (select count(*)::int from private.audit_log
   where action = 'application.duplicate_marked' and target_id = '00000000-0000-0000-0000-0000000000f2'),
  1, 'marking a duplicate is in the audit log');

select is(
  private.decide_application('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000f2', 'approved'),
  'ok', 'staff approve an application');
select is((select status from public.members where id = '00000000-0000-0000-0000-0000000000e2'), 'approved',
  'the member is approved');
select isnt((select approved_at from public.members where id = '00000000-0000-0000-0000-0000000000e2'), null,
  'with the approval time');
select is(
  (select count(*)::int from public.notifications
   where member_id = '00000000-0000-0000-0000-0000000000e2' and kind = 'A2'),
  1, 'approval sends A2');
select is(
  (select count(*)::int from private.audit_log
   where action = 'application.approved' and target_id = '00000000-0000-0000-0000-0000000000f2'),
  1, 'the approval is in the audit log');

select throws_ok(
  $$select private.reveal_id_number('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e3')$$,
  '42501', null, 'a member cannot reveal an ID number');
select is(
  private.reveal_id_number('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000e3'),
  'QQ123456', 'staff can reveal an ID number');
select is(
  (select count(*)::int from private.audit_log
   where action = 'id.revealed' and target_id = '00000000-0000-0000-0000-0000000000e3'
     and actor_staff_id = '00000000-0000-0000-0000-0000000000e4'),
  1, 'every reveal is in the audit log');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000e3", "role": "authenticated", "otp_verified": true}', true);
select is((select count(*)::int from public.rejection_reasons), 0, 'a member cannot read the rejection reasons');
select throws_ok(
  $$select private.decide_application('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000f1', 'approved')$$,
  '42501', null, 'a member cannot call the decision function');

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000e4", "role": "authenticated", "otp_verified": true}', true);
select is((select count(*)::int from public.rejection_reasons), 7, 'staff read the rejection reasons');
select throws_ok(
  $$update public.verification_requests set status = 'approved' where id = '00000000-0000-0000-0000-0000000000f1'$$,
  '42501', null, 'staff cannot decide by editing the table, only through the audited function');
reset role;

select * from finish();
rollback;
