begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'status@test.invalid'),
  ('00000000-0000-0000-0000-0000000000b2', 'ahead@test.invalid'),
  ('00000000-0000-0000-0000-0000000000b3', 'member@test.invalid'),
  ('00000000-0000-0000-0000-0000000000b4', 'admin@test.invalid');
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-0000000000b1', 'status_applicant', 'pending'),
  ('00000000-0000-0000-0000-0000000000b2', 'status_ahead', 'pending'),
  ('00000000-0000-0000-0000-0000000000b3', 'status_member', 'approved');
insert into public.member_private (member_id, email, phone) values
  ('00000000-0000-0000-0000-0000000000b1', 'status@test.invalid', '+255700000021'),
  ('00000000-0000-0000-0000-0000000000b2', 'ahead@test.invalid', '+255700000022'),
  ('00000000-0000-0000-0000-0000000000b3', 'member@test.invalid', '+255700000023');
insert into public.profiles (member_id, full_name) values
  ('00000000-0000-0000-0000-0000000000b3', 'Status Member');
insert into public.staff (id, full_name, role) values
  ('00000000-0000-0000-0000-0000000000b4', 'Status Admin', 'admin');
insert into public.registration_drafts (member_id, step, data, submitted_at) values
  ('00000000-0000-0000-0000-0000000000b1', 6, '{"fullName": "Status Applicant"}', now());

update public.verification_requests
set status = case when status = 'pending' then 'approved' else status end,
    decided_at = now() - interval '30 days';
insert into public.verification_requests (id, member_id, level, submitted_at) values
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b2', 1, now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 1, now() - interval '1 day');

select is(private.application_status('00000000-0000-0000-0000-0000000000b1') ->> 'state', 'under_review',
  'a submitted application is under review');
select is(private.application_status('00000000-0000-0000-0000-0000000000b1') -> 'expectedWorkingDays', 'null'::jsonb,
  'with no decisions in 14 days, there is no estimate');
insert into public.verification_requests (member_id, level, status, submitted_at, decided_at)
select '00000000-0000-0000-0000-0000000000b3', 1, 'approved', now() - interval '3 days', now() - interval '1 day'
from generate_series(1, 5);
select is((private.application_status('00000000-0000-0000-0000-0000000000b1') ->> 'expectedWorkingDays')::int, 4,
  'second in line at half a decision a working day: about 4 working days');
select is(
  (select array_agg(k order by k) from jsonb_object_keys(private.application_status('00000000-0000-0000-0000-0000000000b1')) k),
  array['expectedWorkingDays', 'state'],
  'the status carries no reviewer, queue position or queue size');

select is(
  private.decide_application('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000c1', 'rejected', 'id_expired'),
  'ok', 'staff reject the application');
select is(private.application_status('00000000-0000-0000-0000-0000000000b1'),
  '{"state": "rejected", "reason": "The ID has expired"}'::jsonb,
  'the applicant sees the rejection and the reason, and nothing else');

select is(private.start_resubmission('00000000-0000-0000-0000-0000000000b3'), 'not_rejected',
  'only a rejected account can resubmit');
select is(private.start_resubmission('00000000-0000-0000-0000-0000000000b1', '192.0.2.20'), 'ok',
  'a first rejection can be fixed and resubmitted');
select is((select status from public.members where id = '00000000-0000-0000-0000-0000000000b1'), 'pending',
  'the account is an applicant again');
select is((select resubmissions_used from public.members where id = '00000000-0000-0000-0000-0000000000b1'), 1,
  'and has used its resubmission');
select is((select (submitted_at is null and step = 6) from public.registration_drafts
           where member_id = '00000000-0000-0000-0000-0000000000b1'), true,
  'the draft reopens on the review step');
select is(private.application_status('00000000-0000-0000-0000-0000000000b1') ->> 'state', 'drafting',
  'while fixing, the applicant is back in the wizard');
select is((select count(*)::int from private.audit_log
           where action = 'application.resubmission_started' and target_id = '00000000-0000-0000-0000-0000000000b1'),
  1, 'starting a resubmission is in the audit log');

insert into public.verification_requests (id, member_id, level) values
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b1', 1);
update public.registration_drafts set submitted_at = now() where member_id = '00000000-0000-0000-0000-0000000000b1';
select is(
  private.decide_application('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000c3', 'rejected', 'face_mismatch'),
  'ok', 'staff reject the resubmitted application');
select is(private.application_status('00000000-0000-0000-0000-0000000000b1') ->> 'state', 'rejected_final',
  'a second rejection is final');
select is((select count(*)::int from public.notifications
           where member_id = '00000000-0000-0000-0000-0000000000b1' and kind = 'A4'), 1,
  'and sends A4');
select is(private.start_resubmission('00000000-0000-0000-0000-0000000000b1'), 'final',
  'a final rejection cannot be resubmitted by the applicant');

select is(private.reopen_application('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000c3', 'x'),
  'not_staff', 'a member cannot reopen an application');
select is(private.reopen_application('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000c3', ' '),
  'note_required', 'reopening needs a note');
select is(private.reopen_application('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000c1', 'x'),
  'not_final', 'only the latest, final rejection can be reopened');
select is(private.reopen_application('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000c3',
  'New ID photo sent by post', '192.0.2.30'), 'ok', 'staff reopen a final rejection');
select is(private.application_status('00000000-0000-0000-0000-0000000000b1') ->> 'state', 'drafting',
  'the applicant can fix and send it again');
select is((select count(*)::int from public.notifications
           where member_id = '00000000-0000-0000-0000-0000000000b1' and kind = 'A6'), 1,
  'and is told by A6');
select is((select count(*)::int from private.audit_log
           where action = 'application.reopened' and target_id = '00000000-0000-0000-0000-0000000000c3'
             and actor_staff_id = '00000000-0000-0000-0000-0000000000b4'), 1,
  'reopening is in the audit log');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated", "otp_verified": true}', true);
select is((select count(*)::int from public.members), 0, 'an applicant reads no member accounts');
select is((select count(*)::int from public.profiles), 0, 'or profiles');
select is((select count(*)::int from public.member_private), 0, 'or contact details');
select throws_ok($$select private.application_status('00000000-0000-0000-0000-0000000000b2')$$, '42501', null,
  'and cannot call the status function for anyone');
select throws_ok($$select private.start_resubmission('00000000-0000-0000-0000-0000000000b1')$$, '42501', null,
  'or start a resubmission directly');
select throws_ok($$select private.reopen_application('00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-0000000000c3', 'x')$$, '42501', null,
  'or reopen an application');
reset role;

select * from finish();
rollback;
