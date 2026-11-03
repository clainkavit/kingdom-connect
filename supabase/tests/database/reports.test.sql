begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000005' || k)::uuid, 'rp' || k || '@test.invalid'
from unnest(array['01', '02', '03', '04', '05', 'a1']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000000501', 'rp_reporter', 'approved'),
  ('00000000-0000-0000-0000-000000000502', 'rp_reported', 'approved'),
  ('00000000-0000-0000-0000-000000000503', 'rp_other', 'approved'),
  ('00000000-0000-0000-0000-000000000504', 'rp_applicant', 'pending'),
  ('00000000-0000-0000-0000-000000000505', 'rp_fifth', 'approved');
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000005a1', 'Reports Admin', 'admin', true);
insert into public.connections (member_a, member_b)
  values ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000502');
insert into public.message_threads (id, member_a, member_b) values
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000502');
insert into public.messages (thread_id, sender_id, body)
  values ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000502', 'Send me money first');

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000005' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;

set local role authenticated;
select pg_temp.login('01');

select matches((select reference_no from public.report('thread', '00000000-0000-0000-0003-000000000001',
                'asked_for_money', 'They asked for a fee before an interview.')),
  '^KC-[0-9]{4}-[0-9]{6,}$', 'reporting a thread returns a reference number');
select is((select status from public.message_threads where id = '00000000-0000-0000-0003-000000000001'), 'reported',
  'the thread becomes reported');
select is((select already_reported from public.report('thread', '00000000-0000-0000-0003-000000000001', 'spam')), true,
  'a second report of the same thread returns the open one');
select is((select count(*)::int from public.my_reports()), 1, 'and creates no new report');
select is((select row(outcome)::text from public.my_reports()), '(open)', 'my reports shows it as being reviewed');
select is((select array_agg(p.parameter_name::text order by p.ordinal_position)
           from information_schema.routines r join information_schema.parameters p on p.specific_name = r.specific_name
           where r.routine_schema = 'public' and r.routine_name = 'my_reports' and p.parameter_mode = 'OUT'),
  array['reference_no', 'outcome', 'reported_at'],
  'a reporter gets the reference, the outcome and the date only, no case details');
select is((select count(*)::int from public.reports), 0, 'a reporter cannot read the reports table');
select lives_ok($$select public.report('profile', '00000000-0000-0000-0000-000000000502', 'impersonation')$$,
  'a Member reports a profile');
select throws_ok($$select public.report('profile', '00000000-0000-0000-0000-000000000501', 'spam')$$,
  'P0001', 'not_available', 'not your own profile');
select throws_ok($$select public.report('profile', '00000000-0000-0000-0000-000000000504', 'spam')$$,
  'P0001', 'not_available', 'not an Applicant');
select throws_ok($$select public.report('profile', '00000000-0000-0000-0000-000000000503', 'shouting')$$,
  '23514', null, 'only the six reasons');
select throws_ok($$select public.report('opportunity', gen_random_uuid(), 'spam')$$,
  'P0001', 'not_available', 'opportunities, ideas and plans wait for Release 2');
select throws_ok($$select public.report('profile', '00000000-0000-0000-0000-000000000503', 'other', repeat('x', 1001))$$,
  '23514', null, 'the note is at most 1000 characters');
select throws_ok($$select public.report('profile', '00000000-0000-0000-0000-000000000503', 'spam', null,
                   '00000000-0000-0000-0000-000000000502/shot.png')$$,
  '23514', null, 'a screenshot must be in the reporter''s own folder');
select lives_ok($$insert into storage.objects (bucket_id, name)
  values ('report-files', '00000000-0000-0000-0000-000000000501/shot.png')$$, 'the reporter uploads a screenshot');
select is((select count(*)::int from storage.objects where bucket_id = 'report-files'), 0,
  'but cannot open it again');
select lives_ok($$select public.report('profile', '00000000-0000-0000-0000-000000000503', 'spam', null,
                   '00000000-0000-0000-0000-000000000501/shot.png')$$, 'and sends it with a report');
select is(access.report_file_removable('00000000-0000-0000-0000-000000000501/unsent.png'), true,
  'a reporter may remove a screenshot that was never sent');
select is(access.report_file_removable('00000000-0000-0000-0000-000000000501/shot.png'), false,
  'but not one sent with a report');
select is(access.report_file_removable('00000000-0000-0000-0000-000000000502/x.png'), false,
  'nor anyone else''s');

reset role;
insert into public.reports (reporter_id, target_type, target_id, subject_id, reason)
select '00000000-0000-0000-0000-000000000501', 'thread', gen_random_uuid(), '00000000-0000-0000-0000-000000000502', 'spam'
from generate_series(1, 7);
set local role authenticated;
select throws_ok($$select public.report('profile', '00000000-0000-0000-0000-000000000505', 'harassment')$$,
  'P0001', 'daily_limit', 'a Member can send 10 reports a day');
select is((select already_reported from public.report('profile', '00000000-0000-0000-0000-000000000502', 'spam')), true,
  'a repeat still returns the open report after the limit');

select pg_temp.login('02');
select is((select count(*)::int from public.reports), 0, 'the reported member cannot read reports about them');
select is((select count(*)::int from storage.objects where bucket_id = 'report-files'), 0,
  'nor open the screenshot');
select is((select count(*)::int from public.my_reports()), 0, 'and has no reports of their own');

select pg_temp.login('03');
select throws_ok($$select public.report('thread', '00000000-0000-0000-0003-000000000001', 'spam')$$,
  'P0001', 'not_available', 'only a member of the thread can report it');

select pg_temp.login('a1');
select is((select count(*)::int from public.reports where reporter_id = '00000000-0000-0000-0000-000000000501'), 10,
  'staff read every report');

reset role;
select setval('public.report_reference_seq', 999999);
select matches(private.next_report_reference(), '^KC-[0-9]{4}-1000000$',
  'the running number grows past six digits instead of being cut');
set local role anon;
select throws_ok($$select * from public.my_reports()$$, '42501', null, 'a visitor cannot read reports');

select * from finish();
rollback;
