begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(13);

select set_config('test.sector', (select id::text from public.sectors order by name_en limit 1), true);
select set_config('test.region', (select id::text from public.regions where name_en = 'Mwanza'), true);
select set_config('test.today', private.tanzania_today()::text, true);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000042' || k)::uuid, 'sd' || k || '@test.invalid'
from unnest(array['01', '02', '03', '04', '05']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000004201', 'sd_match', 'approved'),
  ('00000000-0000-0000-0000-000000004202', 'sd_email_off', 'approved'),
  ('00000000-0000-0000-0000-000000004203', 'sd_no_match', 'approved'),
  ('00000000-0000-0000-0000-000000004204', 'sd_poster', 'approved'),
  ('00000000-0000-0000-0000-000000004205', 'sd_suspended', 'suspended');
insert into public.member_private (member_id, phone, email, language)
select ('00000000-0000-0000-0000-0000000042' || k)::uuid, '+2557120042' || k, 'sd' || k || '@test.invalid', 'en'
from unnest(array['01', '02', '03', '04', '05']) k;
insert into public.verification_requests (member_id, level, status, submitted_at, decided_at)
select ('00000000-0000-0000-0000-0000000042' || k)::uuid, 1, 'approved', now(), now()
from unnest(array['01', '02', '03', '04', '05']) k;
insert into public.skills (name) values ('accounting'), ('auditing'), ('welding') on conflict (name) do nothing;
insert into public.profiles (member_id, full_name, region_id, profession)
select ('00000000-0000-0000-0000-0000000042' || k)::uuid, 'Member ' || k, current_setting('test.region')::uuid, 'clerk'
from unnest(array['01', '02', '03', '04', '05']) k;
insert into public.profile_skills (member_id, skill_id)
select ('00000000-0000-0000-0000-0000000042' || k)::uuid, s.id
from unnest(array['01', '02', '05']) k, public.skills s where s.name in ('accounting', 'auditing');
insert into public.profile_skills (member_id, skill_id)
select '00000000-0000-0000-0000-000000004203', s.id from public.skills s where s.name = 'welding';
insert into public.notification_preferences (member_id, category, email)
values ('00000000-0000-0000-0000-000000004202', 'matches', false);

create function pg_temp.add(title text, published_days_ago numeric, skills text[] default array['accounting', 'auditing'])
returns uuid language plpgsql as $$
declare saved uuid;
begin
  insert into public.opportunities (poster_member_id, type, title, employment_type, region_id, remote, sector_id,
                                    description, closing_at, status, published_at)
  values ('00000000-0000-0000-0000-000000004204', 'job', title, 'full_time', current_setting('test.region')::uuid, false,
          current_setting('test.sector')::uuid, repeat('A fair description of the work to do. ', 4),
          current_setting('test.today')::date + 20, 'published', now() - make_interval(secs => published_days_ago * 86400))
  returning id into saved;
  insert into public.opportunity_skills (opportunity_id, skill_id) select saved, s.id from public.skills s where s.name = any (skills);
  return saved;
end $$;
insert into public.platform_settings (key, value) values ('scan_digest_last_run', to_jsonb((now() - interval '1 day')::text));
select pg_temp.add('Old match', 3);
select pg_temp.add('New match', 0.1);

create function pg_temp.digest_rows(who text) returns int language sql as $$
  select count(*)::int from private.email_outbox
  where member_id = ('00000000-0000-0000-0000-0000000042' || who)::uuid and kind = 'S1' and payload ->> 'digest' = 'true';
$$;
create function pg_temp.bell(who text) returns text language sql as $$
  select coalesce(string_agg(payload ->> 'count', ','), '') from public.notifications
  where member_id = ('00000000-0000-0000-0000-0000000042' || who)::uuid and kind = 'S1';
$$;

select cmp_ok(private.queue_scan_digests(), '>=', 2, 'members with a new match are queued');
select is(pg_temp.bell('01'), '1', 'the member with a match gets the in-app notice with the count of new matches');
select is(pg_temp.digest_rows('01'), 1, 'and one weekly digest email');
select is(pg_temp.bell('02') || '/' || pg_temp.digest_rows('02'), '1/0',
  'a member who switched matches email off gets the notice but no email');
select is(pg_temp.bell('03') || '/' || pg_temp.digest_rows('03'), '/0', 'a member with no match gets nothing');
select is(pg_temp.bell('05') || '/' || pg_temp.digest_rows('05'), '/0', 'nor does a suspended member');
select is(pg_temp.bell('04') || '/' || pg_temp.digest_rows('04'), '/0', 'nor does the poster of the matches');
select is(private.queue_scan_digests(), 0, 'a second run finds nothing new');
select is(pg_temp.digest_rows('01'), 1, 'so no duplicate email');
select is(current_setting('request.jwt.claims', true), '', 'the job leaves no member identity behind');

select pg_temp.add('Extra match ' || n, -0.05) from generate_series(1, 7) n;
select cmp_ok(private.queue_scan_digests(now() + interval '2 hours'), '>=', 2, 'a week with more new matches sends again');
select is((select payload ->> 'count' from private.email_outbox
           where member_id = '00000000-0000-0000-0000-000000004201' and kind = 'S1' and payload ->> 'digest' = 'true'
           order by created_at desc limit 1), '5', 'with at most 5 matches');
select is((select value #>> '{}' from public.platform_settings where key = 'scan_digest_last_run') is not null, true,
  'and the run time is kept');

select * from finish();
rollback;
