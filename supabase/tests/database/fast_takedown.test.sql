begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(22);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000037' || k)::uuid, 'ftk' || k || '@test.invalid'
from unnest(array['01', '02', '03', 'a1']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000003701', 'fk_poster', 'approved'),
  ('00000000-0000-0000-0000-000000003702', 'fk_reporter', 'approved'),
  ('00000000-0000-0000-0000-000000003703', 'fk_reader', 'approved');
insert into public.member_private (member_id, phone, email, language)
select ('00000000-0000-0000-0000-0000000037' || k)::uuid, '+2557120037' || k, 'ftk' || k || '@test.invalid', 'en'
from unnest(array['01', '02', '03']) k;
insert into public.verification_requests (member_id, level, status, submitted_at, decided_at)
select ('00000000-0000-0000-0000-0000000037' || k)::uuid, l, 'approved', now(), now()
from (values ('01', 1), ('01', 2), ('01', 3), ('02', 1), ('03', 1)) as x (k, l);
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000037a1', 'Takedown Checker', 'admin', true);
select set_config('test.sector', (select id::text from public.sectors order by name_en limit 1), true);
select set_config('test.region', (select id::text from public.regions where name_en = 'Mwanza'), true);
select set_config('test.today', private.tanzania_today()::text, true);

create function pg_temp.add(title text, status text default 'published', approved boolean default false,
                            poster uuid default '00000000-0000-0000-0000-000000003701')
returns uuid language plpgsql as $$
declare saved uuid;
begin
  insert into public.opportunities (poster_member_id, poster_staff_id, type, title, employment_type, region_id, remote,
                                    sector_id, description, closing_at, status, published_at, approved_at)
  values (poster, case when poster is null then '00000000-0000-0000-0000-0000000037a1'::uuid end, 'job', title,
          'full_time', current_setting('test.region')::uuid, false, current_setting('test.sector')::uuid,
          repeat('A fair description of the work to do. ', 4), current_setting('test.today')::date + 20, status, now(),
          case when approved then now() end)
  returning id into saved;
  return saved;
end $$;
select pg_temp.add('Approved ' || n, approved => true) from generate_series(1, 3) n;
select pg_temp.add('Reported one');
select pg_temp.add('Reported two');
select pg_temp.add('Draft one', 'draft');
select pg_temp.add('Admin one', poster => null);
select pg_temp.add('Restore me');
create temp table ids as select title, id from public.opportunities;
grant select on pg_temp.ids to authenticated;

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000037' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
create function pg_temp.opp(title text) returns uuid language sql as $$ select i.id from pg_temp.ids i where i.title = opp.title; $$;
create function pg_temp.status(title text) returns text language sql security definer as $$
  select status from public.opportunities where opportunities.title = status.title;
$$;
create function pg_temp.listed(title text) returns int language sql as $$
  select count(*)::int from public.opportunity_list() l where l.title = listed.title;
$$;
create function pg_temp.case_of(title text) returns uuid language sql as $$
  select id from public.reports where target_id = pg_temp.opp(title) order by created_at desc limit 1;
$$;
grant execute on function pg_temp.case_of(text) to authenticated;
create function pg_temp.report(title text, reason text default 'fake_job_or_business') returns text language sql as $$
  select reference_no from public.report('opportunity', pg_temp.opp(title), reason);
$$;
create function pg_temp.post(title text) returns text language sql as $$
  select result from public.save_opportunity(null, 'job', title, null, 'full_time', current_setting('test.region')::uuid,
    null, false, current_setting('test.sector')::uuid, repeat('Supervise a road crew in Mwanza and report each week. ', 3),
    current_setting('test.today')::date + 30, array['supervision'], true, true);
$$;

set local role authenticated;
select pg_temp.login('03');
select is(pg_temp.listed('Reported one'), 1, 'a published post is listed');
select pg_temp.login('02');
select ok(pg_temp.report('Reported one') like 'KC-%', 'a member reports it and gets a reference number');
select is(pg_temp.status('Reported one'), 'hidden', 'the post is hidden at once');
select is((select already_reported from public.report('opportunity', pg_temp.opp('Reported one'), 'spam')), true,
  'reporting it again returns the same case');
select throws_ok($$select pg_temp.report('Draft one')$$, 'P0001', 'not_available', 'a draft cannot be reported');
select throws_ok($$select pg_temp.report('Admin one')$$, 'P0001', 'not_available', 'nor an admin post');

select pg_temp.login('03');
select is(pg_temp.listed('Reported one'), 0, 'other members no longer see it in the list');
select is((select count(*)::int from public.opportunity_detail(pg_temp.opp('Reported one'))), 0, 'nor open it');

select pg_temp.login('01');
select throws_ok($$select pg_temp.report('Reported two')$$, 'P0001', 'not_available', 'a poster cannot report their own post');
select is((select status from public.my_opportunities() where title = 'Reported one'), 'hidden', 'the poster sees it as hidden');

select pg_temp.login('a1');
select lives_ok($$select public.decide_report(pg_temp.case_of('Reported one'), 'no_action', 'The post is fine')$$,
  'staff decide no action');
select is(pg_temp.status('Reported one'), 'published', 'which restores the post');
select pg_temp.login('03');
select is(pg_temp.listed('Reported one'), 1, 'and members see it again');

select pg_temp.login('02');
select ok(pg_temp.report('Reported two', 'asked_for_money') like 'KC-%', 'another post is reported');
select pg_temp.login('01');
select is(pg_temp.post('Fourth post before any upheld report'), 'ok', 'a poster with 3 approvals posts');
select is(pg_temp.status('Fourth post before any upheld report'), 'published', 'and it publishes at once');
select pg_temp.login('a1');
select lives_ok($$select public.decide_report(pg_temp.case_of('Reported two'), 'warn', 'It asked for money',
                  'Posts that ask for money are not allowed')$$, 'staff uphold the report with a warning');
select is(pg_temp.status('Reported two'), 'removed', 'which removes the post');
select pg_temp.login('01');
select is(pg_temp.post('Post after an upheld report'), 'ok', 'the poster posts again');
select is(pg_temp.status('Post after an upheld report'), 'pending_review', 'and it goes to review, whatever the approvals');

select pg_temp.login('a1');
reset role;
update public.opportunities set status = 'hidden' where title = 'Restore me';
set local role authenticated;
select pg_temp.login('a1');
select is(public.moderate_opportunity(pg_temp.opp('Restore me'), 'restore'), 'ok', 'staff restore a hidden post');
select is(public.moderate_opportunity(pg_temp.opp('Restore me'), 'restore'), 'already_decided', 'only a hidden one');

select * from finish();
rollback;
