begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(36);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000016' || k)::uuid, 'pv' || k || '@test.invalid'
from unnest(array['01', '02', 'a1']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000001601', 'pv_owner', 'approved'),
  ('00000000-0000-0000-0000-000000001602', 'pv_no_business', 'approved');
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000016a1', 'Poster Checker', 'admin', true);
insert into public.member_private (member_id, phone, email, language) values
  ('00000000-0000-0000-0000-000000001601', '+255712000161', 'pv01@test.invalid', 'en'),
  ('00000000-0000-0000-0000-000000001602', '+255712000162', 'pv02@test.invalid', 'en');
insert into public.businesses (id, member_id, name, sector_id, size, level, status)
values ('00000000-0000-0000-0000-00000000b161', '00000000-0000-0000-0000-000000001601', 'Pendo Supplies',
        (select id from public.sectors order by name_en limit 1), 'small', 2, 'approved');
insert into public.business_private (business_id, brela_no, tin, licence_no, licence_expires_on)
values ('00000000-0000-0000-0000-00000000b161', 'BRELA-161', '161-161-161', 'LIC-161', current_date + 365);
insert into public.verification_requests (member_id, level, status, business_id, submitted_at, decided_at) values
  ('00000000-0000-0000-0000-000000001601', 1, 'approved', null, now(), now()),
  ('00000000-0000-0000-0000-000000001601', 2, 'approved', '00000000-0000-0000-0000-00000000b161', now(), now()),
  ('00000000-0000-0000-0000-000000001602', 1, 'approved', null, now(), now());
insert into storage.objects (bucket_id, name) values
  ('business-documents', '00000000-0000-0000-0000-000000001601/director.pdf'),
  ('business-documents', '00000000-0000-0000-0000-000000001601/bill.pdf'),
  ('business-documents', '00000000-0000-0000-0000-000000001601/letter.pdf'),
  ('business-documents', '00000000-0000-0000-0000-000000001601/lease.pdf'),
  ('business-documents', '00000000-0000-0000-0000-000000001602/director.pdf'),
  ('business-documents', '00000000-0000-0000-0000-000000001602/bill.pdf');
select set_config('test.region', (select id::text from public.regions where name_en = 'Mwanza'), true);
select set_config('test.district', (select id::text from public.districts
                                     where region_id = current_setting('test.region')::uuid order by name_en limit 1), true);
select set_config('test.other_district', (select d.id::text from public.districts d join public.regions r on r.id = d.region_id
                                           where r.name_en = 'Arusha' order by d.name_en limit 1), true);

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000016' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
create function pg_temp.submit(owner text default '01', kind text default 'directorship',
                               address text default 'Plot 12, Kenyatta Road',
                               district text default current_setting('test.district'),
                               proof text default 'director.pdf', bill text default 'bill.pdf')
returns text language sql as $$
  select public.submit_poster_verification(kind, '00000000-0000-0000-0000-0000000016' || owner || '/' || proof,
    address, current_setting('test.region')::uuid, district::uuid,
    '00000000-0000-0000-0000-0000000016' || owner || '/' || bill);
$$;
create function pg_temp.pending_request() returns uuid language sql as $$
  select id from public.verification_requests
  where level = 3 and status = 'pending' and member_id = '00000000-0000-0000-0000-000000001601';
$$;

set local role authenticated;
select pg_temp.login('02');
select is(pg_temp.submit(owner => '02'), 'level2_required', 'Level 3 needs an approved Level 2 business');

select pg_temp.login('01');
select is(pg_temp.submit(kind => 'licence'), 'invalid_proof_kind', 'the proof is a directors'' record or an authorisation letter');
select is(pg_temp.submit(address => 'x'), 'invalid_address', 'the address is required');
select is(pg_temp.submit(address => 'Plot 12, call 0712345678'), 'contact_details', 'the address holds no phone number or email');
select is(pg_temp.submit(district => current_setting('test.other_district')), 'invalid_region',
  'the district belongs to the region');
select is(public.submit_poster_verification('directorship', '00000000-0000-0000-0000-000000001602/director.pdf',
  'Plot 12, Kenyatta Road', current_setting('test.region')::uuid, current_setting('test.district')::uuid,
  '00000000-0000-0000-0000-000000001601/bill.pdf'), 'documents_missing', 'documents are in the member''s own folder');
select is(pg_temp.submit(bill => 'director.pdf'), 'documents_missing', 'one file cannot stand for both documents');
select is(pg_temp.submit(bill => 'missing.pdf'), 'documents_missing', 'and both must exist');
select is(pg_temp.submit(), 'ok', 'a Level 2 member sends Level 3');
select is(pg_temp.submit(), 'already_pending', 'only one Level 3 request waits at a time');
select is((select row(request_status, proof_kind, address)::text from public.my_poster_verification()),
  '(pending,directorship,"Plot 12, Kenyatta Road")', 'the member sees the status and their address');
select is((select row(level, business_status)::text from public.my_business()), '(2,approved)',
  'Level 2 stays approved while Level 3 waits');

select pg_temp.login('02');
select is((select count(*)::int from public.business_private), 0, 'another member reads no business address');
select is((select count(*)::int from public.my_poster_verification()), 0, 'nor another member''s Level 3 request');
select throws_ok($$select public.decide_business_verification((select id from public.verification_requests where level = 3 limit 1), true)$$,
  'P0001', 'not_allowed', 'nor decides it');

select pg_temp.login('a1');
select is((select string_agg(d.kind, ',' order by d.kind) from public.verification_documents d
           where d.request_id = pg_temp.pending_request()), 'address_proof,directorship', 'staff see both documents');
select is((select row(address, region_id::text = current_setting('test.region'))::text from public.business_private
           where business_id = '00000000-0000-0000-0000-00000000b161'), '("Plot 12, Kenyatta Road",t)', 'and the address');
select is(public.decide_business_verification(pg_temp.pending_request(), false, 'tin_mismatch', 'x'), 'reason_required',
  'a Level 2 reason does not fit Level 3');
select is(public.decide_business_verification(pg_temp.pending_request(), false, 'address_proof_old', null), 'ok',
  'staff reject Level 3 with a Level 3 reason');

reset role;
select is((select payload ->> 'reason' from public.notifications where kind = 'B2' and member_id = '00000000-0000-0000-0000-000000001601'),
  'The address proof is older than 3 months', 'B2 carries the reason');
select is((select row(level, status)::text from public.businesses where id = '00000000-0000-0000-0000-00000000b161'), '(2,approved)',
  'a Level 3 rejection leaves the business at Level 2');
select is(access.member_level('00000000-0000-0000-0000-000000001601'), 2, 'and the member at Level 2');

update public.verification_requests set submitted_at = now() - interval '1 hour'
where level = 3 and member_id = '00000000-0000-0000-0000-000000001601';

set local role authenticated;
select pg_temp.login('01');
select is((select row(request_status, reason)::text from public.my_poster_verification()),
  '(rejected,"The address proof is older than 3 months")', 'the member sees the rejection and the reason');
select is(pg_temp.submit(kind => 'authorisation_letter', address => 'Plot 14, Kenyatta Road', proof => 'director.pdf', bill => 'lease.pdf'),
  'documents_missing', 'a file that was already sent cannot be sent again');
select is(pg_temp.submit(kind => 'authorisation_letter', address => 'Plot 14, Kenyatta Road', proof => 'letter.pdf', bill => 'lease.pdf'),
  'ok', 'and sends again straight away with new files');
select is((select row(proof_kind, address)::text from public.my_poster_verification()),
  '(authorisation_letter,"Plot 14, Kenyatta Road")', 'the new details replace the old');

reset role;
update public.businesses set status = 'expired' where id = '00000000-0000-0000-0000-00000000b161';
set local role authenticated;
select pg_temp.login('a1');
select is(public.decide_business_verification(pg_temp.pending_request(), true), 'ok', 'staff approve Level 3');
select is(public.decide_business_verification((select id from public.verification_requests
                                               where level = 3 and member_id = '00000000-0000-0000-0000-000000001601'
                                               order by submitted_at desc limit 1), true),
  'already_decided', 'a decided Level 3 request stays decided');

reset role;
select is(access.member_level('00000000-0000-0000-0000-000000001601'), 1,
  'while the business is expired the member stays paused at Level 1');
select ok(exists (select 1 from private.audit_log where action = 'business.verification_submitted'
                  and actor_member_id = '00000000-0000-0000-0000-000000001601'
                  and after ->> 'address' = 'Plot 14, Kenyatta Road'),
  'the audit log keeps the address each request was sent with');
select is((select row(level, status)::text from public.businesses where id = '00000000-0000-0000-0000-00000000b161'), '(3,expired)',
  'the business is Level 3, and an approval does not lift an expiry');
update public.businesses set status = 'approved' where id = '00000000-0000-0000-0000-00000000b161';
select is(access.member_level('00000000-0000-0000-0000-000000001601'), 3, 'once the business is approved the member is Level 3');
select is((select payload from public.notifications where kind = 'B1' and member_id = '00000000-0000-0000-0000-000000001601'),
  '{"level": 3}'::jsonb, 'B1 says Level 3');
select ok(exists (select 1 from private.audit_log where action = 'business.verification_approved'
                  and actor_staff_id = '00000000-0000-0000-0000-0000000016a1' and after ->> 'level' = '3'),
  'the approval is in the audit log');

set local role authenticated;
select pg_temp.login('01');
select is(pg_temp.submit(proof => 'letter.pdf', bill => 'lease.pdf'), 'already_approved', 'an approved poster is not sent again');
reset role;
select ok((select bool_and(for_poster) from public.rejection_reasons
           where code in ('directorship_unclear', 'authorisation_unsigned', 'address_proof_old', 'address_mismatch', 'other')),
  'the Level 3 reasons are listed for staff');

select * from finish();
rollback;
