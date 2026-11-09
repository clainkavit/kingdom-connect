begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(50);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000019' || k)::uuid, 'op' || k || '@test.invalid'
from unnest(array['01', '02', '03', '04', '05', 'a1']) k;
insert into public.members (id, username, status, posting_suspended_until) values
  ('00000000-0000-0000-0000-000000001901', 'op_poster', 'approved', null),
  ('00000000-0000-0000-0000-000000001902', 'op_level1', 'approved', null),
  ('00000000-0000-0000-0000-000000001903', 'op_level2', 'approved', null),
  ('00000000-0000-0000-0000-000000001904', 'op_paused', 'approved', 'infinity'),
  ('00000000-0000-0000-0000-000000001905', 'op_reader', 'approved', null);
insert into public.member_private (member_id, phone, email, language)
select ('00000000-0000-0000-0000-0000000019' || k)::uuid, '+2557120019' || k, 'op' || k || '@test.invalid', 'en'
from unnest(array['01', '02', '03', '04', '05']) k;
insert into public.verification_requests (member_id, level, status, submitted_at, decided_at)
select ('00000000-0000-0000-0000-0000000019' || k)::uuid, l, 'approved', now(), now()
from (values ('01', 1), ('01', 2), ('01', 3), ('02', 1), ('03', 1), ('03', 2), ('04', 1), ('04', 2), ('04', 3), ('05', 1))
  as x (k, l);
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000019a1', 'Post Checker', 'admin', true);
select set_config('test.sector', (select id::text from public.sectors order by name_en limit 1), true);
select set_config('test.region', (select id::text from public.regions where name_en = 'Mwanza'), true);
select set_config('test.today', private.tanzania_today()::text, true);

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000019' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
create function pg_temp.post(
  kind text default 'job', title text default 'Site supervisor for road works',
  description text default repeat('Supervise a road crew in Mwanza and report each week. ', 3),
  skills text[] default array['supervision', 'civil works'], employment text default 'full_time',
  closing int default 30, no_fee boolean default true, send boolean default true, existing uuid default null
) returns text language sql as $$
  select result from public.save_opportunity(existing, kind, title, null, employment,
    current_setting('test.region')::uuid, null, false, current_setting('test.sector')::uuid, description,
    current_setting('test.today')::date + closing, skills, no_fee, send);
$$;
create function pg_temp.post_id(title text) returns uuid language sql as $$
  select id from public.opportunities where opportunities.title = post_id.title order by created_at desc limit 1;
$$;
create function pg_temp.status(title text) returns text language sql as $$
  select status from public.opportunities where opportunities.title = status.title order by created_at desc limit 1;
$$;

set local role authenticated;
select pg_temp.login('02');
select is(pg_temp.post(), 'level3_required', 'a Level 1 member cannot post');
select pg_temp.login('03');
select is(pg_temp.post(), 'level3_required', 'nor a Level 2 member');
select pg_temp.login('04');
select is(pg_temp.post(), 'posting_paused', 'nor a poster whose posting is paused');

select pg_temp.login('01');
select throws_ok($$insert into public.opportunities (poster_member_id, type, title, sector_id, description, closing_at)
                   values (auth.uid(), 'job', 'Direct', current_setting('test.sector')::uuid, repeat('x', 120), current_date + 5)$$,
  '42501', null, 'an opportunity cannot be written directly');
select is(pg_temp.post(kind => 'tender', employment => null, skills => '{}'), 'invalid_tender', 'a tender needs its own fields');
select is(pg_temp.post(description => 'Too short'), 'too_short', 'the description is at least 100 characters');
select is(pg_temp.post(closing => 91), 'invalid_closing', 'the closing date is at most 90 days ahead');
select is(pg_temp.post(closing => 0), 'invalid_closing', 'and after today');
select is(pg_temp.post(employment => null), 'invalid_employment', 'a job has an employment type');
select is(pg_temp.post(kind => 'partnership', employment => 'full_time'), 'invalid_employment', 'and only a job has one');
select is(pg_temp.post(skills => '{}'), 'skills_required', 'a job needs at least one skill');
select is(pg_temp.post(skills => array['a', 'b', 'c', 'd', 'e', 'f']), 'too_many_skills', 'and at most 5');
select is(pg_temp.post(description => repeat('Call 0712345678 for the details of this work please. ', 3)), 'contact_details',
  'phone numbers in the text are refused');
select is(pg_temp.post(title => 'Write to me at boss@example.test'), 'contact_details', 'and emails too');
select is(pg_temp.post(skills => array['supervision', 'call 0712345678']), 'contact_details', 'and in the skills');
select is(pg_temp.post(no_fee => false), 'no_fee_required', 'a member poster ticks the no-fee declaration');
select is(pg_temp.post(title => 'Draft supervisor post', send => false), 'ok', 'a member saves a draft');
select is(pg_temp.status('Draft supervisor post'), 'draft', 'which stays a draft');
select is(pg_temp.post(kind => 'partnership', title => 'Partner for a cold store', employment => null, skills => '{}'), 'ok',
  'a partnership needs no skills');
select is(pg_temp.status('Partner for a cold store'), 'pending_review', 'a new poster''s post waits for review');

