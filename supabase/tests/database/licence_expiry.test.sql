begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(40);

select set_config('test.today', ((now() at time zone 'Africa/Dar_es_Salaam')::date)::text, true);
insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000018' || k)::uuid, 'le' || k || '@test.invalid'
from unnest(array['01', '02', '03', '04', '05', 'a1']) k;
insert into public.members (id, username, status)
select ('00000000-0000-0000-0000-0000000018' || k)::uuid, 'le_' || k, 'approved'
from unnest(array['01', '02', '03', '04', '05']) k;
insert into public.profiles (member_id, full_name)
select ('00000000-0000-0000-0000-0000000018' || k)::uuid, 'Licence Owner ' || k
from unnest(array['01', '02', '03', '04', '05']) k;
insert into public.member_private (member_id, phone, email, language)
select ('00000000-0000-0000-0000-0000000018' || k)::uuid, '+2557120018' || k, 'le' || k || '@test.invalid', 'en'
from unnest(array['01', '02', '03', '04', '05']) k;
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000018a1', 'Licence Checker', 'admin', true);

-- 01: Level 3, licence ends in 7 days. 02: Level 2, in 20 days. 03: Level 2, ends today. 04: Level 2, in 100 days.
insert into public.businesses (id, member_id, name, sector_id, size, level, status)
select ('00000000-0000-0000-0000-00000000b1' || k)::uuid, ('00000000-0000-0000-0000-0000000018' || k)::uuid,
       'Licence Business ' || k, (select id from public.sectors order by name_en limit 1), 'small',
       case when k = '01' then 3 else 2 end, 'approved'
from unnest(array['01', '02', '03', '04']) k;
insert into public.business_private (business_id, brela_no, tin, licence_no, licence_expires_on)
select ('00000000-0000-0000-0000-00000000b1' || k)::uuid, 'BRELA-' || k, '180-180-1' || k, 'LIC-OLD-' || k,
       current_setting('test.today')::date + d
from (values ('01', 7), ('02', 20), ('03', 0), ('04', 100)) as x (k, d);
insert into public.verification_requests (member_id, level, status, business_id, submitted_at, decided_at)
select ('00000000-0000-0000-0000-0000000018' || k)::uuid, l, 'approved',
       case when l = 1 then null else ('00000000-0000-0000-0000-00000000b1' || k)::uuid end,
       now() - interval '1 day', now() - interval '1 day'
from (values ('01', 1), ('01', 2), ('01', 3), ('02', 1), ('02', 2), ('03', 1), ('03', 2), ('04', 1), ('04', 2), ('05', 1))
  as x (k, l);
insert into storage.objects (bucket_id, name) values
  ('business-documents', '00000000-0000-0000-0000-000000001801/licence-new.pdf'),
  ('business-documents', '00000000-0000-0000-0000-000000001801/licence-newer.pdf'),
  ('business-documents', '00000000-0000-0000-0000-000000001804/licence-new.pdf');

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000018' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
create function pg_temp.kinds(who text) returns text language sql as $$
  select coalesce(string_agg(kind || coalesce(':' || (payload ->> 'days'), ''), ',' order by kind), '')
  from public.notifications where member_id = ('00000000-0000-0000-0000-0000000018' || who)::uuid;
$$;
create function pg_temp.renew(who text default '01', number text default 'LIC-NEW-01',
                              days int default 365, file text default 'licence-new.pdf') returns text
language sql as $$
  select public.submit_licence_renewal(number, current_setting('test.today')::date + days,
    '00000000-0000-0000-0000-0000000018' || who || '/' || file);
$$;
create function pg_temp.renewal_request() returns uuid language sql as $$
  select v.id from public.verification_requests v
  where v.member_id = '00000000-0000-0000-0000-000000001801' and v.status = 'pending' and v.level = 2;
$$;

select ok(private.check_licence_expiry() >= 0, 'the daily check runs');
select is(pg_temp.kinds('01'), 'B3:7', 'a licence ending in 7 days sends B3 with 7 days');
select is(pg_temp.kinds('02'), 'B3:20', 'one ending within 30 days sends the 30-day B3');
select is(pg_temp.kinds('04'), '', 'one ending in 100 days sends nothing');
select is((select status from public.businesses where id = '00000000-0000-0000-0000-00000000b103'), 'expired',
  'a licence that ends today expires the business');
select is(pg_temp.kinds('03'), 'B4', 'and sends B4');
select is((select payload from public.notifications where kind = 'B4' and member_id = '00000000-0000-0000-0000-000000001803'),
  '{"level": 2}'::jsonb, 'B4 names the level that is paused');
select ok(exists (select 1 from private.audit_log where action = 'businesses.update'
                  and target_id = '00000000-0000-0000-0000-00000000b103' and actor_member_id is null and actor_staff_id is null),
  'the expiry is in the audit log as a system change');
select ok(private.check_licence_expiry() >= 0, 'running again');
select is(pg_temp.kinds('01') || '|' || pg_temp.kinds('02') || '|' || pg_temp.kinds('03'), 'B3:7|B3:20|B4',
  'sends no reminder or notice twice');
select is(access.member_level('00000000-0000-0000-0000-000000001803'), 1, 'an expired business pauses its owner at Level 1');

