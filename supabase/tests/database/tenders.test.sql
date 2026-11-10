begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(28);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000034' || k)::uuid, 'td' || k || '@test.invalid'
from unnest(array['01', '02', '03', 'a1']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000003401', 'td_poster', 'approved'),
  ('00000000-0000-0000-0000-000000003402', 'td_level1', 'approved'),
  ('00000000-0000-0000-0000-000000003403', 'td_reader', 'approved');
insert into public.member_private (member_id, phone, email, language)
select ('00000000-0000-0000-0000-0000000034' || k)::uuid, '+2557120034' || k, 'td' || k || '@test.invalid', 'en'
from unnest(array['01', '02', '03']) k;
insert into public.verification_requests (member_id, level, status, submitted_at, decided_at)
select ('00000000-0000-0000-0000-0000000034' || k)::uuid, l, 'approved', now(), now()
from (values ('01', 1), ('01', 2), ('01', 3), ('02', 1), ('03', 1)) as x (k, l);
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000034a1', 'Tender Checker', 'admin', true);
select set_config('test.sector', (select id::text from public.sectors order by name_en limit 1), true);
select set_config('test.region', (select id::text from public.regions where name_en = 'Mwanza'), true);
select set_config('test.today', private.tanzania_today()::text, true);

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000034' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
create function pg_temp.fields(scope text default repeat('Build and equip a cold room for the fish market. ', 2),
                               reference text default 'TZ-MW-2026-014', path text default '00000000-0000-0000-0000-000000003401/00000000-0000-0000-0000-0000000f3401.pdf',
                               value bigint default 25000000, docs jsonb default '["Business licence", "Tax clearance"]')
returns jsonb language sql as $$
  select jsonb_build_object('reference_no', reference, 'scope', scope, 'eligibility', 'Registered in Tanzania',
    'required_documents', docs, 'closing_time', '15:30', 'estimated_value_tzs', value, 'document_path', path);
$$;
create function pg_temp.tender(title text default 'Cold room for the fish market', fields jsonb default null,
                               no_fee boolean default true, send boolean default true, existing uuid default null,
                               kind text default 'tender') returns text language sql as $$
  select result from public.save_opportunity(existing, kind, title, null,
    case when kind = 'job' then 'full_time' end, current_setting('test.region')::uuid, null, false,
    current_setting('test.sector')::uuid, repeat('Details of the work and what a bidder needs to know. ', 3),
    current_setting('test.today')::date + 30, case when kind = 'job' then array['supervision'] else '{}' end,
    no_fee, send, coalesce(fields, pg_temp.fields()));
$$;
create function pg_temp.post_id(title text) returns uuid language sql as $$
  select id from public.opportunities where opportunities.title = post_id.title order by created_at desc limit 1;
$$;

set local role authenticated;
select pg_temp.login('01');
select lives_ok($$insert into storage.objects (bucket_id, name)
                  values ('tender-documents', '00000000-0000-0000-0000-000000003401/00000000-0000-0000-0000-0000000f3401.pdf')$$,
  'a Level 3 poster uploads the tender document');
select is((select result from public.save_opportunity(null, 'tender', 'Tender without fields', null, null,
             current_setting('test.region')::uuid, null, false, current_setting('test.sector')::uuid,
             repeat('Details of the work and what a bidder needs to know. ', 3),
             current_setting('test.today')::date + 30, '{}', true, true)), 'invalid_tender', 'a tender needs its fields');
select is(pg_temp.tender(fields => pg_temp.fields(scope => 'Too short')), 'invalid_tender', 'a scope of at least 30 characters');
select is(pg_temp.tender(fields => pg_temp.fields(reference => 'x')), 'invalid_tender', 'and a reference number');
select is(pg_temp.tender(fields => pg_temp.fields(docs => '["a","b","c","d","e","f","g","h","i","j","k"]')), 'invalid_tender',
  'at most 10 required documents');
select is(pg_temp.tender(fields => pg_temp.fields(scope => repeat('Call 0712345678 about this tender please. ', 3))),
  'contact_details', 'phone numbers in the fields are refused');
select is(pg_temp.tender(no_fee => false), 'no_fee_required', 'a tender carries the no-fee declaration too');
select is(pg_temp.tender(title => 'Tender with no document', fields => pg_temp.fields(path => null)), 'ok', 'a tender can be sent without a document');
select is(pg_temp.tender(fields => pg_temp.fields(path => '00000000-0000-0000-0000-000000003402/00000000-0000-0000-0000-0000000f3402.pdf')),
  'invalid_tender_file', 'a document must be in the poster''s own folder');
select is(pg_temp.tender(fields => pg_temp.fields(
  path => '00000000-0000-0000-0000-000000003401/00000000-0000-0000-0000-0000000f3401.pdf')), 'ok', 'a complete tender is accepted');
select is((select status from public.opportunities where title = 'Cold room for the fish market'), 'pending_review',
  'a new poster''s tender waits for review');
select is((select row(issuing_org, reference_no, closing_time, estimated_value_tzs)::text from public.tender_details
           where opportunity_id = pg_temp.post_id('Cold room for the fish market')),
  '(td_poster,TZ-MW-2026-014,15:30:00,25000000)', 'its fields are stored, with the poster as issuing organisation');

select pg_temp.login('02');
select throws_ok($$insert into storage.objects (bucket_id, name)
                    values ('tender-documents', '00000000-0000-0000-0000-000000003402/00000000-0000-0000-0000-0000000f3402.pdf')$$,
  '42501', null, 'a Level 1 member cannot upload a tender document');

select pg_temp.login('03');
select is((select count(*)::int from public.tender_details), 0, 'members cannot read the fields of a tender still in review');
select is((select count(*)::int from public.opportunity_tender(pg_temp.post_id('Cold room for the fish market'))), 0,
  'nor through the function');
select is((select count(*)::int from storage.objects where bucket_id = 'tender-documents'), 0, 'nor open its document');

select pg_temp.login('a1');
select is(public.moderate_opportunity(pg_temp.post_id('Cold room for the fish market'), 'approve'), 'ok', 'staff approve it');

select pg_temp.login('03');
select is((select issuing_org || ' ' || reference_no from public.opportunity_tender(pg_temp.post_id('Cold room for the fish market'))),
  'td_poster TZ-MW-2026-014', 'once published, a member reads the tender fields');
select is((select required_documents from public.opportunity_tender(pg_temp.post_id('Cold room for the fish market'))),
  array['Business licence', 'Tax clearance'], 'including the documents to hold');
select is((select count(*)::int from storage.objects where bucket_id = 'tender-documents'), 1, 'and opens its document');
select throws_ok($$delete from storage.objects where bucket_id = 'tender-documents'$$, '42501', null, 'but cannot remove it');

select pg_temp.login('a1');
select lives_ok($$insert into storage.objects (bucket_id, name)
                  values ('tender-documents', '00000000-0000-0000-0000-0000000034a1/00000000-0000-0000-0000-0000000f34a1.pdf')$$,
  'staff upload a tender document');
select is((select result from public.save_opportunity(null, 'tender', 'Admin tender for a clinic', null, null,
             current_setting('test.region')::uuid, null, false, current_setting('test.sector')::uuid,
             repeat('Details of the work and what a bidder needs to know. ', 3),
             current_setting('test.today')::date + 30, '{}', false, true,
             pg_temp.fields(path => '00000000-0000-0000-0000-0000000034a1/00000000-0000-0000-0000-0000000f34a1.pdf'))), 'ok',
  'staff post a tender without the no-fee tick');
select is((select row(o.status, d.issuing_org)::text from public.opportunities o
           join public.tender_details d on d.opportunity_id = o.id where o.title = 'Admin tender for a clinic'),
  '(published,"Kingdom Connect")', 'it publishes at once, issued by the platform');

select pg_temp.login('01');
select is(pg_temp.tender(title => 'Tender draft to change', send => false, fields => pg_temp.fields(path => null)), 'ok',
  'a poster saves a tender draft without its document');
select is(pg_temp.tender(title => 'Tender draft to change', send => false, kind => 'job',
                         existing => pg_temp.post_id('Tender draft to change')), 'ok', 'and turns it into a job');
select is((select count(*)::int from public.tender_details where opportunity_id = pg_temp.post_id('Tender draft to change')), 0,
  'which drops the tender fields');

set local role anon;
select throws_ok($$select * from public.opportunity_tender('00000000-0000-0000-0000-000000000001')$$, '42501', null,
  'a signed-out visitor cannot read a tender');

select * from finish();
rollback;
