begin;
create extension if not exists pgtap with schema extensions;
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(21);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000051' || k)::uuid, 'wr' || k || '@test.invalid'
from unnest(array['01', '02', '03', '04', 'a1']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000005101', 'wr_poster', 'approved'),
  ('00000000-0000-0000-0000-000000005102', 'wr_worker', 'approved'),
  ('00000000-0000-0000-0000-000000005103', 'wr_other', 'approved'),
  ('00000000-0000-0000-0000-000000005104', 'wr_reader', 'approved');
insert into public.profiles (member_id, full_name) values
  ('00000000-0000-0000-0000-000000005101', 'Rate Poster'), ('00000000-0000-0000-0000-000000005102', 'Rate Worker'),
  ('00000000-0000-0000-0000-000000005103', 'Rate Other'), ('00000000-0000-0000-0000-000000005104', 'Rate Reader');
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000051a1', 'Rate Staff', 'admin', true);
insert into public.opportunities (id, poster_member_id, type, title, role, employment_type, remote, sector_id,
                                  description, closing_at, status, published_at)
values ('00000000-0000-0000-0051-00000000000a', '00000000-0000-0000-0000-000000005101', 'job', 'WR tailor',
        'Tailor', 'full_time', true, (select id from public.sectors limit 1),
        repeat('Sew school uniforms for the new term. ', 4), private.tanzania_today() + 20, 'published', now());
insert into public.responses (id, opportunity_id, member_id, kind, status) values
  ('00000000-0000-0000-0051-0000000000b1', '00000000-0000-0000-0051-00000000000a',
   '00000000-0000-0000-0000-000000005102', 'application', 'shortlisted'),
  ('00000000-0000-0000-0051-0000000000b2', '00000000-0000-0000-0051-00000000000a',
   '00000000-0000-0000-0000-000000005103', 'application', 'new');

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000051' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
create function pg_temp.engagement() returns uuid language sql as $$
  select id from public.engagements where response_id = '00000000-0000-0000-0051-0000000000b1';
$$;

set local role authenticated;

select pg_temp.login('02');
select is(public.mark_hired('00000000-0000-0000-0051-0000000000b1'), 'not_found', 'only the poster marks someone hired');
select pg_temp.login('01');
select is(public.mark_hired('00000000-0000-0000-0051-0000000000b2'), 'not_allowed',
  'only a shortlisted response can be hired');
select is(public.mark_hired('00000000-0000-0000-0051-0000000000b1'), 'ok', 'the poster marks the shortlisted worker hired');
select is((select status from public.responses where id = '00000000-0000-0000-0051-0000000000b1'), 'hired',
  'the response reads Hired');
select is(public.rate_work(pg_temp.engagement(), 5, 5, 5, 5, true, '', ''), 'not_confirmed',
  'nobody rates before the worker confirms');

select pg_temp.login('02');
select is(public.confirm_work(pg_temp.engagement(), true), 'ok', 'the worker confirms the work happened');
select is(public.rate_work(pg_temp.engagement(), 4, 5, 4, 5, true, 'Paid on time, clear brief.', ''), 'ok',
  'the worker rates the poster');
select is(public.rate_work(pg_temp.engagement(), 1, 1, 1, 1, false, '', ''), 'already_rated', 'once');
select is((select count(*)::int from public.work_references('00000000-0000-0000-0000-000000005101')), 0,
  'one rating is hidden until the other side rates');

select pg_temp.login('01');
select is(public.rate_work(pg_temp.engagement(), 5, 4, 5, 5, true, 'Call me on 0712 345 678', ''), 'contact_details',
  'a comment with a phone number is refused');
select is(public.rate_work(pg_temp.engagement(), 5, 4, 5, 5, true, 'Every uniform was ready early.',
  'Very reliable, would pick again.'), 'ok', 'the poster rates the worker, with a private note to staff');
select ok((select bool_and(revealed_at is not null) from public.ratings where engagement_id = pg_temp.engagement()),
  'both ratings are revealed once both sides have rated');

select pg_temp.login('03');
select is((select count(*)::int from public.engagements) + (select count(*)::int from public.rating_notes), 0,
  'another member sees no engagement and no private note');
select is((select count(*)::int from public.work_references('00000000-0000-0000-0000-000000005102')), 0,
  'and no references below 3 revealed ratings');

select pg_temp.login('02');
select is((select count(*)::int from public.rating_notes), 0, 'the rated worker never reads the private note');
select is(public.reply_to_rating((select id from public.ratings where rater_id = '00000000-0000-0000-0000-000000005101'),
  'Thank you, it was good working with you.'), 'ok', 'the rated worker replies once');
select is(public.reply_to_rating((select id from public.ratings where rater_id = '00000000-0000-0000-0000-000000005101'),
  'Again'), 'already_replied', 'only once');

select pg_temp.login('a1');
select is((select count(*)::int from public.rating_notes), 1, 'staff read the private note');

reset role;
insert into public.engagements (opportunity_id, poster_member_id, worker_member_id, marked_at, confirmed_at,
                                rating_closes_at)
select '00000000-0000-0000-0051-00000000000a', ('00000000-0000-0000-0000-0000000051' || k)::uuid,
       '00000000-0000-0000-0000-000000005102', now(), now() - interval '20 days', now() - interval '6 days'
from unnest(array['03', '04']) k;
insert into public.ratings (engagement_id, rater_id, ratee_id, on_time, quality, communication, honesty, again, comment)
select e.id, e.poster_member_id, e.worker_member_id, 5, 5, 4, 5, true, 'Good work.'
from public.engagements e where e.poster_member_id in ('00000000-0000-0000-0000-000000005103',
                                                        '00000000-0000-0000-0000-000000005104');
select is(private.reveal_due_ratings(now()), 2, 'the daily job reveals ratings whose 14 days have passed');

set local role authenticated;
select pg_temp.login('04');
select is((select again_count || ' of ' || total from public.work_references('00000000-0000-0000-0000-000000005102')
           limit 1), '3 of 3', 'from 3 revealed ratings the references show: 3 of 3 would work with them again');
select is((select count(*)::int from public.work_references('00000000-0000-0000-0000-000000005102')), 3,
  'with one row per rating');

select * from finish();
rollback;
