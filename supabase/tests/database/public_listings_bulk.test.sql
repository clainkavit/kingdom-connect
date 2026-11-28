begin;
create extension if not exists pgtap with schema extensions;
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(8);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000008' || k)::uuid, 'plb' || k || '@test.invalid'
from unnest(array['01', 'a1']) k;
insert into public.members (id, username, status) values ('00000000-0000-0000-0000-000000000801', 'plb_member', 'approved');
insert into public.staff (id, full_name, role, active) values
  ('00000000-0000-0000-0000-0000000008a1', 'Bulk Admin', 'admin', true);

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000008' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;

select set_config('test.ready_tender', private.save_public_listing('nest', jsonb_build_object(
  'external_id', 'bulk-tender-ready', 'title', 'Bulk ready tender', 'original_url', 'https://nest.go.tz/tenders/published-tenders',
  'closing_on', (current_date + 14)::text, 'region', 'SINGIDA', 'sector', 'Construction'))::text, true);
select set_config('test.ready_job', private.save_public_listing('ajira', jsonb_build_object(
  'external_id', 'bulk-job-ready', 'title', 'Bulk ready job', 'original_url', 'https://portal.ajira.go.tz/vacancies',
  'closing_on', (current_date + 14)::text, 'region', 'Kilimanjaro', 'sector', 'Construction'))::text, true);
select set_config('test.no_region', private.save_public_listing('nest', jsonb_build_object(
  'external_id', 'bulk-tender-no-region', 'title', 'Bulk tender without a place',
  'original_url', 'https://nest.go.tz/tenders/published-tenders', 'closing_on', (current_date + 14)::text,
  'sector', 'Construction'))::text, true);
select set_config('test.no_closing', private.save_public_listing('nest', jsonb_build_object(
  'external_id', 'bulk-tender-no-closing', 'title', 'Bulk tender without a closing date',
  'original_url', 'https://nest.go.tz/tenders/published-tenders', 'region', 'SINGIDA', 'sector', 'Construction'))::text,
  true);
select set_config('test.ids', concat_ws(',', current_setting('test.ready_tender'), current_setting('test.ready_job'),
  current_setting('test.no_region'), current_setting('test.no_closing')), true);

set local role authenticated;
select pg_temp.login('01');
select throws_ok(format('select * from public.approve_public_listings(%L::uuid[])',
                        '{' || current_setting('test.ids') || '}'),
  'not_allowed', 'members cannot approve listings');

select pg_temp.login('a1');
select is((select string_agg(l.title || ':' || a.outcome, ',' order by l.title)
           from public.approve_public_listings(string_to_array(current_setting('test.ids'), ',')::uuid[]) a
           join public.public_listings l on l.id = a.listing_id),
  'Bulk ready job:ok,Bulk ready tender:ok,Bulk tender without a closing date:closing_date,Bulk tender without a place:place_and_sector',
  'staff approve the ready listings; each other one says what it still needs');

reset role;
select is((select string_agg(title || ':' || status, ',' order by title) from public.public_listings
           where id = any(string_to_array(current_setting('test.ids'), ',')::uuid[])),
  'Bulk ready job:approved,Bulk ready tender:approved,Bulk tender without a closing date:waiting,Bulk tender without a place:waiting',
  'the listings missing a place or closing date stay waiting');
select is((select o.employment_type from public.opportunities o join public.public_listings l on l.opportunity_id = o.id
           where l.id = current_setting('test.ready_job')::uuid), 'full_time', 'a job is approved as Full-time');
select is((select r.name_en from public.opportunities o join public.public_listings l on l.opportunity_id = o.id
           join public.regions r on r.id = o.region_id
           where l.id = current_setting('test.ready_tender')::uuid), 'Singida', 'with its suggested region');
select is((select o.status from public.opportunities o join public.public_listings l on l.opportunity_id = o.id
           where l.id = current_setting('test.ready_tender')::uuid), 'published', 'and is published at once');
select is((select count(*)::int from private.audit_log
           where action = 'public_listing.approved' and actor_staff_id = '00000000-0000-0000-0000-0000000008a1'), 2,
  'each approval is its own audit entry');

set local role authenticated;
select pg_temp.login('a1');
select is((select count(*)::int from public.approve_public_listings(
           string_to_array(current_setting('test.ids'), ',')::uuid[]) a where a.outcome = 'ok'), 0,
  'listings already approved are not approved twice');

select * from finish();
rollback;
