begin;
create extension if not exists pgtap with schema extensions;
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(14);

select set_config('test.sector', (select id::text from public.sectors order by name_en limit 1), true);
select set_config('test.region', (select id::text from public.regions where name_en = 'Mwanza'), true);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000043' || k)::uuid, 'ja' || k || '@test.invalid'
from unnest(array['01', '02', '03', '04']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000004301', 'ja_alerted', 'approved'),
  ('00000000-0000-0000-0000-000000004302', 'ja_email_off', 'approved'),
  ('00000000-0000-0000-0000-000000004303', 'ja_poster', 'approved'),
  ('00000000-0000-0000-0000-000000004304', 'ja_suspended', 'approved');
insert into public.member_private (member_id, phone, email, language)
select ('00000000-0000-0000-0000-0000000043' || k)::uuid, '+2557120043' || k, 'ja' || k || '@test.invalid', 'en'
from unnest(array['01', '02', '03', '04']) k;
insert into public.verification_requests (member_id, level, status, submitted_at, decided_at)
select ('00000000-0000-0000-0000-0000000043' || k)::uuid, 1, 'approved', now(), now()
from unnest(array['01', '02', '03', '04']) k;
insert into public.profiles (member_id, full_name)
select ('00000000-0000-0000-0000-0000000043' || k)::uuid, 'Alert Member ' || k from unnest(array['01', '02', '03', '04']) k;
insert into public.notification_preferences (member_id, category, email)
values ('00000000-0000-0000-0000-000000004302', 'matches', false);

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000043' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
create function pg_temp.post(title text, kind text, remote boolean, hours_ago int, poster text default '03')
returns void language sql as $$
  insert into public.opportunities (poster_member_id, type, title, employment_type, region_id, remote, sector_id,
                                    description, closing_at, status, published_at)
  values (('00000000-0000-0000-0000-0000000043' || poster)::uuid, kind, title,
          case when kind = 'job' then 'full_time' end,
          case when remote then null else current_setting('test.region')::uuid end, remote,
          current_setting('test.sector')::uuid, repeat('A fair description of the work to do. ', 4),
          private.tanzania_today() + 20, 'published', now() - make_interval(hours => hours_ago));
$$;
create function pg_temp.notices(who text) returns text language sql as $$
  select coalesce(string_agg(payload ->> 'count', ','), '') from public.notifications
  where member_id = ('00000000-0000-0000-0000-0000000043' || who)::uuid and kind = 'S2';
$$;
create function pg_temp.emails(who text) returns int language sql as $$
  select count(*)::int from private.email_outbox
  where member_id = ('00000000-0000-0000-0000-0000000043' || who)::uuid and kind = 'S2';
$$;

set local role authenticated;
select pg_temp.login('01');
select lives_ok($$insert into public.job_alerts (kind, region) values ('investment', current_setting('test.region')::uuid)$$,
  'a member saves the filters they are using as an alert');
select throws_ok($$insert into public.job_alerts (kind, region) values ('investment', current_setting('test.region')::uuid)$$,
  '23505', null, 'the same filters twice are one alert');
select lives_ok($$insert into public.job_alerts (kind, remote_only) values ('collaboration', true)$$,
  'a second, different alert');
select throws_ok($$insert into public.job_alerts (member_id, kind)
  values ('00000000-0000-0000-0000-000000004302', 'tender')$$, '42501', null, 'not for another member');
select lives_ok($$insert into public.job_alerts (kind) values ('partnership'), ('tender'), ('job')$$,
  'up to 5 alerts');
select throws_ok($$insert into public.job_alerts (kind) values ('collaboration')$$, '42501', null, 'but no sixth');
delete from public.job_alerts where kind in ('partnership', 'tender', 'job');
select pg_temp.login('02');
select lives_ok($$insert into public.job_alerts (kind, region) values ('investment', current_setting('test.region')::uuid)$$,
  'another member saves their own');
select is((select count(*) from public.job_alerts)::int, 1, 'and sees only their own');

reset role;
insert into public.job_alerts (member_id, kind) values ('00000000-0000-0000-0000-000000004304', 'investment');
update public.members set status = 'suspended' where id = '00000000-0000-0000-0000-000000004304';
-- Backdate the alerts so the posts below are newer than them.
update public.job_alerts set created_at = now() - interval '3 days';
insert into public.platform_settings (key, value) values ('job_alerts_last_run', to_jsonb((now() - interval '1 day')::text))
on conflict (key) do update set value = excluded.value;
select pg_temp.post('Mwanza investment today', 'investment', false, 2);
select pg_temp.post('Remote collaboration today', 'collaboration', true, 3);
select pg_temp.post('Mwanza investment last week', 'investment', false, 24 * 6);
select pg_temp.post('Alerted member''s own investment', 'investment', false, 1, '01');

select is(private.queue_job_alerts(), 2, 'two members have something new');
select is(pg_temp.notices('01'), '2',
  'one notice counts both new posts across the alerts, not the old post or the member''s own');
select is(pg_temp.emails('01'), 1, 'and one email is queued (the sender skips it when matches email is off)');
select is(pg_temp.notices('02'), '2',
  'another member is told about both Mwanza investments, including the one the first member posted');
select is(pg_temp.notices('04'), '', 'a suspended member gets nothing');
select is(private.queue_job_alerts(), 0, 'a second run finds nothing new');

select * from finish();
rollback;
