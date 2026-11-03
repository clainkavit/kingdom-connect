begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(50);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000006' || k)::uuid, 'rq' || k || '@test.invalid'
from unnest(array['01', '02', '03', '04', 'a1']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000000601', 'rq_reporter', 'approved'),
  ('00000000-0000-0000-0000-000000000602', 'rq_second', 'approved'),
  ('00000000-0000-0000-0000-000000000603', 'rq_subject', 'approved'),
  ('00000000-0000-0000-0000-000000000604', 'rq_old_offender', 'approved');
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000006a1', 'Queue Admin', 'admin', true);
insert into public.message_threads (id, member_a, member_b) values
  ('00000000-0000-0000-0006-000000000001', '00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000603');
insert into auth.sessions (id, user_id)
  values ('00000000-0000-0000-0006-0000000000f1', '00000000-0000-0000-0000-000000000603');

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000006' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
create function pg_temp.sent(member text, kind text) returns int language sql as $$
  select count(*)::int from public.notifications
  where member_id = ('00000000-0000-0000-0000-000000000' || member)::uuid and notifications.kind = sent.kind;
$$;
create function pg_temp.case_of(target uuid, reporter text) returns uuid language sql as $$
  select id from public.reports
  where target_id = target and reporter_id = ('00000000-0000-0000-0000-0000000006' || reporter)::uuid
  order by status in ('open', 'under_review') desc, created_at desc limit 1;
$$;
grant execute on function pg_temp.case_of(uuid, text) to authenticated;

set local role authenticated;
select pg_temp.login('01');
select public.report('profile', '00000000-0000-0000-0000-000000000603', 'harassment');
select public.report('thread', '00000000-0000-0000-0006-000000000001', 'asked_for_money');
select pg_temp.login('02');
select public.report('profile', '00000000-0000-0000-0000-000000000603', 'spam');

reset role;
select is((select subject_id from public.reports where target_type = 'thread'
           and reporter_id = '00000000-0000-0000-0000-000000000601'),
  '00000000-0000-0000-0000-000000000603'::uuid, 'a thread report names the other member as its subject');
select is((select count(*)::int from public.reports where target_type = 'profile'
           and subject_id = '00000000-0000-0000-0000-000000000603'), 2, 'a profile report names its owner');

set local role authenticated;
select pg_temp.login('01');
select is((select count(*)::int from public.report_queue()), 0, 'a member sees no queue');
select is((select count(*)::int from public.moderation_actions), 0, 'a member cannot read moderation actions');
select throws_ok($$select public.decide_report(pg_temp.case_of('00000000-0000-0000-0000-000000000603', '01'),
                   'no_action', 'x', null)$$, 'P0001', 'not_allowed', 'a member cannot decide a report');
select throws_ok($$select public.start_review(pg_temp.case_of('00000000-0000-0000-0000-000000000603', '01'))$$,
  'P0001', 'not_allowed', 'nor start a review');
select throws_ok($$select public.lift_posting_pause('00000000-0000-0000-0000-000000000603', 'x')$$,
  'P0001', 'not_allowed', 'nor lift a posting pause');
select throws_ok($$select public.reinstate_account('00000000-0000-0000-0000-000000000603', 'x')$$,
  'P0001', 'not_allowed', 'nor reinstate an account');
select is(public.upheld_decisions('00000000-0000-0000-0000-000000000603'), 0,
  'nor count anyone''s upheld decisions');
select throws_ok($$insert into public.moderation_actions (staff_id, subject_id, action, note)
                   values ('00000000-0000-0000-0000-0000000006a1', '00000000-0000-0000-0000-000000000603', 'warn', 'x')$$,
  '42501', null, 'nor write a moderation action directly');
select throws_ok($$update public.moderation_actions set note = 'x'$$, '42501', null, 'nor change one');
select throws_ok($$delete from public.moderation_actions$$, '42501', null, 'nor delete one');

select pg_temp.login('a1');
select is((select count(*)::int from public.report_queue()), 2, 'staff see one case per item and member');
select is((select report_count from public.report_queue() where target_type = 'profile'), 2,
  'the profile case holds both reports');
select throws_ok($$select public.start_review(gen_random_uuid())$$, 'P0001', 'not_found',
  'an unknown report cannot be opened');
select lives_ok($$select public.start_review(pg_temp.case_of('00000000-0000-0000-0000-000000000603', '01'))$$,
  'opening a case starts its review');
select is((select array_agg(distinct status) from public.reports where target_type = 'profile'), array['under_review'],
  'every report in the case is under review');
select is((select status from public.report_queue() where target_type = 'profile'), 'under_review',
  'the queue shows the case as under review');
select throws_ok($$select public.decide_report(pg_temp.case_of('00000000-0000-0000-0000-000000000603', '01'),
                   'warn', '  ', 'Be respectful')$$, 'P0001', 'note_required', 'a note is required');
select throws_ok($$select public.decide_report(pg_temp.case_of('00000000-0000-0000-0000-000000000603', '01'),
                   'warn', 'Rude messages', null)$$, 'P0001', 'message_required', 'a warning needs a message to the member');
select throws_ok($$select public.decide_report(pg_temp.case_of('00000000-0000-0000-0000-000000000603', '01'),
                   'remove', 'x', 'y')$$, 'P0001', 'invalid_action', 'remove waits for Release 2');
select lives_ok($$select public.decide_report(pg_temp.case_of('00000000-0000-0000-0000-000000000603', '01'),
                  'warn', 'Rude messages to two members', 'Please keep messages respectful.')$$, 'staff warn');
select is((select array_agg(distinct status) from public.reports where target_type = 'profile'), array['action_taken'],
  'one decision closes every report in the case');
select is((select array_length(report_ids, 1) from public.moderation_actions where action = 'warn'), 2,
  'the action lists the reports it closed');
select throws_ok($$select public.decide_report(pg_temp.case_of('00000000-0000-0000-0000-000000000603', '02'),
                   'no_action', 'x', null)$$, 'P0001', 'already_decided', 'a closed case cannot be decided again');
select lives_ok($$select public.decide_report(pg_temp.case_of('00000000-0000-0000-0006-000000000001', '01'),
                  'no_action', 'A normal business question', null)$$, 'staff close a case with no action');

reset role;
select is(pg_temp.sent('601', 'R1') + pg_temp.sent('602', 'R1'), 2, 'each reporter of an upheld case gets R1');
select is((select payload ->> 'ref' from public.notifications where kind = 'R1'
           and member_id = '00000000-0000-0000-0000-000000000602'),
  (select reference_no from public.reports where reporter_id = '00000000-0000-0000-0000-000000000602'),
  'R1 carries that reporter''s own reference');
select is(pg_temp.sent('601', 'R2'), 1, 'a no-action case sends R2');
select is((select payload from public.notifications where kind = 'X3'),
  '{"reason": "Please keep messages respectful."}'::jsonb, 'the warned member gets X3 with the message only');
select is((select count(*)::int from private.audit_log where action = 'moderation_actions.insert'), 2,
  'every action is in the audit log');
select ok((select bool_and(before ->> 'status' in ('open', 'under_review') and after ->> 'status' in ('action_taken', 'no_action'))
           from private.audit_log where action = 'reports.update' and after ->> 'decided_by' is not null),
  'with the report before and after');

set local role authenticated;
select pg_temp.login('01');
select public.report('profile', '00000000-0000-0000-0000-000000000603', 'harassment');
select pg_temp.login('a1');
select public.decide_report(pg_temp.case_of('00000000-0000-0000-0000-000000000603', '01'),
  'warn', 'Again rude', 'Please keep messages respectful.');
reset role;
select is((select posting_suspended_until from public.members where id = '00000000-0000-0000-0000-000000000603'),
  'infinity'::timestamptz, 'a second upheld decision in 12 months pauses posting until lifted');
select is((select count(*)::int from public.moderation_actions where action = 'suspend_posting' and automatic), 1,
  'as an automatic action');
select is(pg_temp.sent('603', 'X2'), 1, 'and sends X2');
select ok(exists (select 1 from private.audit_log where action = 'members.update'
                  and after ->> 'posting_suspended_until' = 'infinity'), 'the pause is in the audit log');

set local role authenticated;
select pg_temp.login('02');
select public.report('profile', '00000000-0000-0000-0000-000000000603', 'spam');
select pg_temp.login('a1');
select public.decide_report(pg_temp.case_of('00000000-0000-0000-0000-000000000603', '02'),
  'warn', 'Third time', 'Please keep messages respectful.');
reset role;
select is((select status from public.members where id = '00000000-0000-0000-0000-000000000603'), 'suspended',
  'a third upheld decision suspends the account');
select is(pg_temp.sent('603', 'X1'), 1, 'and sends X1');
select is((select count(*)::int from auth.sessions where user_id = '00000000-0000-0000-0000-000000000603'), 0,
  'and signs the member out at once');

set local role authenticated;
select pg_temp.login('01');
select public.report('thread', '00000000-0000-0000-0006-000000000001', 'harassment');
select pg_temp.login('a1');
select public.decide_report(pg_temp.case_of('00000000-0000-0000-0006-000000000001', '01'),
  'suspend_account', 'Still in the thread', 'Harassment in messages.');
reset role;
select is(pg_temp.sent('603', 'X1'), 1, 'an account that is already suspended is not told again');

insert into public.moderation_actions (staff_id, subject_id, action, note, member_message, created_at)
values ('00000000-0000-0000-0000-0000000006a1', '00000000-0000-0000-0000-000000000604', 'warn', 'old', 'old',
        now() - interval '13 months');
set local role authenticated;
select pg_temp.login('01');
select public.report('profile', '00000000-0000-0000-0000-000000000604', 'spam');
select pg_temp.login('a1');
select public.decide_report(pg_temp.case_of('00000000-0000-0000-0000-000000000604', '01'),
  'suspend_posting', 'Spam posts', 'Your posts were spam.');
reset role;
select is((select count(*)::int from public.moderation_actions
           where subject_id = '00000000-0000-0000-0000-000000000604' and automatic), 0,
  'an upheld decision older than 12 months does not count');
select is(pg_temp.sent('604', 'X2'), 1, 'staff can pause posting directly, with X2');

set local role authenticated;
select pg_temp.login('a1');
select throws_ok($$select public.lift_posting_pause('00000000-0000-0000-0000-000000000604', '')$$,
  'P0001', 'note_required', 'lifting a pause needs a note');
select lives_ok($$select public.lift_posting_pause('00000000-0000-0000-0000-000000000604', 'Agreed to stop')$$,
  'staff lift a posting pause');
select lives_ok($$select public.reinstate_account('00000000-0000-0000-0000-000000000603', 'Reviewed and cleared')$$,
  'staff reinstate a suspended account');
reset role;
select is((select posting_suspended_until from public.members where id = '00000000-0000-0000-0000-000000000604'),
  null, 'the pause is lifted');
select is((select status from public.members where id = '00000000-0000-0000-0000-000000000603'), 'approved',
  'the account is reinstated');
set local role authenticated;
select pg_temp.login('a1');
select is(public.upheld_decisions('00000000-0000-0000-0000-000000000603'), 0,
  'decisions before a reinstatement no longer count toward the repeat rule');
reset role;

set local role authenticated;
select pg_temp.login('03');
select is((select count(*)::int from public.reports) + (select count(*)::int from public.moderation_actions), 0,
  'the reported member reads no reports and no actions');

set local role anon;
select throws_ok($$select * from public.report_queue()$$, '42501', null, 'a visitor cannot read the queue');

select * from finish();
rollback;
