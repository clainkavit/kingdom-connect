begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(23);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000040' || k)::uuid, 'rf' || k || '@test.invalid'
from unnest(array['01', '02', '03', '04', '05', 'a1']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000004001', 'rf_poster', 'approved'),
  ('00000000-0000-0000-0000-000000004002', 'rf_reporter', 'approved'),
  ('00000000-0000-0000-0000-000000004003', 'rf_second', 'approved'),
  ('00000000-0000-0000-0000-000000004004', 'rf_responder', 'approved'),
  ('00000000-0000-0000-0000-000000004005', 'rf_noprofile', 'approved');
insert into public.member_private (member_id, phone, email, language)
select ('00000000-0000-0000-0000-0000000040' || k)::uuid, '+2557120040' || k, 'rf' || k || '@test.invalid', 'en'
from unnest(array['01', '02', '03', '04', '05']) k;
insert into public.verification_requests (member_id, level, status, submitted_at, decided_at)
select ('00000000-0000-0000-0000-0000000040' || k)::uuid, l, 'approved', now(), now()
from (values ('01', 1), ('01', 2), ('01', 3), ('02', 1), ('03', 1), ('04', 1), ('05', 1)) as x (k, l);
insert into public.profiles (member_id, full_name, hidden_from_directory) values
  ('00000000-0000-0000-0000-000000004001', 'Hidden Poster', true),
  ('00000000-0000-0000-0000-000000004002', 'Reporter', false),
  ('00000000-0000-0000-0000-000000004003', 'Second', false),
  ('00000000-0000-0000-0000-000000004004', 'Hidden Responder', true);
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000040a1', 'Fix Checker', 'admin', true);
select set_config('test.sector', (select id::text from public.sectors order by name_en limit 1), true);
select set_config('test.region', (select id::text from public.regions where name_en = 'Mwanza'), true);
select set_config('test.today', private.tanzania_today()::text, true);

create function pg_temp.add(title text, kind text default 'job', status text default 'published', closing int default 20,
                            approved boolean default false) returns uuid language plpgsql as $$
declare saved uuid;
begin
  insert into public.opportunities (poster_member_id, type, title, employment_type, region_id, remote, sector_id,
                                    description, closing_at, status, published_at, approved_at)
  values ('00000000-0000-0000-0000-000000004001', kind, title, case when kind = 'job' then 'full_time' end,
          current_setting('test.region')::uuid, false, current_setting('test.sector')::uuid,
          repeat('A fair description of the work to do. ', 4), current_setting('test.today')::date + closing, status,
          now(), case when approved then now() end)
  returning id into saved;
  return saved;
end $$;
select pg_temp.add('Open post');
select pg_temp.add('Late tender', 'tender', closing => 0);
select pg_temp.add('Open tender', 'tender', closing => 0);
select pg_temp.add('Stale featured', closing => -1);
select pg_temp.add('Approved ' || n, approved => true) from generate_series(1, 3) n;
insert into public.tender_details (opportunity_id, issuing_org, reference_no, scope, closing_time)
select o.id, 'Org', 'REF-' || o.title, repeat('Scope of the tender work. ', 3),
       case when o.title = 'Late tender' then time '00:00:01' else time '23:59:59' end
from public.opportunities o where o.type = 'tender';
update public.opportunities set featured_at = now() where title = 'Stale featured';
create temp table ids as select title, id from public.opportunities;
grant select on pg_temp.ids to authenticated;

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000040' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
create function pg_temp.opp(title text) returns uuid language sql as $$ select i.id from pg_temp.ids i where i.title = opp.title; $$;
create function pg_temp.status(title text) returns text language sql security definer as $$
  select status from public.opportunities where opportunities.title = status.title;
$$;
create function pg_temp.open_reports(title text) returns int language sql security definer as $$
  select count(*)::int from public.reports where target_id = pg_temp.opp(title) and status in ('open', 'under_review');
$$;
create function pg_temp.post(title text) returns text language sql as $$
  select result from public.save_opportunity(null, 'job', title, null, 'full_time', current_setting('test.region')::uuid,
    null, false, current_setting('test.sector')::uuid, repeat('Supervise a road crew in Mwanza and report each week. ', 3),
    current_setting('test.today')::date + 30, array['supervision'], true, true);
$$;

set local role authenticated;
select pg_temp.login('04');
select is((select count(*)::int from public.opportunity_list() where title = 'Late tender'), 0,
  'a tender is closed once its closing time has passed on the closing date');
select is((select count(*)::int from public.opportunity_list() where title = 'Open tender'), 1,
  'and open until that time');
select is((select read_only from public.opportunity_detail(pg_temp.opp('Late tender'))), true, 'a closed tender opens read-only');
select is((select result from public.respond_to_opportunity(pg_temp.opp('Late tender'))), 'not_open', 'and takes no response');
select is((select result from public.respond_to_opportunity(pg_temp.opp('Open post'), 'I can help.')), 'ok', 'a member responds to a post');
select is((select count(*)::int from public.my_responses()), 1, 'and sees the response');
select pg_temp.login('01');
select is((select count(*)::int from public.profiles where member_id = '00000000-0000-0000-0000-000000004004'), 1,
  'the poster reads the hidden profile of someone who responded');
select pg_temp.login('04');
select is((select count(*)::int from public.profiles where member_id = '00000000-0000-0000-0000-000000004001'), 0,
  'but the responder does not read the hidden profile of the poster');

select pg_temp.login('02');
select ok((select reference_no from public.report('opportunity', pg_temp.opp('Open post'), 'spam')) like 'KC-%', 'a member reports the post');
select pg_temp.login('03');
select ok((select reference_no from public.report('opportunity', pg_temp.opp('Open post'), 'asked_for_money')) like 'KC-%',
  'a second member can still report it while it is hidden');
select is(pg_temp.open_reports('Open post'), 2, 'so reports on one post add up');
select pg_temp.login('04');
select is((select count(*)::int from public.my_responses()), 0, 'a hidden post leaves my responses');

select pg_temp.login('a1');
select is(public.moderate_opportunity(pg_temp.opp('Open post'), 'restore'), 'ok', 'staff restore the post');
select is(pg_temp.open_reports('Open post'), 0, 'which closes its open reports');
select pg_temp.login('04');
select is((select count(*)::int from public.my_responses()), 1, 'and the response is back');

select pg_temp.login('a1');
select is((select count(*)::int from public.featured_slots() where used = 0)
          + (select count(*)::int from public.admin_featured()), 1,
  'a featured post past its closing date is neither in the list nor in the slot count');

select pg_temp.login('05');
select is(public.scan_missing_fields(), array['skills', 'location', 'profession'], 'a member with no profile is told every field is missing');

reset role;
insert into public.reports (reporter_id, target_type, target_id, subject_id, reason, status, decided_by, decided_at)
values ('00000000-0000-0000-0000-000000004002', 'opportunity', pg_temp.opp('Approved 1'),
        '00000000-0000-0000-0000-000000004001', 'spam', 'action_taken', '00000000-0000-0000-0000-0000000040a1',
        now() - interval '13 months');
set local role authenticated;
select pg_temp.login('01');
select is(pg_temp.post('Post after an old upheld report'), 'ok', 'an upheld report older than 12 months does not count');
select is(pg_temp.status('Post after an old upheld report'), 'published', 'so the post still publishes at once');

reset role;
insert into public.reports (reporter_id, target_type, target_id, subject_id, reason, status, decided_by, decided_at)
values ('00000000-0000-0000-0000-000000004003', 'opportunity', pg_temp.opp('Approved 2'),
        '00000000-0000-0000-0000-000000004001', 'spam', 'action_taken', '00000000-0000-0000-0000-0000000040a1', now());
set local role authenticated;
select pg_temp.login('01');
select is(pg_temp.post('Post after a recent upheld report'), 'ok', 'a recent upheld report puts the poster back on review');
select is(pg_temp.status('Post after a recent upheld report'), 'pending_review', 'so the post waits');
reset role;
insert into public.moderation_actions (staff_id, subject_id, action, note)
values ('00000000-0000-0000-0000-0000000040a1', '00000000-0000-0000-0000-000000004001', 'lift_posting_pause', 'Cleared');
set local role authenticated;
select pg_temp.login('01');
select is(pg_temp.post('Post after the pause is lifted'), 'ok', 'lifting a pause resets the count');
select is(pg_temp.status('Post after the pause is lifted'), 'published', 'so the next post publishes at once');

select * from finish();
rollback;
