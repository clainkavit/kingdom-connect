begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(33);

insert into public.legal_texts (kind, version, body_en, body_sw, approved_at, effective_at)
  values ('handoff', '9.0', 'Hand-off nine', 'Makabidhiano tisa', now(), now() - interval '1 day');

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000030' || k)::uuid, 'mp' || k || '@test.invalid'
from unnest(array['01', '02', '03', '04', 'a1']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000003001', 'mp_owner', 'approved'),
  ('00000000-0000-0000-0000-000000003002', 'mp_partner', 'approved'),
  ('00000000-0000-0000-0000-000000003003', 'mp_investor', 'approved'),
  ('00000000-0000-0000-0000-000000003004', 'mp_outsider', 'approved');
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000030a1', 'Plan Desk', 'admin', true);
insert into public.member_private (member_id, phone, email, language)
select ('00000000-0000-0000-0000-0000000030' || k)::uuid, '+2557120010' || k, 'mp' || k || '@test.invalid', 'en'
from unnest(array['01', '02', '03', '04']) k;
insert into public.profiles (member_id, full_name) values
  ('00000000-0000-0000-0000-000000003001', 'Asha Mwita'),
  ('00000000-0000-0000-0000-000000003002', 'Neema Joseph'),
  ('00000000-0000-0000-0000-000000003003', 'Baraka Mtaji');
insert into public.verification_requests (member_id, level, status, submitted_at, decided_at)
select ('00000000-0000-0000-0000-0000000030' || k)::uuid, 1, 'approved', now(), now()
from unnest(array['01', '02', '03', '04']) k;
insert into public.ideas (id, owner_id, title, problem, sector_id, stage, seeking, status, published_at) values
  ('00000000-0000-0000-0000-00000000e301', '00000000-0000-0000-0000-000000003001', 'Solar dryers',
   'Farmers lose much of their harvest before market.', (select id from public.sectors order by name_en limit 1),
   'prototype', 'both', 'published', now());
insert into public.idea_access_requests (idea_id, requester_id, role, status, decided_at) values
  ('00000000-0000-0000-0000-00000000e301', '00000000-0000-0000-0000-000000003002', 'partner', 'nda_accepted', now()),
  ('00000000-0000-0000-0000-00000000e301', '00000000-0000-0000-0000-000000003003', 'investor', 'nda_accepted', now());

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000030' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
create function pg_temp.member(who text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000030' || who)::uuid;
$$;
create function pg_temp.idea() returns uuid language sql as $$ select '00000000-0000-0000-0000-00000000e301'::uuid; $$;
create function pg_temp.handoff() returns uuid language sql as $$
  select id from public.legal_texts where kind = 'handoff' and version = '9.0';
$$;
create function pg_temp.steps(day text default (current_date + 30)::text, title text default 'Build the first dryer')
returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('title', title, 'description', 'A working dryer at one farm.', 'target_date', day,
                       'responsible', 'me'),
    jsonb_build_object('title', 'First investment', 'description', '', 'target_date', (current_date + 60)::text,
                       'responsible', 'other'));
$$;
create function pg_temp.propose(other text, steps jsonb default pg_temp.steps(), handoff uuid default pg_temp.handoff())
returns text language sql as $$
  select result from public.propose_plan(pg_temp.idea(), pg_temp.member(other), steps, handoff);
$$;
create function pg_temp.plan_with(a text, b text) returns uuid language sql as $$
  select id from public.milestone_plans
  where member_a = least(pg_temp.member(a), pg_temp.member(b)) and member_b = greatest(pg_temp.member(a), pg_temp.member(b))
  order by created_at desc, (status = 'pending') desc limit 1;
$$;

set local role authenticated;
select pg_temp.login('04');
select is(pg_temp.propose('01'), 'not_allowed', 'a member not connected through the idea cannot propose');
select is((select count(*)::int from public.plan_partners()), 0, 'and has nobody to plan with');

select pg_temp.login('02');
select is((select string_agg(other_name, ',') from public.plan_partners()), 'Asha Mwita',
  'a requester past the NDA can plan with the owner');
select is(pg_temp.propose('01', pg_temp.steps(day => '2020-01-01')), 'invalid_date', 'target dates are not in the past');
select is(pg_temp.propose('01', pg_temp.steps(title => 'Call 0754 123 456')), 'contact_details',
  'stages carry no contact details');
select is(pg_temp.propose('01', handoff => gen_random_uuid()), 'handoff_changed',
  'the disclaimer shown must be the current one');
select is((select count(*)::int from public.milestone_plans), 0, 'and then nothing is stored');
select is(pg_temp.propose('01'), 'ok', 'the requester proposes a plan');
select is(pg_temp.propose('01'), 'already_planned', 'one live plan per pair and idea');
select throws_ok($$insert into public.milestone_plans (member_a, member_b, idea_id, started_by)
                   values (pg_temp.member('01'), pg_temp.member('02'), pg_temp.idea(), pg_temp.member('02'))$$,
  '42501', null, 'nobody writes to the table directly');
select is(public.accept_plan(pg_temp.plan_with('01', '02'), pg_temp.handoff()), 'own_plan',
  'the proposer cannot accept their own plan');

select pg_temp.login('04');
select is((select count(*)::int from public.milestone_plans), 0, 'another member never reads the plan');
select is((select count(*)::int from public.milestones), 0, 'nor its milestones');

select pg_temp.login('01');
select is((select string_agg(position || ' ' || title || ' ' || status, ',' order by position)
           from public.milestones where plan_id = pg_temp.plan_with('01', '02')),
  '1 Agreed in principle open,2 Build the first dryer open,3 First investment open',
  'the other member reads the stages, stage 1 first');
select is((select responsible_member_id from public.milestones where position = 3), pg_temp.member('01'),
  'with who is responsible for each');
select is((select other_name || ' ' || item_title || ' ' || status from public.my_plans()),
  'Neema Joseph Solar dryers pending', 'My plans lists it as pending');
select is(public.accept_plan(pg_temp.plan_with('01', '02'), gen_random_uuid()), 'handoff_changed',
  'accepting needs the current disclaimer');
select is(public.accept_plan(pg_temp.plan_with('01', '02'), pg_temp.handoff()), 'ok', 'the other member accepts');
select is((select status from public.milestone_plans where id = pg_temp.plan_with('01', '02')), 'active',
  'the plan is active');
select is((select status from public.milestones where plan_id = pg_temp.plan_with('01', '02') and position = 1),
  'confirmed', 'and stage 1 is agreed');

select pg_temp.login('a1');
select is((select count(*)::int from public.milestones where plan_id = pg_temp.plan_with('01', '02')), 3,
  'staff see the stages');

reset role;
select is((select count(*)::int from public.legal_acceptances a join public.legal_texts t on t.id = a.legal_text_id
           where a.context_type = 'plan' and a.context_id = pg_temp.plan_with('01', '02') and t.version = '9.0'), 2,
  'both disclaimer acceptances are stored with their version');
select ok((select a_acceptance_id is not null and b_acceptance_id is not null from public.milestone_plans
           where id = pg_temp.plan_with('01', '02')), 'and linked to the plan');
select is((select string_agg(kind || '>' || member_id::text, ',' order by kind) from public.notifications
           where kind like 'P%' and member_id in (pg_temp.member('01'), pg_temp.member('02'))),
  'P1>' || pg_temp.member('01') || ',P3>' || pg_temp.member('02'), 'P1 tells the other member, P3 the proposer');
select throws_ok($$delete from public.milestone_plans$$, 'P0001', null, 'a plan is never deleted');
select throws_ok($$update public.milestones set title = 'Changed' where position = 1$$, 'P0001', null,
  'a confirmed milestone is never changed');

-- The owner proposes to the investor, who never answers.
set local role authenticated;
select pg_temp.login('01');
select is(pg_temp.propose('03'), 'ok', 'the owner proposes to another partner');
reset role;
update public.milestone_plans set expires_at = now() + interval '6 days' where id = pg_temp.plan_with('01', '03');
select private.run_plan_deadlines();
select is((select count(*)::int from public.notifications where kind = 'P2' and member_id = pg_temp.member('03')), 1,
  'on day 7 the other member is reminded once');
update public.milestone_plans set expires_at = now() - interval '1 minute' where id = pg_temp.plan_with('01', '03');
select private.run_plan_deadlines();
select is((select status from public.milestone_plans where id = pg_temp.plan_with('01', '03')), 'lapsed',
  'after 14 days the plan lapses');
select is((select count(*)::int from public.notifications where kind = 'P8' and member_id = pg_temp.member('01')), 1,
  'and P8 tells the proposer');

set local role authenticated;
select pg_temp.login('03');
select is((select result from public.restart_plan(pg_temp.plan_with('01', '03'), pg_temp.handoff())), 'ok',
  'either member can start it again');
select pg_temp.login('01');
select is(public.withdraw_plan(pg_temp.plan_with('01', '03')), 'not_allowed', 'only the proposer withdraws while pending');
select pg_temp.login('03');
select is(public.withdraw_plan(pg_temp.plan_with('01', '03')), 'ok', 'the proposer withdraws');

select * from finish();
rollback;
