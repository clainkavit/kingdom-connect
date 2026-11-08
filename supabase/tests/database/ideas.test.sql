begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(30);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000024' || k)::uuid, 'id' || k || '@test.invalid'
from unnest(array['01', '02', '03', 'a1']) k;
insert into public.members (id, username, status, posting_suspended_until) values
  ('00000000-0000-0000-0000-000000002401', 'id_owner', 'approved', null),
  ('00000000-0000-0000-0000-000000002402', 'id_reader', 'approved', null),
  ('00000000-0000-0000-0000-000000002403', 'id_paused', 'approved', 'infinity');
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000024a1', 'Idea Checker', 'admin', true);
insert into public.member_private (member_id, phone, email, language)
select ('00000000-0000-0000-0000-0000000024' || k)::uuid, '+2557120004' || k, 'id' || k || '@test.invalid', 'en'
from unnest(array['01', '02', '03']) k;
insert into public.profiles (member_id, full_name) values ('00000000-0000-0000-0000-000000002401', 'Asha Mwita');
insert into public.verification_requests (member_id, level, status, submitted_at, decided_at)
select ('00000000-0000-0000-0000-0000000024' || k)::uuid, 1, 'approved', now(), now()
from unnest(array['01', '02', '03']) k;
select set_config('test.sector', (select id::text from public.sectors order by name_en limit 1), true);

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000024' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
create function pg_temp.save(
  title text default 'Solar dryers for fruit farmers',
  problem text default 'Farmers lose much of their mango harvest because it spoils before market.',
  stage text default 'prototype', seeking text default 'investor',
  min_tzs bigint default 10000000, max_tzs bigint default 50000000, show_owner boolean default true,
  description text default repeat('A low-cost solar dryer built from local materials for farm groups. ', 2),
  financials text default 'Each dryer costs TZS 1.2M and pays back in one season.',
  submit boolean default true, idea uuid default null
) returns text language sql as $$
  select result from public.save_idea(idea, title, problem, current_setting('test.sector')::uuid, stage, seeking,
    min_tzs, max_tzs, show_owner, description, 'Sell to farm groups', 'Lake Zone', financials, 'Two engineers',
    submit);
$$;
create function pg_temp.idea(t text) returns uuid language sql as $$ select id from public.ideas where title = t; $$;

set local role authenticated;
select pg_temp.login('03');
select is(pg_temp.save(), 'posting_paused', 'a member whose posting is paused cannot share an idea');

select pg_temp.login('01');
select throws_ok($$insert into public.ideas (owner_id, title, problem, sector_id, stage, seeking)
                   values ('00000000-0000-0000-0000-000000002401', 'Direct', repeat('x', 30),
                           current_setting('test.sector')::uuid, 'idea', 'partner')$$,
  '42501', null, 'nobody writes to the table directly');
select is(pg_temp.save(problem => 'Too short'), 'invalid_problem', 'the problem is at least 20 characters');
select is(pg_temp.save(stage => 'famous'), 'invalid_stage', 'the stage is one of the four');
select is(pg_temp.save(min_tzs => 60000000), 'invalid_range', 'the investment range runs low to high');
select is(pg_temp.save(description => 'Short'), 'invalid_description', 'the description is at least 50 characters');
select is(pg_temp.save(financials => 'Call 0754 123 456 for the numbers'), 'contact_details',
  'phone numbers are blocked in the details too');
select is(pg_temp.save(submit => false), 'draft', 'the owner saves a draft');
select is(pg_temp.save(idea => pg_temp.idea('Solar dryers for fruit farmers')), 'pending_moderation',
  'and sends it for moderation');
select is(pg_temp.save(idea => pg_temp.idea('Solar dryers for fruit farmers')), 'not_editable',
  'it cannot be edited while it waits');
select is(pg_temp.save(title => 'Mobile clinic scheduling', seeking => 'partner', min_tzs => null, max_tzs => null,
                       show_owner => false), 'pending_moderation', 'the owner shares a second idea without a name');
select is((select count(*)::int from public.ideas), 2, 'the owner sees their ideas');
select is((select count(*)::int from public.idea_details), 2, 'and their details');

select pg_temp.login('02');
select is((select count(*)::int from public.idea_summaries), 0, 'nothing is in the pool before moderation');
select is((select count(*)::int from public.ideas), 0, 'another member never reads the ideas table');

select pg_temp.login('a1');
select is((select count(*)::int from public.idea_review_queue()), 2, 'staff see both ideas with their details');
select is((select financials from public.idea_review_queue() where title = 'Solar dryers for fruit farmers'),
  'Each dryer costs TZS 1.2M and pays back in one season.', 'including the confidential layer');
select is(public.decide_idea(pg_temp.idea('Solar dryers for fruit farmers'), true, null), 'ok', 'staff approve one');
select is(public.decide_idea(pg_temp.idea('Mobile clinic scheduling'), true, null), 'ok', 'and the other');

select pg_temp.login('02');
select is((select count(*)::int from public.idea_summaries), 2, 'a member sees both summaries');
select is((select owner_name from public.idea_summaries where title = 'Solar dryers for fruit farmers'), 'Asha Mwita',
  'a named idea shows its owner');
select is((select row(owner_id, owner_name)::text from public.idea_summaries where title = 'Mobile clinic scheduling'),
  '(,)', 'an idea without a name hides who owns it');
select is((select count(*)::int from public.idea_details), 0, 'a member never sees the details');
select ok(not exists (select 1 from information_schema.columns where table_schema = 'public'
                      and table_name = 'idea_summaries'
                      and column_name in ('description', 'business_model', 'market', 'financials', 'team',
                                          'show_owner', 'review_reason')),
  'the summary view carries no confidential field');

select pg_temp.login('01');
select is(public.archive_idea(pg_temp.idea('Solar dryers for fruit farmers')), 'ok', 'the owner archives an idea');
select pg_temp.login('02');
select is((select string_agg(title, ',') from public.idea_summaries), 'Mobile clinic scheduling',
  'an archived idea leaves the pool');
select is(public.archive_idea(pg_temp.idea('Mobile clinic scheduling')), 'not_found',
  'only the owner archives');

reset role;
select ok(exists (select 1 from public.notifications where kind = 'O5'
                  and member_id = '00000000-0000-0000-0000-000000002401'), 'O5 tells the owner the idea is live');
select ok(not has_table_privilege('anon', 'public.idea_summaries', 'select'), 'signed-out visitors see no ideas');
select ok(not has_table_privilege('anon', 'public.idea_details', 'select'), 'nor any details');

select * from finish();
rollback;