select pg_temp.login('05');
select is((select count(*)::int from public.opportunities), 0, 'other members see no draft or pending post');
select throws_ok($$select public.moderate_opportunity(pg_temp.post_id('Partner for a cold store'), 'approve')$$,
  'P0001', 'not_allowed', 'nor moderate');

select pg_temp.login('a1');
select is(public.moderate_opportunity(pg_temp.post_id('Partner for a cold store'), 'reject', 'post_unclear', null), 'ok',
  'staff send a post back with a reason');
reset role;
select is((select payload from public.notifications where kind = 'O6' and member_id = '00000000-0000-0000-0000-000000001901'),
  '{"title": "Partner for a cold store", "reason": "The post is not clear enough"}'::jsonb, 'O6 tells the poster why');
set local role authenticated;
select pg_temp.login('01');
select is((select row(status, reason)::text from public.my_opportunities() where title = 'Partner for a cold store'),
  '(draft,"The post is not clear enough")', 'the poster sees it back as a draft with the reason');
select is(pg_temp.post(kind => 'partnership', title => 'Partner for a cold store', employment => null, skills => '{}',
                       existing => pg_temp.post_id('Partner for a cold store')), 'ok', 'and edits and sends it again');

select pg_temp.login('a1');
select is(public.moderate_opportunity(pg_temp.post_id('Partner for a cold store'), 'approve'), 'ok', 'staff approve it');
reset role;
select ok(exists (select 1 from public.notifications where kind = 'O5' and member_id = '00000000-0000-0000-0000-000000001901'),
  'O5 tells the poster it is live');
set local role authenticated;
select pg_temp.login('05');
select is((select status from public.opportunities where title = 'Partner for a cold store'), 'published',
  'members see the published post');
select pg_temp.login('01');
select is(pg_temp.post(kind => 'partnership', title => 'Partner for a cold store', employment => null, skills => '{}',
                       existing => pg_temp.post_id('Partner for a cold store')), 'not_editable', 'a published post is not edited');

select is(pg_temp.post(title => 'Second reviewed post'), 'ok', 'the poster sends a second post');
select is(pg_temp.post(title => 'Third reviewed post'), 'ok', 'and a third');
select pg_temp.login('a1');
select is(public.moderate_opportunity(pg_temp.post_id('Second reviewed post'), 'approve')
          || public.moderate_opportunity(pg_temp.post_id('Third reviewed post'), 'approve'), 'okok', 'both are approved');
select pg_temp.login('01');
select is(pg_temp.post(title => 'Fourth post goes live'), 'ok', 'after 3 approvals');
select is(pg_temp.status('Fourth post goes live'), 'published', 'a post publishes at once');
select is(pg_temp.post(title => 'Fifth post with a link',
                       description => repeat('See more details at https://jobs.example and apply soon please. ', 3)), 'ok',
  'a post with a link');
select is(pg_temp.status('Fifth post with a link'), 'pending_review', 'still goes to review');
select pg_temp.login('a1');
select is(public.moderate_opportunity(pg_temp.post_id('Fifth post with a link'), 'reject', 'post_unclear', null), 'ok',
  'staff send it back');
select pg_temp.login('01');
select is(pg_temp.post(title => 'Fifth post with a link', existing => pg_temp.post_id('Fifth post with a link')), 'ok',
  'the poster edits it and sends it again');
select is(pg_temp.status('Fifth post with a link'), 'pending_review',
  'a post that was sent back is reviewed again, whatever the poster''s record');
select throws_ok($$select reason_code from public.opportunities$$, '42501', null, 'a poster cannot read the review columns');
select pg_temp.login('05');
select throws_ok($$select reviewed_by, approved_at from public.opportunities$$, '42501', null, 'nor can other members');
select pg_temp.login('01');
select is((select string_agg(s.name::text, ',' order by s.name) from public.opportunity_skills os
           join public.skills s on s.id = os.skill_id where os.opportunity_id = pg_temp.post_id('Fourth post goes live')),
  'civil works,supervision', 'skills are stored as tags');

select is(public.close_opportunity(pg_temp.post_id('Fourth post goes live')), 'ok', 'the poster closes a post early');
select is(pg_temp.status('Fourth post goes live'), 'closed', 'and it is closed');

select pg_temp.login('a1');
select is(public.moderate_opportunity(pg_temp.post_id('Second reviewed post'), 'remove', 'post_misleading', null), 'ok',
  'staff remove a published post with a reason');
select is((select result from public.save_opportunity(null, 'investment', 'Community investment call', null, null, null,
             null, true, current_setting('test.sector')::uuid, repeat('Invest in a community water project. ', 4),
             current_setting('test.today')::date + 20, '{}', false, true)), 'ok', 'staff post an opportunity');
select is((select row(type, status, poster_staff_id is not null, no_fee_declared)::text from public.opportunities
           where title = 'Community investment call'), '(investment,published,t,f)',
  'an admin post publishes at once without the no-fee tick');

reset role;
update public.opportunities set closing_at = current_setting('test.today')::date - 1
where title = 'Third reviewed post';
select ok(private.expire_opportunities() >= 1, 'the daily check runs');
select is(pg_temp.status('Third reviewed post'), 'expired', 'a post past its closing date expires');

select * from finish();
rollback;
