begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(18);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000043' || k)::uuid, 'dw' || k || '@test.invalid'
from unnest(array['01', '02', '03', 'a1']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000004301', 'dw_reader', 'approved'),
  ('00000000-0000-0000-0000-000000004302', 'dw_poster', 'approved'),
  ('00000000-0000-0000-0000-000000004303', 'dw_blocker', 'approved');
insert into public.member_private (member_id, phone, email, language)
select ('00000000-0000-0000-0000-0000000043' || k)::uuid, '+2557120043' || k, 'dw' || k || '@test.invalid', 'en'
from unnest(array['01', '02', '03']) k;
insert into public.verification_requests (member_id, level, status, submitted_at, decided_at)
select ('00000000-0000-0000-0000-0000000043' || k)::uuid, 1, 'approved', now(), now() from unnest(array['01', '02', '03']) k;
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000043a1', 'Widget Checker', 'admin', true);
insert into public.blocks (blocker_id, blocked_id)
  values ('00000000-0000-0000-0000-000000004303', '00000000-0000-0000-0000-000000004301');
select set_config('test.sector', (select id::text from public.sectors order by name_en limit 1), true);
select set_config('test.region', (select id::text from public.regions where name_en = 'Mwanza'), true);
select set_config('test.today', private.tanzania_today()::text, true);

create function pg_temp.add(title text, kind text default 'job', status text default 'published', closing int default 20,
                            age_hours int default 1, featured boolean default false,
                            poster uuid default '00000000-0000-0000-0000-000000004302') returns uuid language plpgsql as $$
declare saved uuid;
begin
  insert into public.opportunities (poster_member_id, type, title, employment_type, region_id, remote, sector_id,
                                    description, closing_at, status, published_at, featured_at)
  values (poster, kind, title, case when kind = 'job' then 'full_time' end, current_setting('test.region')::uuid, false,
          current_setting('test.sector')::uuid, repeat('A fair description of the work to do. ', 4),
          current_setting('test.today')::date + closing, status, now() - make_interval(hours => age_hours),
          case when featured then now() end)
  returning id into saved;
  return saved;
end $$;
select pg_temp.add('Job one', age_hours => 5);
select pg_temp.add('Job two', age_hours => 4);
select pg_temp.add('Tender one', 'tender', age_hours => 3);
select pg_temp.add('Investment one', 'investment', age_hours => 2);
select pg_temp.add('Partnership one', 'partnership', age_hours => 6);
select pg_temp.add('Draft job', status => 'draft');
select pg_temp.add('Closed job', status => 'closed');
select pg_temp.add('Blocked poster job', poster => '00000000-0000-0000-0000-000000004303');
select pg_temp.add('Featured job', age_hours => 8, featured => true);
select pg_temp.add('Featured but closed', status => 'closed', featured => true);
insert into public.trainings (poster_member_id, title, provider, format, venue, seats, status, published_at, starts_at)
values ('00000000-0000-0000-0000-000000004302', 'Welding basics', 'Trade school', 'in_person', 'Trade school hall', 20, 'published', now() - interval '90 minutes', now() + interval '3 days'),
       ('00000000-0000-0000-0000-000000004302', 'Draft training', 'Trade school', 'online', null, 20, 'draft', null, null);
insert into public.ideas (owner_id, title, problem, sector_id, stage, seeking, status, published_at)
values ('00000000-0000-0000-0000-000000004302', 'Solar dryers', 'Farmers lose much of their harvest before market.',
        current_setting('test.sector')::uuid, 'prototype', 'both', 'published', now() - interval '30 minutes'),
       ('00000000-0000-0000-0000-000000004302', 'Hidden idea', 'Something that is not published at all yet here.',
        current_setting('test.sector')::uuid, 'idea', 'both', 'hidden', now());

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000043' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
create function pg_temp.titles(tab text) returns text language sql as $$
  select coalesce(string_agg(title, ', '), '') from public.dashboard_latest(tab, 20);
$$;

set local role authenticated;
select pg_temp.login('01');
select is(pg_temp.titles('all'),
  'Solar dryers, Welding basics, Investment one, Tender one, Job two, Job one, Partnership one, Featured job',
  'All lists the newest open items of every kind, without drafts, closed, hidden or blocked ones');
select is(pg_temp.titles('jobs'), 'Job two, Job one, Featured job', 'Jobs lists the jobs');
select is(pg_temp.titles('tenders'), 'Tender one', 'Tenders lists the tenders');
select is(pg_temp.titles('investments'), 'Investment one', 'Investments lists the investments');
select is(pg_temp.titles('training'), 'Welding basics', 'Training lists published trainings only');
select is(pg_temp.titles('ideas'), 'Solar dryers', 'Ideas lists published ideas only');
select is(pg_temp.titles('nonsense'), '', 'an unknown tab is empty');
select is((select count(*)::int from public.dashboard_latest('all', 3)), 3, 'a row limit applies');
select is((select item_kind from public.dashboard_latest('all', 1)), 'idea', 'the newest item comes first');

select is((select string_agg(title, ', ') from public.featured_for_members()), 'Featured job',
  'featured shows open featured posts only');
select is((select array_agg(p.parameter_name::text order by p.ordinal_position)
           from information_schema.routines r join information_schema.parameters p on p.specific_name = r.specific_name
           where r.routine_schema = 'public' and r.routine_name = 'dashboard_latest' and p.parameter_mode = 'OUT'),
  array['item_kind', 'item_id', 'title', 'subtype', 'sector_en', 'sector_sw', 'published_at'],
  'the latest list carries no count or admin figure');

select pg_temp.login('03');
select is(pg_temp.titles('jobs'), 'Blocked poster job, Job two, Job one, Featured job',
  'the blocker still sees their own post');
select pg_temp.login('a1');
select is(pg_temp.titles('all'), '', 'staff are not members and get no lists');
select is((select count(*)::int from public.featured_for_members()), 0, 'nor featured');

reset role;
insert into public.reports (reporter_id, target_type, target_id, subject_id, reason)
select '00000000-0000-0000-0000-000000004303', 'opportunity', id, poster_member_id, 'spam'
from public.opportunities where title = 'Job one';
set local role authenticated;
select pg_temp.login('01');
select is(pg_temp.titles('jobs'), 'Job two, Featured job', 'a reported post leaves the list at once');

reset role;
update public.opportunities set closing_at = private.tanzania_today() - 1 where title = 'Job two';
set local role authenticated;
select pg_temp.login('01');
select is(pg_temp.titles('jobs'), 'Featured job', 'and a post past its closing date');

set local role anon;
select throws_ok($$select * from public.dashboard_latest()$$, '42501', null, 'a signed-out visitor cannot ask');
select throws_ok($$select * from public.featured_for_members()$$, '42501', null, 'nor for the featured list');

select * from finish();
rollback;
