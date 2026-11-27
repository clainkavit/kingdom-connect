begin;
create extension if not exists pgtap with schema extensions;
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(25);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000009' || k)::uuid, 'pl' || k || '@test.invalid'
from unnest(array['01', 'a1']) k;
insert into public.members (id, username, status) values ('00000000-0000-0000-0000-000000000901', 'pl_member', 'approved');
insert into public.staff (id, full_name, role, active) values
  ('00000000-0000-0000-0000-0000000009a1', 'Listing Admin', 'admin', true);

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000009' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;

select ok((select count(*) = 3 from public.public_listing_sources where key in ('nest', 'ajira', 'crdb') and active),
  'NeST, Ajira and CRDB are sources from the start');

select set_config('test.tender', private.save_public_listing('nest', jsonb_build_object(
  'external_id', 'tender-1', 'title', 'Constructions of Ikungi bus stand', 'employer', 'IKUNGI DISTRICT COUNCIL',
  'summary', 'Works, Small Works', 'details', jsonb_build_object('reference_no', '84R5/2026/2027/W/01'),
  'original_url', 'https://nest.go.tz/tenders/published-tenders', 'language', 'en',
  'closing_on', (current_date + 14)::text, 'closing_time', '18:00', 'region', 'SINGIDA', 'district', 'Ikungi',
  'sector', 'Construction', 'fee_note', 'Fees or bid security may apply. See the official notice.',
  'translated_title', 'Ujenzi wa stendi ya mabasi ya Ikungi'))::text, true);
select is((select status from public.public_listings where id = current_setting('test.tender')::uuid), 'waiting',
  'an imported listing waits for staff');
select is((select r.name_en from public.public_listings l join public.regions r on r.id = l.suggested_region_id
           where l.id = current_setting('test.tender')::uuid), 'Singida', 'the region is suggested from its name');
select is((select s.name_en from public.public_listings l join public.sectors s on s.id = l.suggested_sector_id
           where l.id = current_setting('test.tender')::uuid), 'Construction', 'and the sector from its name');

select is(private.save_public_listing('nest', jsonb_build_object(
  'external_id', 'tender-1', 'title', 'Constructions of Ikungi bus stand (amended)',
  'original_url', 'https://nest.go.tz/tenders/published-tenders', 'closing_on', (current_date + 21)::text))::text,
  current_setting('test.tender'), 'the same listing seen again is not imported twice');
select is((select title from public.public_listings where id = current_setting('test.tender')::uuid),
  'Constructions of Ikungi bus stand (amended)', 'a waiting listing takes the newer text');
select is((select translated_title from public.public_listings where id = current_setting('test.tender')::uuid),
  'Ujenzi wa stendi ya mabasi ya Ikungi', 'and keeps its translation');
select ok(private.public_listing_translated('nest', 'tender-1'), 'the import knows it is already translated');

select set_config('test.job', private.save_public_listing('ajira', jsonb_build_object(
  'external_id', 'vacancy-1', 'title', 'Mwandishi mwendesha ofisi daraja la II', 'employer', 'Halmashauri ya Wilaya ya Siha',
  'details', jsonb_build_object('posts', 4), 'original_url', 'https://portal.ajira.go.tz/vacancies', 'language', 'sw',
  'closing_on', (current_date + 10)::text))::text, true);
select set_config('test.spare', private.save_public_listing('ajira', jsonb_build_object(
  'external_id', 'vacancy-2', 'title', 'Research officer II', 'original_url', 'https://portal.ajira.go.tz/vacancies',
  'closing_on', (current_date + 10)::text))::text, true);

set local role authenticated;
select pg_temp.login('01');
select is((select count(*)::int from public.public_listings), 0, 'members never see the queue');
select is((select count(*)::int from public.public_listing_sources), 0, 'nor the sources');
select is((select result from public.approve_public_listing(current_setting('test.job')::uuid,
           null, null, true, (select id from public.sectors where name_en = 'Other'), '{}', null, 'full_time')),
  'not_staff', 'a member cannot approve');
select is(public.discard_public_listing(current_setting('test.spare')::uuid), 'not_staff', 'or discard');
select throws_ok($$select private.save_public_listing('nest', '{}'::jsonb)$$, '42501', null,
  'nor write listings directly');

select pg_temp.login('a1');
select is((select count(*)::int from public.public_listings), 3, 'staff see the queue');
select is((select result from public.approve_public_listing(current_setting('test.tender')::uuid,
           null, null, false, (select id from public.sectors where name_en = 'Construction'))),
  'place_and_sector', 'a listing needs a place unless it is remote');
select is((select result from public.approve_public_listing(current_setting('test.job')::uuid,
           (select id from public.regions where name_en = 'Kilimanjaro'), null, false,
           (select id from public.sectors where name_en = 'Other'))),
  'employment_type', 'a job needs an employment type');

select set_config('test.post', (select opportunity_id::text from public.approve_public_listing(
  current_setting('test.tender')::uuid, (select id from public.regions where name_en = 'Singida'), null, false,
  (select id from public.sectors where name_en = 'Construction'), '{}', null, null, null, null, null)), true);
select is((select row(type, status, poster_staff_id::text)::text from public.opportunities
           where id = current_setting('test.post')::uuid),
  '(tender,published,00000000-0000-0000-0000-0000000009a1)', 'approving publishes a tender posted by the Administrator');
select is((select issuing_org from public.tender_details where opportunity_id = current_setting('test.post')::uuid),
  'IKUNGI DISTRICT COUNCIL', 'issued by the procuring body');
select ok((select description like '%Public listing from NeST%' and description like '%Ujenzi wa stendi%'
           and char_length(description) >= 100
           from public.opportunities where id = current_setting('test.post')::uuid),
  'the post names its source and carries the translation');
select is((select result from public.approve_public_listing(current_setting('test.tender')::uuid,
           (select id from public.regions where name_en = 'Singida'), null, false,
           (select id from public.sectors where name_en = 'Construction'))),
  'already_decided', 'a listing is approved only once');
select is(public.discard_public_listing(current_setting('test.spare')::uuid), 'ok', 'staff discard a listing');

reset role;
select is((select count(*)::int from private.audit_log
           where action in ('public_listing.approved', 'public_listing.discarded')
             and actor_staff_id = '00000000-0000-0000-0000-0000000009a1'), 2,
  'approving and discarding are written to the audit log with the Administrator');
select is(private.finish_public_listing_run('nest', array['other-tender']), 1,
  'a run that no longer finds a listing closes its post');
select is((select status from public.opportunities where id = current_setting('test.post')::uuid), 'closed',
  'the post is closed');
select is((select row(action, access.audit_kind(action),
                      access.audit_routine(actor_staff_id, actor_member_id, target_type, after))::text
           from private.audit_log where action = 'public_listings.imported' order by created_at desc limit 1),
  '(public_listings.imported,opportunities,t)', 'each run is logged as a routine system entry');

select * from finish();
rollback;
