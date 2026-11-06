begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(39);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000015' || k)::uuid, 'bv' || k || '@test.invalid'
from unnest(array['01', '02', 'a1']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000001501', 'bv_owner', 'approved'),
  ('00000000-0000-0000-0000-000000001502', 'bv_other', 'approved');
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000015a1', 'Business Checker', 'admin', true);
insert into public.member_private (member_id, phone, email, language) values
  ('00000000-0000-0000-0000-000000001501', '+255712000151', 'bv01@test.invalid', 'en'),
  ('00000000-0000-0000-0000-000000001502', '+255712000152', 'bv02@test.invalid', 'en');
insert into storage.objects (bucket_id, name) values
  ('business-documents', '00000000-0000-0000-0000-000000001501/brela.pdf'),
  ('business-documents', '00000000-0000-0000-0000-000000001501/tin.pdf'),
  ('business-documents', '00000000-0000-0000-0000-000000001501/licence.pdf'),
  ('business-documents', '00000000-0000-0000-0000-000000001502/brela.pdf');
select set_config('test.sector', (select id::text from public.sectors order by name_en limit 1), true);

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000015' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
create function pg_temp.submit(tin text default '123 456 789', expires date default (current_date + 365),
                               brela text default '00000000-0000-0000-0000-000000001501/brela.pdf')
returns text language sql as $$
  select public.submit_business_verification('Asha Traders', current_setting('test.sector')::uuid, 'small',
    'Sells farm tools', 'BRELA-12345', tin, 'LIC-777', expires, brela,
    '00000000-0000-0000-0000-000000001501/tin.pdf', '00000000-0000-0000-0000-000000001501/licence.pdf');
$$;

set local role authenticated;
select pg_temp.login('01');
select is(pg_temp.submit(tin => '12345'), 'invalid_tin', 'a TIN is 9 digits');
select is(pg_temp.submit(expires => current_date - 1), 'licence_expired', 'the licence must not be expired');
select is(pg_temp.submit(brela => '00000000-0000-0000-0000-000000001502/brela.pdf'), 'documents_missing',
  'documents must be in the member''s own folder');
select is(pg_temp.submit(brela => '00000000-0000-0000-0000-000000001501/missing.pdf'), 'documents_missing',
  'and must exist');
select throws_ok($$insert into public.businesses (member_id, name, sector_id, size)
                   values ('00000000-0000-0000-0000-000000001501', 'Direct', current_setting('test.sector')::uuid, 'small')$$,
  '42501', null, 'a business cannot be written directly');
select is(public.submit_business_verification('Call 0712345678 Traders', current_setting('test.sector')::uuid, 'small', null,
  'BRELA-12345', '123456789', 'LIC-777', current_date + 365, '00000000-0000-0000-0000-000000001501/brela.pdf',
  '00000000-0000-0000-0000-000000001501/tin.pdf', '00000000-0000-0000-0000-000000001501/licence.pdf'), 'contact_details',
  'a business name holds no phone number or email');
select is(public.submit_business_verification('Asha Traders', current_setting('test.sector')::uuid, 'small', null,
  'BRELA-12345', '123456789', 'LIC-777', current_date + 365, '00000000-0000-0000-0000-000000001501/brela.pdf',
  '00000000-0000-0000-0000-000000001501/brela.pdf', '00000000-0000-0000-0000-000000001501/licence.pdf'), 'documents_missing',
  'one file cannot stand for two documents');
select is(pg_temp.submit(), 'ok', 'a member sends their business for Level 2');
select is(pg_temp.submit(), 'already_pending', 'only one request waits at a time');
select is((select row(request_status, business_status, tin)::text from public.my_business()),
  '(pending,pending,123-456-789)', 'the member sees the status and their TIN formatted');

select pg_temp.login('02');
select is((select count(*)::int from public.business_private), 0, 'another member reads no registration numbers');
select is((select count(*)::int from public.businesses where member_id = '00000000-0000-0000-0000-000000001501'), 0,
  'nor a business that is not approved');
select throws_ok($$select public.decide_business_verification((select id from public.verification_requests where level = 2 and member_id = '00000000-0000-0000-0000-000000001501' limit 1), true)$$,
  'P0001', 'not_allowed', 'nor decides');

select pg_temp.login('a1');
reset role;
select throws_ok($$update public.verification_requests set status = 'approved'
                   where level = 2 and member_id = '00000000-0000-0000-0000-000000001501'$$,
  'P0001', null, 'the Level 1 functions cannot decide a business request');
select throws_ok($$update public.verification_requests set status = 'rejected', reason_code = 'id_expired'
                   where level = 2 and member_id = '00000000-0000-0000-0000-000000001501'$$,
  'P0001', null, 'and an identity reason does not fit a business request');
set local role authenticated;
select pg_temp.login('a1');
select is((select count(*)::int from public.business_private where business_id in (select id from public.businesses where member_id = '00000000-0000-0000-0000-000000001501')), 1, 'staff read the numbers');
select is((select count(*)::int from public.verification_documents d join public.verification_requests v on v.id = d.request_id
           where v.level = 2 and v.member_id = '00000000-0000-0000-0000-000000001501'), 3, 'with the three documents');
select is(public.decide_business_verification((select id from public.verification_requests where level = 2 and member_id = '00000000-0000-0000-0000-000000001501' limit 1),
  false, null), 'reason_required', 'a rejection needs a reason');
select is(public.decide_business_verification((select id from public.verification_requests where level = 2 and member_id = '00000000-0000-0000-0000-000000001501' limit 1),
  false, 'other', ''), 'reason_required', 'and "other" needs a note');
select is(public.decide_business_verification((select id from public.verification_requests where level = 2 and member_id = '00000000-0000-0000-0000-000000001501' limit 1),
  false, 'other', 'Call me on 0712345678'), 'note_has_contact_details', 'a note holds no contact details');
select is(public.decide_business_verification((select id from public.verification_requests where level = 2 and member_id = '00000000-0000-0000-0000-000000001501' limit 1),
  false, 'tin_mismatch', 'Check the last digits'), 'ok', 'staff reject with a reason');

reset role;
select is((select payload ->> 'reason' from public.notifications where kind = 'B2' and member_id = '00000000-0000-0000-0000-000000001501'),
  'The TIN does not match the TRA certificate. Check the last digits', 'B2 carries the reason in the member''s language');
select ok(exists (select 1 from private.audit_log where action = 'business.verification_rejected'
                  and actor_staff_id = '00000000-0000-0000-0000-0000000015a1'), 'the rejection is in the audit log');

set local role authenticated;
select pg_temp.login('01');
select is((select row(request_status, business_status)::text from public.my_business()), '(rejected,rejected)',
  'the member sees the rejection');
select is(pg_temp.submit(tin => '987-654-321'), 'ok', 'and fixes and sends again');
select is((select tin from public.my_business()), '987-654-321', 'the new details replace the old');

select pg_temp.login('a1');
select is(public.decide_business_verification((select id from public.verification_requests
                                               where level = 2 and status = 'pending' and member_id = '00000000-0000-0000-0000-000000001501'), true), 'ok', 'staff approve');
select is(public.decide_business_verification((select id from public.verification_requests
                                               where level = 2 and member_id = '00000000-0000-0000-0000-000000001501' order by submitted_at desc limit 1), true),
  'already_decided', 'a decided request stays decided');

reset role;
select is(access.member_level('00000000-0000-0000-0000-000000001501'), 2, 'the member is now Level 2');
select is((select payload from public.notifications where kind = 'B1' and member_id = '00000000-0000-0000-0000-000000001501'), '{"level": 2}'::jsonb, 'B1 says Level 2');

set local role authenticated;
select pg_temp.login('02');
select is((select name from public.businesses where member_id = '00000000-0000-0000-0000-000000001501'), 'Asha Traders', 'an approved business is visible to other members');
select is((select count(*)::int from public.business_private), 0, 'with no registration numbers');
select pg_temp.login('01');
select is(pg_temp.submit(), 'already_approved', 'a verified business is not sent again');
select is(access.business_file_writable('00000000-0000-0000-0000-000000001501/new.pdf'), true,
  'a member may upload into their own folder');
select is(access.business_file_writable('00000000-0000-0000-0000-000000001502/new.pdf'), false, 'but not into another''s');
select is(access.business_file_removable('00000000-0000-0000-0000-000000001501/brela.pdf'), false,
  'and may not remove a file that was sent');
select is(access.business_file_writable('00000000-0000-0000-0000-000000001501/brela.pdf'), false,
  'nor upload again to the path of a file that was sent');
select is(access.business_file_writable('00000000-0000-0000-0000-000000001501/a/b.pdf'), false, 'or deeper than one folder');
reset role;
insert into storage.objects (bucket_id, name)
select 'business-documents', '00000000-0000-0000-0000-000000001501/bulk-' || g || '.pdf' from generate_series(1, 30) g;
set local role authenticated;
select pg_temp.login('01');
select is(access.business_file_writable('00000000-0000-0000-0000-000000001501/one-more.pdf'), false,
  'and a member has at most 30 files');

select * from finish();
rollback;
