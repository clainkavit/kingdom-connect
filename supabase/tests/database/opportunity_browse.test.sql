begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(29);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000033' || k)::uuid, 'ob' || k || '@test.invalid'
from unnest(array['01', '02', '03', '04', 'a1']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000003301', 'ob_poster', 'approved'),
  ('00000000-0000-0000-0000-000000003302', 'ob_hidden', 'approved'),
  ('00000000-0000-0000-0000-000000003303', 'ob_reader', 'approved'),
  ('00000000-0000-0000-0000-000000003304', 'ob_blocker', 'approved');
insert into public.member_private (member_id, phone, email, language)
select ('00000000-0000-0000-0000-0000000033' || k)::uuid, '+2557120033' || k, 'ob' || k || '@test.invalid', 'en'
from unnest(array['01', '02', '03', '04']) k;
insert into public.verification_requests (member_id, level, status, submitted_at, decided_at)
select ('00000000-0000-0000-0000-0000000033' || k)::uuid, 1, 'approved', now(), now()
from unnest(array['01', '02', '03', '04']) k;
insert into public.profiles (member_id, full_name, hidden_from_directory) values
  ('00000000-0000-0000-0000-000000003301', 'Neema Mwita', false),
  ('00000000-0000-0000-0000-000000003302', 'Juma Hidden', true),
  ('00000000-0000-0000-0000-000000003303', 'Reader One', false),
  ('00000000-0000-0000-0000-000000003304', 'Blocker Four', false);
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000033a1', 'Browse Checker', 'admin', true);
insert into public.businesses (id, member_id, name, sector_id, size, level, status)
values ('00000000-0000-0000-0000-00000000b331', '00000000-0000-0000-0000-000000003301', 'Mwita Works',
        (select id from public.sectors order by name_en limit 1), 'small', 3, 'approved');
insert into public.blocks (blocker_id, blocked_id)
  values ('00000000-0000-0000-0000-000000003304', '00000000-0000-0000-0000-000000003303');

select set_config('test.sector', (select id::text from public.sectors order by name_en limit 1), true);
select set_config('test.sector2', (select id::text from public.sectors order by name_en offset 1 limit 1), true);
select set_config('test.region', (select id::text from public.regions where name_en = 'Mwanza'), true);
select set_config('test.region2', (select id::text from public.regions where name_en <> 'Mwanza' order by name_en limit 1), true);
select set_config('test.today', private.tanzania_today()::text, true);

create function pg_temp.add(title text, status text default 'published', kind text default 'job',
                            poster uuid default '00000000-0000-0000-0000-000000003301', remote boolean default false,
                            region text default 'test.region', sector text default 'test.sector',
                            closing int default 20, posted_days_ago int default 1, featured boolean default false)
returns uuid language plpgsql as $$
declare saved uuid;
begin
  insert into public.opportunities (poster_member_id, poster_staff_id, type, title, employment_type, region_id, remote,
                                    sector_id, description, closing_at, status, published_at, featured_at)
  values (poster, case when poster is null then '00000000-0000-0000-0000-0000000033a1'::uuid end, kind, title,
          case when kind = 'job' then 'full_time' end,
          case when remote then null else current_setting(region)::uuid end, remote,
          current_setting(sector)::uuid, repeat('A fair description of the work to do. ', 4),
          current_setting('test.today')::date + closing, status, now() - make_interval(days => posted_days_ago),
          case when featured then now() end)
  returning id into saved;
  return saved;
end $$;

select pg_temp.add('Open job');
select pg_temp.add('Draft job', 'draft');
select pg_temp.add('Pending job', 'pending_review');
select pg_temp.add('Hidden job', 'hidden');
select pg_temp.add('Removed job', 'removed');
select pg_temp.add('Closed job', 'closed');
select pg_temp.add('Expired job', 'expired');
select pg_temp.add('Partnership in Mwanza', kind => 'partnership');
select pg_temp.add('Remote collaboration', kind => 'collaboration', remote => true);
select pg_temp.add('Other region job', region => 'test.region2');
select pg_temp.add('Other sector job', sector => 'test.sector2');
select pg_temp.add('Old job', posted_days_ago => 40);
select pg_temp.add('Featured investment', kind => 'investment', featured => true, posted_days_ago => 30);
select pg_temp.add('Hidden poster job', poster => '00000000-0000-0000-0000-000000003302');
select pg_temp.add('Admin post', poster => null, kind => 'partnership');
select pg_temp.add('Reported job');
select pg_temp.add('Blocked poster job', poster => '00000000-0000-0000-0000-000000003304');
insert into public.reports (reporter_id, target_type, target_id, subject_id, reason)
select '00000000-0000-0000-0000-000000003304', 'opportunity', id, poster_member_id, 'spam'
from public.opportunities where title = 'Reported job';

create temp table ids as select title, id from public.opportunities;
grant select on pg_temp.ids to authenticated;

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000033' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
create function pg_temp.titles(kind text default null, region uuid default null, remote_only boolean default false,
                               sector uuid default null, employment text default null, posted_within int default null)
returns text language sql as $$
  select coalesce(string_agg(title, ', ' order by title), '') from public.opportunity_list(
    kind => kind, region => region, remote_only => remote_only, sector => sector, employment => employment,
    posted_within => posted_within);
$$;
create function pg_temp.detail(title text) returns record language sql as $$
  select d.status, d.read_only from public.opportunity_detail(
    (select i.id from pg_temp.ids i where i.title = detail.title)) d;
$$;

set local role authenticated;
select pg_temp.login('03');
select is(pg_temp.titles(),
  'Admin post, Featured investment, Hidden poster job, Old job, Open job, Other region job, Other sector job, Partnership in Mwanza, Remote collaboration',
  'a member lists only open, published posts, without drafts, pending, hidden, removed, closed, expired, reported or blocked ones');
select is((select title from public.opportunity_list() limit 1), 'Featured investment', 'a featured post comes first');
select is(pg_temp.titles(kind => 'partnership'), 'Admin post, Partnership in Mwanza', 'filter by type');
select is(pg_temp.titles(region => current_setting('test.region2')::uuid), 'Other region job', 'filter by region');
select is(pg_temp.titles(remote_only => true), 'Remote collaboration', 'filter remote only');
select is(pg_temp.titles(sector => current_setting('test.sector2')::uuid), 'Other sector job', 'filter by sector');
select is(pg_temp.titles(employment => 'full_time', posted_within => 7),
  'Hidden poster job, Open job, Other region job, Other sector job', 'filter by employment type and posted within 7 days');
select is(pg_temp.titles(kind => 'job', posted_within => 60) like '%Old job%', true, 'a longer window includes older posts');

select is((select count(*)::int from public.opportunity_list(page => 1)), 0, 'a page past the end is empty');
select is((select poster_name from public.opportunity_list(kind => 'job', region => current_setting('test.region')::uuid)
           where title = 'Open job'), 'Mwita Works', 'the poster is named by their approved business');
select is((select poster_name || ':' || coalesce(poster_id::text, 'none') from public.opportunity_list()
           where title = 'Hidden poster job'), 'ob_hidden:none',
  'a poster whose profile is hidden shows only a username, with no profile link');
select is((select poster_name || ':' || coalesce(poster_id::text, 'none') from public.opportunity_list()
           where title = 'Admin post'), 'Kingdom Connect:none', 'an admin post names the platform');
select is((select skills from public.opportunity_list() where title = 'Open job'), '{}'::text[], 'skills come as a list');

select is((select status from pg_temp.detail('Open job') as (status text, read_only boolean)), 'published', 'a member opens a post');
select is((select read_only from pg_temp.detail('Open job') as (status text, read_only boolean)), false, 'which is not read-only');
select is((select read_only from pg_temp.detail('Closed job') as (status text, read_only boolean)), true, 'a closed post opens read-only');
select is((select read_only from pg_temp.detail('Expired job') as (status text, read_only boolean)), true, 'and so does an expired one');
select is((select count(*)::int from public.opportunity_detail((select id from pg_temp.ids where title = 'Hidden job'))), 0,
  'a hidden post does not open');
select is((select count(*)::int from public.opportunity_detail((select id from pg_temp.ids where title = 'Reported job'))), 0,
  'nor one with an open report');
select is((select count(*)::int from public.opportunity_detail((select id from pg_temp.ids where title = 'Pending job'))), 0,
  'nor one still waiting for review');
select is((select count(*)::int from public.opportunity_detail((select id from pg_temp.ids where title = 'Blocked poster job'))), 0,
  'nor one by a member who blocked the reader');

select pg_temp.login('01');
select is((select count(*)::int from public.opportunity_detail((select id from pg_temp.ids where title = 'Pending job'))), 1,
  'a poster opens their own post in any state');
select is((select is_mine from public.opportunity_list() where title = 'Open job'), true, 'and sees which posts are theirs');

select pg_temp.login('04');
select is((select count(*)::int from public.opportunity_list() where title = 'Blocked poster job'), 1, 'the blocker still sees their own post');
select is((select count(*)::int from public.opportunity_list() where title = 'Open job'), 1, 'and others');

select pg_temp.login('a1');
select is((select count(*)::int from public.opportunity_list()), 0, 'staff are not members and get no list');
select throws_ok($$select * from private.opportunity_cards$$, '42501', null, 'the card view is not readable directly');

set local role anon;
select throws_ok($$select * from public.opportunity_list()$$, '42501', null, 'a signed-out visitor cannot list');
select throws_ok($$select * from public.opportunity_detail('00000000-0000-0000-0000-000000000001')$$, '42501', null,
  'nor open a post');

select * from finish();
rollback;
