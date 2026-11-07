begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(39);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000021' || k)::uuid, 'ev' || k || '@test.invalid'
from unnest(array['01', '02', '03', '04', 'a1']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000002101', 'ev_poster', 'approved'),
  ('00000000-0000-0000-0000-000000002102', 'ev_first', 'approved'),
  ('00000000-0000-0000-0000-000000002103', 'ev_second', 'approved'),
  ('00000000-0000-0000-0000-000000002104', 'ev_third', 'approved');
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000021a1', 'Event Checker', 'admin', true);
insert into public.member_private (member_id, phone, email, language) values
  ('00000000-0000-0000-0000-000000002101', '+255712000211', 'ev01@test.invalid', 'en'),
  ('00000000-0000-0000-0000-000000002102', '+255712000212', 'ev02@test.invalid', 'en'),
  ('00000000-0000-0000-0000-000000002103', '+255712000213', 'ev03@test.invalid', 'sw'),
  ('00000000-0000-0000-0000-000000002104', '+255712000214', 'ev04@test.invalid', 'en');
insert into public.profiles (member_id, full_name, headline) values
  ('00000000-0000-0000-0000-000000002102', 'Neema Joseph', 'Teacher'),
  ('00000000-0000-0000-0000-000000002103', 'Baraka Mushi', 'Farmer');
insert into public.businesses (id, member_id, name, sector_id, size, level, status) values
  ('00000000-0000-0000-0000-00000000b211', '00000000-0000-0000-0000-000000002101', 'Mwanza Events',
   (select id from public.sectors order by name_en limit 1), 'small', 2, 'approved');
insert into public.verification_requests (member_id, level, status, business_id, submitted_at, decided_at) values
  ('00000000-0000-0000-0000-000000002101', 1, 'approved', null, now(), now()),
  ('00000000-0000-0000-0000-000000002101', 2, 'approved', '00000000-0000-0000-0000-00000000b211', now(), now()),
  ('00000000-0000-0000-0000-000000002102', 1, 'approved', null, now(), now()),
  ('00000000-0000-0000-0000-000000002103', 1, 'approved', null, now(), now()),
  ('00000000-0000-0000-0000-000000002104', 1, 'approved', null, now(), now());

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000021' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
create function pg_temp.post(
  title text default 'Business breakfast', details text default 'Meet other members over breakfast.',
  starts timestamptz default now() + interval '3 days', venue text default 'Gold Crest Hotel, Mwanza',
  link text default null, capacity int default 2, submit boolean default true, event uuid default null
) returns text language sql as $$
  select result from public.save_event(event, title, details, starts, venue, link, capacity, submit);
$$;
create function pg_temp.breakfast() returns uuid language sql as $$
  select id from public.events where title = 'Business breakfast';
$$;
create function pg_temp.register(who text) returns text language sql as $$
  select pg_temp.login(who);
  select result || coalesce(':' || waitlist_position, '') from public.register_for_event(pg_temp.breakfast());
$$;

set local role authenticated;
select pg_temp.login('02');
select ok(not public.can_post_event(), 'a Level 1 member may not post an event');
select is(pg_temp.post(), 'not_allowed', 'and saving one is refused');
select throws_ok($$insert into public.events (poster_member_id, title, starts_at, venue, capacity)
                   values ('00000000-0000-0000-0000-000000002102', 'Direct', now() + interval '3 days', 'Hall', 10)$$,
  '42501', null, 'nobody writes to the table directly');

select pg_temp.login('01');
select ok(public.can_post_event(), 'a Level 2 member may post an event');
select is(pg_temp.post(venue => null), 'venue_or_link_required', 'an event has a venue or a link');
select is(pg_temp.post(venue => null, link => 'http://example.test/live'), 'invalid_link', 'a link is https');
select is(pg_temp.post(starts => now() + interval '1 hour'), 'invalid_start', 'an event starts at least 2 hours ahead');
select is(pg_temp.post(capacity => 0), 'invalid_capacity', 'capacity is at least 1');
select is(pg_temp.post(details => 'Call 0712 345 678 to book.'), 'contact_details', 'phone numbers are blocked');
select is(pg_temp.post(submit => false), 'draft', 'a poster saves a draft');
select is(pg_temp.post(event => pg_temp.breakfast()), 'pending_review', 'a member''s event waits for review');
select is(pg_temp.post(event => pg_temp.breakfast()), 'not_editable', 'and cannot be edited while it waits');

select pg_temp.login('02');
select is((select count(*)::int from public.events_feed()), 0, 'other members do not see it yet');
select is((select result from public.register_for_event(pg_temp.breakfast())), 'not_found',
  'nor can they register for it');
select throws_ok($$select public.decide_event(gen_random_uuid(), true, null)$$, 'P0001', 'not_allowed',
  'a member cannot decide an event');

select pg_temp.login('a1');
select is((select count(*)::int from public.event_review_queue()), 1, 'staff see it in the review queue');
select is(public.decide_event(pg_temp.breakfast(), false, null), 'reason_required', 'a rejection needs a reason');
select is(public.decide_event(pg_temp.breakfast(), true, null), 'ok', 'staff approve it');
select is(public.decide_event(pg_temp.breakfast(), true, null), 'already_decided', 'once');
select is(pg_temp.post(title => 'Staff open day', capacity => 50), 'published', 'a staff event publishes at once');

reset role;
select ok(exists (select 1 from public.notifications where kind = 'O5'
                  and member_id = '00000000-0000-0000-0000-000000002101'
                  and payload ->> 'title' = 'Business breakfast'), 'O5 tells the poster it is live');

set local role authenticated;
select is(pg_temp.register('02'), 'registered', 'the first member gets a place');
select is(pg_temp.register('02'), 'registered', 'registering twice changes nothing');
select is(pg_temp.register('03'), 'registered', 'the second member takes the last place');
select is(pg_temp.register('04'), 'waitlisted:1', 'the third joins the waitlist');
select is((select row(registered, my_status, my_waitlist_position)::text from public.events_feed()
           where event_id = pg_temp.breakfast()), '(2,waitlisted,1)', 'the feed shows places taken and the waitlist spot');
select is((select count(*)::int from public.registrations), 1, 'a member sees only their own registration');

select pg_temp.login('01');
select is((select string_agg(coalesce(full_name, '') || ':' || status, ',' order by status, full_name)
           from public.event_registrants(pg_temp.breakfast())),
  'Baraka Mushi:registered,Neema Joseph:registered,:waitlisted', 'the poster sees registrants by name');
select ok(pg_get_function_result('public.event_registrants(uuid)'::regprocedure) !~* '(phone|email|address)',
  'the registrant list never has contact details');

select pg_temp.login('02');
select is((select count(*)::int from public.event_registrants(pg_temp.breakfast())), 0,
  'another member cannot read the registrant list');
select is(public.cancel_event_registration(pg_temp.breakfast()), 'ok', 'a member cancels their place');

reset role;
select is((select status from public.registrations
           where member_id = '00000000-0000-0000-0000-000000002104' and event_id = pg_temp.breakfast()),
  'registered', 'the first member waiting gets the place');
select ok(exists (select 1 from public.notifications where kind = 'W1'
                  and member_id = '00000000-0000-0000-0000-000000002104'), 'and W1 tells them');

-- Reminders: a day before, then an hour before, once each.
update public.events set starts_at = now() + interval '20 hours' where id = pg_temp.breakfast();
select is(private.send_event_reminders(), 2, 'T1 goes to both registered members a day before');
select is(private.send_event_reminders(), 0, 'running the job again sends nothing');
update public.events set starts_at = now() + interval '50 minutes' where id = pg_temp.breakfast();
select is(private.send_event_reminders(), 2, 'T2 goes an hour before');
select is((select count(*)::int from public.notifications
           where kind in ('T1', 'T2') and member_id = '00000000-0000-0000-0000-000000002103'), 2,
  'each member gets one of each');
select is((select count(*)::int from public.notifications
           where kind in ('T1', 'T2') and member_id = '00000000-0000-0000-0000-000000002103'
             and payload ->> 'time' ~ '^[0-9]{2}:[0-9]{2}$'), 2, 'with the start time in Tanzania time');

select ok(not has_table_privilege('anon', 'public.events', 'select'), 'signed-out visitors see no events');

select * from finish();
rollback;
