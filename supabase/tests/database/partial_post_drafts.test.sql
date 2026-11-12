begin;
create extension if not exists pgtap with schema extensions;
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(16);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000003101', 'pd01@test.invalid');
insert into public.members (id, username, status) values ('00000000-0000-0000-0000-000000003101', 'pd_poster', 'approved');
insert into public.member_private (member_id, phone, email, language)
  values ('00000000-0000-0000-0000-000000003101', '+255712003101', 'pd01@test.invalid', 'en');
insert into public.verification_requests (member_id, level, status, submitted_at, decided_at)
select '00000000-0000-0000-0000-000000003101', l, 'approved', now(), now() from unnest(array[1, 2, 3]) l;
select set_config('test.sector', (select id::text from public.sectors order by name_en limit 1), true);
select set_config('test.region', (select id::text from public.regions where name_en = 'Mwanza'), true);
select set_config('test.today', private.tanzania_today()::text, true);
select set_config('request.jwt.claims', json_build_object(
  'sub', '00000000-0000-0000-0000-000000003101', 'role', 'authenticated', 'otp_verified', true)::text, true);

create function pg_temp.save(
  kind text, title text, send boolean, existing uuid default null, employment text default null,
  region uuid default null, sector uuid default null, description text default null, closing int default null,
  skills text[] default null, no_fee boolean default false, tender jsonb default null
) returns text language sql as $$
  select result from public.save_opportunity(existing, kind, title, null, employment, region, null, false, sector,
    description, current_setting('test.today')::date + closing, skills, no_fee, send, tender);
$$;
create function pg_temp.id(title text) returns uuid language sql as $$
  select id from public.opportunities where opportunities.title = id.title order by created_at desc limit 1;
$$;

set local role authenticated;

select is(pg_temp.save('job', 'Bookkeeper for a shop', false), 'ok',
  'a draft can be saved with only a type and a title');
select is((select status from public.opportunities where id = pg_temp.id('Bookkeeper for a shop')), 'draft',
  'it is a draft');
select ok((select sector_id is null and description is null and closing_at is null and employment_type is null
           from public.opportunities where id = pg_temp.id('Bookkeeper for a shop')),
  'with no sector, description, closing date or employment type yet');
select is(pg_temp.save('job', 'Tiny', false), 'invalid_title', 'a draft still needs a proper title');
select is(pg_temp.save('partnership', 'Partner wanted for a shop', false, employment => 'full_time'),
  'invalid_employment', 'only a job has an employment type, even in a draft');
select is(pg_temp.save('job', 'Bookkeeper for a shop', false, closing => 120), 'invalid_closing',
  'a closing date that is given is still checked');
select is(pg_temp.save('job', 'Call 0712345678 for work', false), 'contact_details',
  'contact details are refused in a draft too');
select is(pg_temp.save('job', 'Bookkeeper for a shop', true, pg_temp.id('Bookkeeper for a shop'),
                       employment => 'full_time'),
  'invalid_location', 'sending an unfinished draft is refused');
select is((select status from public.opportunities where id = pg_temp.id('Bookkeeper for a shop')), 'draft',
  'and it stays a draft');
select is(pg_temp.save('job', 'Bookkeeper for a shop', false, pg_temp.id('Bookkeeper for a shop'),
                       employment => 'full_time', region => current_setting('test.region')::uuid,
                       sector => current_setting('test.sector')::uuid), 'ok',
  'the draft is saved again after the next step');
select is(pg_temp.save('job', 'Bookkeeper for a shop', true, pg_temp.id('Bookkeeper for a shop'),
                       employment => 'full_time', region => current_setting('test.region')::uuid,
                       sector => current_setting('test.sector')::uuid,
                       description => repeat('Keep the books for a small shop and report each month. ', 3),
                       closing => 30, skills => array['bookkeeping'], no_fee => false),
  'no_fee_required', 'sending still needs the no-fee tick');
select is(pg_temp.save('job', 'Bookkeeper for a shop', true, pg_temp.id('Bookkeeper for a shop'),
                       employment => 'full_time', region => current_setting('test.region')::uuid,
                       sector => current_setting('test.sector')::uuid,
                       description => repeat('Keep the books for a small shop and report each month. ', 3),
                       closing => 30, skills => array['bookkeeping'], no_fee => true),
  'ok', 'a complete post is sent');
select is((select status from public.opportunities where id = pg_temp.id('Bookkeeper for a shop')), 'pending_review',
  'and goes to review');

select is(pg_temp.save('tender', 'Supply of school desks', false, tender => '{"reference_no": "T"}'::jsonb), 'ok',
  'a tender draft can hold an unfinished reference');
select is(pg_temp.save('tender', 'Supply of school desks', true, pg_temp.id('Supply of school desks'),
                       region => current_setting('test.region')::uuid, sector => current_setting('test.sector')::uuid,
                       description => repeat('Supply 200 desks to a school in Mwanza with delivery. ', 3),
                       closing => 30, no_fee => true, tender => '{"reference_no": "T"}'::jsonb),
  'invalid_tender', 'but cannot be sent with it');

reset role;
select throws_ok($$update public.opportunities set status = 'published'
                   where id = pg_temp.id('Supply of school desks')$$,
  '23514', null, 'the table refuses an unfinished post that is not a draft');

select * from finish();
rollback;
