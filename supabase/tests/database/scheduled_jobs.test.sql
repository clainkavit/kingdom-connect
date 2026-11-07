begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- Every job here runs on a fixed clock: 10 March 2030, 09:00 in Tanzania, and later moments from there.
create function pg_temp.clock(later interval default '0') returns timestamptz language sql as $$
  select '2030-03-10 09:00:00+03'::timestamptz + later;
$$;

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000034' || k)::uuid, 'sj' || k || '@test.invalid'
from unnest(array['01', '02', '03']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000003401', 'sj_trader', 'approved'),
  ('00000000-0000-0000-0000-000000003402', 'sj_late', 'approved'),
  ('00000000-0000-0000-0000-000000003403', 'sj_guest', 'approved');
insert into public.member_private (member_id, phone, email, language)
select ('00000000-0000-0000-0000-0000000034' || k)::uuid, '+2557120034' || k, 'sj' || k || '@test.invalid', 'en'
from unnest(array['01', '02', '03']) k;
insert into public.profiles (member_id, full_name) values
  ('00000000-0000-0000-0000-000000003401', 'Asha Mwita'),
  ('00000000-0000-0000-0000-000000003403', 'Neema Joseph');

-- Licences: 01's ends on 20 March (10 days on the clock), 02's ended on 9 March.
insert into public.businesses (id, member_id, name, sector_id, size, level, status)
select ('00000000-0000-0000-0000-00000000b4' || k)::uuid, ('00000000-0000-0000-0000-0000000034' || k)::uuid,
       'Clock Business ' || k, (select id from public.sectors order by name_en limit 1), 'small', 2, 'approved'
from unnest(array['01', '02']) k;
insert into public.business_private (business_id, brela_no, tin, licence_no, licence_expires_on) values
  ('00000000-0000-0000-0000-00000000b401', 'BRELA-3401', '340-340-01', 'LIC-3401', '2030-03-20'),
  ('00000000-0000-0000-0000-00000000b402', 'BRELA-3402', '340-340-02', 'LIC-3402', '2030-03-09');
insert into public.verification_requests (member_id, level, status, business_id, submitted_at, decided_at)
select ('00000000-0000-0000-0000-0000000034' || k)::uuid, l, 'approved',
       case when l = 1 then null else ('00000000-0000-0000-0000-00000000b4' || k)::uuid end, now(), now()
from unnest(array['01', '02']) k cross join unnest(array[1, 2]) l;

-- An event at 10:00 on 11 March, 25 hours after the clock; 03 is registered.
insert into public.events (id, poster_member_id, title, starts_at, venue, capacity, status) values
  ('00000000-0000-0000-0000-00000000e341', '00000000-0000-0000-0000-000000003401', 'Traders breakfast',
   '2030-03-11 10:00:00+03', 'Mwanza hall', 50, 'published');
insert into public.registrations (member_id, event_id, status)
  values ('00000000-0000-0000-0000-000000003403', '00000000-0000-0000-0000-00000000e341', 'registered');

-- A plan proposed by 01 to 03 at the clock, waiting for an answer.
insert into public.ideas (id, owner_id, title, problem, sector_id, stage, seeking, status, published_at) values
  ('00000000-0000-0000-0000-00000000e342', '00000000-0000-0000-0000-000000003401', 'Cold storage',
   'Fish spoils on the way to market every week.', (select id from public.sectors order by name_en limit 1),
   'idea', 'partner', 'published', now());
insert into public.milestone_plans (id, member_a, member_b, idea_id, started_by, created_at, expires_at) values
  ('00000000-0000-0000-0000-0000000a3401', '00000000-0000-0000-0000-000000003401',
   '00000000-0000-0000-0000-000000003403', '00000000-0000-0000-0000-00000000e342',
   '00000000-0000-0000-0000-000000003401', pg_temp.clock(), pg_temp.clock('14 days'));

-- A sign-in lockout that ends 15 minutes after the clock.
insert into private.login_attempts (identifier, failed_count, locked_until)
  values ('sj-locked@test.invalid', 5, pg_temp.clock('15 minutes'));

create function pg_temp.count(kind text) returns int language sql as $$
  select count(*)::int from public.notifications
  where notifications.kind = count.kind and member_id::text like '%0000000034%';
$$;

-- Licence expiry: daily. Counted for this test's members only, as seed businesses may lapse on this clock too.
select private.check_licence_expiry(pg_temp.clock());
select is(pg_temp.count('B3') || ' ' || pg_temp.count('B4'), '1 1',
  'licences: B3 to the one ending in 10 days, B4 to the one ended');
select private.check_licence_expiry(pg_temp.clock());
select is(pg_temp.count('B3') || ' ' || pg_temp.count('B4'), '1 1', 'run twice, it sends nothing more');
select is((select status from public.businesses where id = '00000000-0000-0000-0000-00000000b402'), 'expired',
  'the ended licence is expired');
select private.check_licence_expiry(pg_temp.clock('4 days'));
select is(pg_temp.count('B3'), 2, 'with 6 days left, the 7-day reminder goes');
select private.check_licence_expiry(pg_temp.clock('4 days 1 hour'));
select is(pg_temp.count('B3'), 2, 'once');
select is((select string_agg(reminder::text, ',' order by reminder) from private.licence_reminders
           where business_id = '00000000-0000-0000-0000-00000000b401'), '7,30', 'both reminders are logged');

-- Event reminders: every 5 minutes.
select is(private.send_event_reminders(pg_temp.clock()), 0, 'events: nothing 25 hours before');
select is(private.send_event_reminders(pg_temp.clock('1 hour 5 minutes')), 1, 'T1 inside the last day');
select is(private.send_event_reminders(pg_temp.clock('1 hour 10 minutes')), 0, 'run twice, no second T1');
select is(private.send_event_reminders(pg_temp.clock('24 hours 5 minutes')), 1, 'T2 inside the last hour');
select is(private.send_event_reminders(pg_temp.clock('24 hours 10 minutes')), 0, 'run twice, no second T2');
select is(private.send_event_reminders(pg_temp.clock('26 hours')), 0, 'nothing once it has started');

-- Milestone plan deadlines: every 15 minutes.
select is(private.run_plan_deadlines(pg_temp.clock('6 days')), 0, 'plans: nothing before day 7');
select is(private.run_plan_deadlines(pg_temp.clock('7 days')), 1, 'P2 on day 7');
select is(private.run_plan_deadlines(pg_temp.clock('7 days 15 minutes')), 0, 'run twice, no second P2');
select is(private.run_plan_deadlines(pg_temp.clock('13 days 23 hours')), 0, 'still pending the day before');
select is(private.run_plan_deadlines(pg_temp.clock('14 days')), 1, 'lapsed with P8 on day 14');
select is(private.run_plan_deadlines(pg_temp.clock('14 days 15 minutes')), 0, 'run twice, nothing more');
select is((select status from public.milestone_plans where id = '00000000-0000-0000-0000-0000000a3401'), 'lapsed',
  'the plan is Lapsed');

-- Sign-in lockouts: every 10 minutes.
select is(private.clear_sign_in_lockouts(pg_temp.clock('10 minutes')), 0, 'lockouts: kept while time remains');
select is(private.clear_sign_in_lockouts(pg_temp.clock('20 minutes')), 1, 'cleared once the time is up');
select is(private.clear_sign_in_lockouts(pg_temp.clock('30 minutes')), 0, 'run twice, nothing more');

select * from finish();
rollback;