update public.business_private set licence_expires_on = current_setting('test.today')::date - 1
where business_id = '00000000-0000-0000-0000-00000000b101';
select ok(private.check_licence_expiry() >= 0, 'the Level 3 licence lapses');
select is(access.member_level('00000000-0000-0000-0000-000000001801'), 1,
  'an expired Level 3 poster counts as Level 1, so it cannot post (posting needs Level 3)');

set local role authenticated;
select pg_temp.login('05');
select is((select count(*)::int from public.businesses where id = '00000000-0000-0000-0000-00000000b103'), 0,
  'an expired business is not shown to other members');

select pg_temp.login('04');
select is(pg_temp.renew(who => '04'), 'not_due', 'a licence is renewed only within 30 days of its end');
select pg_temp.login('05');
select is(public.submit_licence_renewal('LIC-X', current_setting('test.today')::date + 365, 'x/y.pdf'), 'not_verified',
  'a member without a verified business cannot renew');

select pg_temp.login('01');
select is(pg_temp.renew(number => 'x'), 'invalid_number', 'the new licence number is checked');
select is(pg_temp.renew(days => -3), 'licence_expired', 'the new licence must not be expired');
select is(pg_temp.renew(file => 'missing.pdf'), 'documents_missing', 'the new licence document must exist');
select is(pg_temp.renew(days => 365 * 11), 'invalid_date', 'and the new date is within 10 years');
select is(pg_temp.renew(), 'ok', 'an expired poster sends a new licence');
select is(pg_temp.renew(file => 'licence-newer.pdf'), 'already_pending', 'one renewal waits at a time');
select is((select row(request_status, licence_no)::text from public.my_licence_renewal()), '(pending,LIC-NEW-01)',
  'the member sees the renewal waiting');
select is((select request_status from public.my_business()), 'approved',
  'and their Level 2 status stays Approved, not replaced by the renewal');

select pg_temp.login('05');
select is((select count(*)::int from public.licence_renewals), 0, 'another member reads no renewal');

select pg_temp.login('a1');
select is((select count(*)::int from public.licence_renewals where request_id = pg_temp.renewal_request()), 1,
  'staff read the renewal');
select is(public.decide_business_verification(pg_temp.renewal_request(), false, 'address_proof_old', null), 'reason_required',
  'a renewal is rejected with a business reason');
select is(public.decide_business_verification(pg_temp.renewal_request(), false, 'licence_mismatch', null), 'ok',
  'staff reject the renewal');

reset role;
select is((select status from public.businesses where id = '00000000-0000-0000-0000-00000000b101'), 'expired',
  'a rejected renewal leaves the business expired');
update public.verification_requests set submitted_at = now() - interval '1 hour'
where member_id = '00000000-0000-0000-0000-000000001801' and status = 'rejected';

set local role authenticated;
select pg_temp.login('01');
select is(pg_temp.renew(number => 'LIC-NEW-02', file => 'licence-newer.pdf'), 'ok', 'the member sends again');

select pg_temp.login('a1');
select is(public.decide_business_verification(pg_temp.renewal_request(), true), 'ok', 'staff approve the renewal');

reset role;
select is((select row(b.status, b.level, p.licence_no, p.licence_expires_on = current_setting('test.today')::date + 365)::text
           from public.businesses b join public.business_private p on p.business_id = b.id
           where b.id = '00000000-0000-0000-0000-00000000b101'), '(approved,3,LIC-NEW-02,t)',
  'approval restores the business at Level 3 with the new licence');
select is(access.member_level('00000000-0000-0000-0000-000000001801'), 3, 'and the member is Level 3 again');
select ok(exists (select 1 from public.notifications where kind = 'B1' and member_id = '00000000-0000-0000-0000-000000001801'
                  and payload = '{"level": 3}'::jsonb), 'B1 says Level 3');

update public.business_private set licence_expires_on = current_setting('test.today')::date + 5
where business_id = '00000000-0000-0000-0000-00000000b102';
select ok(private.check_licence_expiry() >= 0, 'later, the 20-day licence reaches its last week');
select is(pg_temp.kinds('02'), 'B3:20,B3:5', 'and the 7-day reminder follows the 30-day one');

insert into storage.objects (bucket_id, name) values ('business-documents', '00000000-0000-0000-0000-000000001802/new.pdf');
set local role authenticated;
select pg_temp.login('02');
select is(pg_temp.renew(who => '02', number => 'LIC-NEW-B2', file => 'new.pdf'), 'ok', 'member 02 renews early');
reset role;
update public.business_private set licence_expires_on = current_setting('test.today')::date + 3
where business_id = '00000000-0000-0000-0000-00000000b102';
delete from private.licence_reminders where business_id = '00000000-0000-0000-0000-00000000b102' and reminder = 7;
select ok(private.check_licence_expiry() >= 0, 'the check runs while that renewal waits');
select is(pg_temp.kinds('02'), 'B3:20,B3:5', 'and sends no reminder while a renewal is waiting');

set local role anon;
select throws_ok($$select * from public.licence_renewals$$, '42501', null, 'anonymous visitors cannot read renewals');

select * from finish();
rollback;
