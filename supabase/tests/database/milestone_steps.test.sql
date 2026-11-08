begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(24);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000031' || k)::uuid, 'ms' || k || '@test.invalid'
from unnest(array['01', '02', '03', '04']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000003101', 'ms_owner', 'approved'),
  ('00000000-0000-0000-0000-000000003102', 'ms_partner', 'approved'),
  ('00000000-0000-0000-0000-000000003103', 'ms_investor', 'approved'),
  ('00000000-0000-0000-0000-000000003104', 'ms_outsider', 'approved');
insert into public.member_private (member_id, phone, email, language)
select ('00000000-0000-0000-0000-0000000031' || k)::uuid, '+2557120011' || k, 'ms' || k || '@test.invalid', 'en'
from unnest(array['01', '02', '03', '04']) k;
insert into public.profiles (member_id, full_name) values
  ('00000000-0000-0000-0000-000000003101', 'Asha Mwita'),
  ('00000000-0000-0000-0000-000000003102', 'Neema Joseph'),
  ('00000000-0000-0000-0000-000000003103', 'Baraka Mtaji');
insert into public.verification_requests (member_id, level, status, submitted_at, decided_at)
select ('00000000-0000-0000-0000-0000000031' || k)::uuid, 1, 'approved', now(), now()
from unnest(array['01', '02', '03', '04']) k;
insert into public.ideas (id, owner_id, title, problem, sector_id, stage, seeking, status, published_at) values
  ('00000000-0000-0000-0000-00000000e311', '00000000-0000-0000-0000-000000003101', 'Solar dryers',
   'Farmers lose much of their harvest before market.', (select id from public.sectors order by name_en limit 1),
   'prototype', 'both', 'published', now());
-- Plan A was agreed 10 minutes ago, plan B two hours ago.
insert into public.milestone_plans (id, member_a, member_b, idea_id, started_by, status, stage1_agreed_at) values
  ('00000000-0000-0000-0000-0000000a3101', '00000000-0000-0000-0000-000000003101',
   '00000000-0000-0000-0000-000000003102', '00000000-0000-0000-0000-00000000e311',
   '00000000-0000-0000-0000-000000003101', 'active', now() - interval '10 minutes'),
  ('00000000-0000-0000-0000-0000000a3102', '00000000-0000-0000-0000-000000003101',
   '00000000-0000-0000-0000-000000003103', '00000000-0000-0000-0000-00000000e311',
   '00000000-0000-0000-0000-000000003101', 'active', now() - interval '2 hours');
insert into public.milestones (id, plan_id, position, title, responsible_member_id, status, confirmed_at) values
  ('00000000-0000-0000-0000-0000000b3101', '00000000-0000-0000-0000-0000000a3101', 1, 'Agreed in principle',
   '00000000-0000-0000-0000-000000003101', 'confirmed', now()),
  ('00000000-0000-0000-0000-0000000b3102', '00000000-0000-0000-0000-0000000a3101', 2, 'Build the first dryer',
   '00000000-0000-0000-0000-000000003102', 'open', null),
  ('00000000-0000-0000-0000-0000000b3103', '00000000-0000-0000-0000-0000000a3102', 1, 'Agreed in principle',
   '00000000-0000-0000-0000-000000003101', 'confirmed', now()),
  ('00000000-0000-0000-0000-0000000b3104', '00000000-0000-0000-0000-0000000a3102', 2, 'First investment',
   '00000000-0000-0000-0000-000000003103', 'open', null);

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000031' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
create function pg_temp.member(who text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000031' || who)::uuid;
$$;
create function pg_temp.plan(n text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-0000000a310' || n)::uuid; $$;
create function pg_temp.stage(n text) returns uuid language sql as $$ select ('00000000-0000-0000-0000-0000000b310' || n)::uuid; $$;

set local role authenticated;
select pg_temp.login('04');
select is(public.mark_milestone_done(pg_temp.stage('2')), 'not_found', 'another member cannot touch a plan');

select pg_temp.login('01');
select is(public.mark_milestone_done(pg_temp.stage('2')), 'not_responsible', 'only the member responsible marks done');
select is(public.confirm_milestone(pg_temp.stage('2')), 'not_done', 'a stage is confirmed only after it is done');

select pg_temp.login('02');
select is(public.mark_milestone_done(pg_temp.stage('2')), 'ok', 'the member responsible marks it done');
select is(public.confirm_milestone(pg_temp.stage('2')), 'own_milestone', 'but cannot confirm it');

select pg_temp.login('01');
select is(public.confirm_milestone(pg_temp.stage('2')), 'ok', 'the other member confirms');
select is((select status from public.milestones where id = pg_temp.stage('2')), 'confirmed', 'and it is confirmed');
select is(public.mark_milestone_done(pg_temp.stage('1')), 'not_open', 'a confirmed stage is never marked again');

-- The one-hour window.
select is(public.end_plan(pg_temp.plan('1'), 'Changed our minds'), 'withdraw_instead',
  'in the first hour a plan is withdrawn, not ended');
select pg_temp.login('02');
select is(public.withdraw_plan(pg_temp.plan('1')), 'ok', 'either member withdraws within the hour');
select is((select status from public.milestone_plans where id = pg_temp.plan('1')), 'withdrawn',
  'the plan stays on record as Withdrawn');

select pg_temp.login('03');
select is(public.withdraw_plan(pg_temp.plan('2')), 'not_allowed', 'after the hour stage 1 is final');
select is(public.end_plan(pg_temp.plan('2'), ''), 'reason_required', 'ending needs a reason');
select is(public.end_plan(pg_temp.plan('2'), 'Call me on 0754 123 456'), 'contact_details',
  'which carries no contact details');
select is(public.end_plan(pg_temp.plan('2'), 'The funding fell through'), 'ok', 'either member ends the plan');
select is((select status || ' ' || ended_reason from public.milestone_plans where id = pg_temp.plan('2')),
  'ended The funding fell through', 'it stays on record as Ended with the reason');
select is((select ended_by from public.milestone_plans where id = pg_temp.plan('2')), pg_temp.member('03'),
  'and who ended it');
select is(public.mark_milestone_done(pg_temp.stage('4')), 'not_active', 'nothing moves on an ended plan');

reset role;
select is((select string_agg(kind || '>' || right(member_id::text, 2), ',' order by kind, member_id::text)
           from public.notifications where kind like 'P%' and member_id::text like '%0000000031%'),
  'P10>01,P4>01,P5>02,P9>01,P9>02', 'P4, P5, P9 to both, and P10 to the other member');
select ok((select payload ->> 'reason' = 'The funding fell through' from public.notifications where kind = 'P10'),
  'P10 gives the reason');
select throws_ok($$update public.milestones set title = 'Changed' where id = pg_temp.stage('2')$$, 'P0001', null,
  'a confirmed stage is never edited');
select throws_ok($$delete from public.milestones where id = pg_temp.stage('4')$$, 'P0001', null,
  'nothing is ever deleted: not a stage');
select throws_ok($$delete from public.milestone_plans where id = pg_temp.plan('2')$$, 'P0001', null,
  'nor a plan');
select is((select count(*)::int from public.milestones where plan_id in (pg_temp.plan('1'), pg_temp.plan('2'))), 4,
  'every stage so far is kept');

select * from finish();
rollback;
