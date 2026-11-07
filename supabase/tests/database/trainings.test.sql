begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(35);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000022' || k)::uuid, 'tr' || k || '@test.invalid'
from unnest(array['01', '02', '03', '04', '05', 'a1']) k;
insert into public.members (id, username, status, posting_suspended_until) values
  ('00000000-0000-0000-0000-000000002201', 'tr_poster', 'approved', null),
  ('00000000-0000-0000-0000-000000002202', 'tr_first', 'approved', null),
  ('00000000-0000-0000-0000-000000002203', 'tr_second', 'approved', null),
  ('00000000-0000-0000-0000-000000002204', 'tr_third', 'approved', null),
  ('00000000-0000-0000-0000-000000002205', 'tr_paused', 'approved', 'infinity');
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000022a1', 'Training Checker', 'admin', true);
insert into public.member_private (member_id, phone, email, language)
select ('00000000-0000-0000-0000-0000000022' || k)::uuid, '+2557120002' || k, 'tr' || k || '@test.invalid', 'en'
from unnest(array['01', '02', '03', '04', '05']) k;
insert into public.profiles (member_id, full_name, headline) values
  ('00000000-0000-0000-0000-000000002202', 'Neema Joseph', 'Teacher'),
  ('00000000-0000-0000-0000-000000002203', 'Baraka Mushi', 'Farmer'),
  ('00000000-0000-0000-0000-000000002204', 'Amani Kweka', 'Nurse');
insert into public.verification_requests (member_id, level, status, submitted_at, decided_at)
select ('00000000-0000-0000-0000-0000000022' || k)::uuid, 1, 'approved', now(), now()
from unnest(array['01', '02', '03', '04', '05']) k;

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000022' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
create function pg_temp.post(
  title text default 'Bookkeeping basics', provider text default 'Mwanza Business Centre',
  format text default 'in_person', venue text default 'Mkuyuni church hall',
  starts timestamptz default now() + interval '5 days', seats int default 2,
  details text default 'Simple bookkeeping for small businesses.', submit boolean default true,
  training uuid default null
) returns text language sql as $$
  select result from public.save_training(training, title, provider, format, details, venue, starts, seats, false, submit);
$$;
create function pg_temp.course() returns uuid language sql as $$
  select id from public.trainings where title = 'Bookkeeping basics';
$$;
create function pg_temp.register(who text) returns text language sql as $$
  select pg_temp.login(who);
  select result || coalesce(':' || waitlist_position, '') from public.register_for_training(pg_temp.course());
$$;

set local role authenticated;
select pg_temp.login('05');
select ok(not public.can_post_training(), 'a member whose posting is paused may not post training');

select pg_temp.login('01');
select ok(public.can_post_training(), 'any verified member may post training');
select throws_ok($$insert into public.trainings (poster_member_id, title, provider, format, seats)
                   values ('00000000-0000-0000-0000-000000002201', 'Direct', 'Me', 'online', 10)$$,
  '42501', null, 'nobody writes to the table directly');
select is(pg_temp.post(venue => null), 'invalid_venue', 'an in-person training has a venue');
select is(pg_temp.post(format => 'webinar'), 'invalid_format', 'the format is in person or online');
select is(pg_temp.post(provider => 'X'), 'invalid_provider', 'it names the provider');
select is(pg_temp.post(seats => 0), 'invalid_seats', 'it has at least one seat');
select is(pg_temp.post(starts => now() + interval '1 hour'), 'invalid_start', 'a date is at least 2 hours ahead');
select is(pg_temp.post(details => 'Email trainer@example.test to join.'), 'contact_details', 'emails are blocked');
select is(pg_temp.post(title => 'Self-paced savings course', format => 'online', venue => 'Ignored hall',
                       starts => null, submit => false), 'draft', 'a self-paced online course is saved as a draft');
select is((select row(venue, starts_at)::text from public.trainings where title = 'Self-paced savings course'),
  '(,)', 'an online course keeps no venue and a self-paced one no date');
select is(pg_temp.post(), 'pending_review', 'a member''s training waits for review');

select pg_temp.login('02');
select is((select count(*)::int from public.trainings_feed()), 0, 'other members do not see it yet');

select pg_temp.login('a1');
select is((select count(*)::int from public.training_review_queue()), 1, 'staff see it in the review queue');
select is(public.decide_training(pg_temp.course(), false, 'Please name the trainer'), 'ok', 'staff send it back');

reset role;
select is((select payload ->> 'reason' from public.notifications where kind = 'O6'
           and member_id = '00000000-0000-0000-0000-000000002201'), 'Please name the trainer', 'O6 tells the poster why');
set local role authenticated;

select pg_temp.login('01');
select is((select row(status, review_reason)::text from public.trainings_feed() where training_id = pg_temp.course()),
  '(draft,"Please name the trainer")', 'the poster sees it back in Draft with the reason');
select is(pg_temp.post(training => pg_temp.course(), provider => 'Mwanza Business Centre, trainer Asha'),
  'pending_review', 'the poster fixes it and sends it again');

select pg_temp.login('a1');
select is(public.decide_training(pg_temp.course(), true, null), 'ok', 'staff approve it');
select is(pg_temp.post(title => 'Staff course', format => 'online', starts => null, seats => 100), 'published',
  'staff training publishes at once');

select is(pg_temp.register('02'), 'registered', 'the first member gets a seat');
select is(pg_temp.register('03'), 'registered', 'the second member takes the last seat');
select is(pg_temp.register('04'), 'waitlisted:1', 'the third joins the waitlist');
select is((select row(registered, my_status, my_waitlist_position)::text from public.trainings_feed()
           where training_id = pg_temp.course()), '(2,waitlisted,1)', 'the feed shows seats taken and the waitlist spot');
select is((select string_agg(kind || ':' || status, ',') from public.my_registrations()), 'training:waitlisted',
  'the waitlisted training shows under My activity');

select pg_temp.login('01');
select is((select string_agg(coalesce(full_name, '') || ':' || status, ',' order by status, full_name)
           from public.training_registrants(pg_temp.course())),
  'Baraka Mushi:registered,Neema Joseph:registered,Amani Kweka:waitlisted', 'the poster sees registrants by name');
select ok(pg_get_function_result('public.training_registrants(uuid)'::regprocedure) !~* '(phone|email|address)',
  'the poster''s list has no contact details');
select is((select count(*)::int from public.registrations), 0, 'nor can the poster read the registrations themselves');

select pg_temp.login('02');
select is((select count(*)::int from public.training_registrants(pg_temp.course())), 0,
  'another member cannot read the registrant list');
select is(public.cancel_training_registration(pg_temp.course()), 'ok', 'a member cancels their seat');

select pg_temp.login('04');
select is((select string_agg(kind || ':' || status, ',') from public.my_registrations()), 'training:registered',
  'the first member waiting now has the seat');

reset role;
select ok(exists (select 1 from public.notifications where kind = 'W1'
                  and member_id = '00000000-0000-0000-0000-000000002204'
                  and payload ->> 'training_id' = pg_temp.course()::text), 'and W1 tells them');
update public.trainings set starts_at = now() + interval '20 hours' where id = pg_temp.course();
select is(private.send_event_reminders(), 2, 'T1 goes to registered members a day before scheduled training');
select is(private.send_event_reminders(), 0, 'and only once');
select ok(not has_table_privilege('anon', 'public.trainings', 'select'), 'signed-out visitors see no training');

select * from finish();
rollback;
