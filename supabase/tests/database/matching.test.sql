begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(22);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000038' || k)::uuid, 'mt' || k || '@test.invalid'
from unnest(array['01', '02', '03', '04', '05', 'a1', 'a2']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000003801', 'mt_member', 'approved'),
  ('00000000-0000-0000-0000-000000003802', 'mt_investor', 'approved'),
  ('00000000-0000-0000-0000-000000003803', 'mt_twin', 'approved'),
  ('00000000-0000-0000-0000-000000003804', 'mt_poster', 'approved'),
  ('00000000-0000-0000-0000-000000003805', 'mt_empty', 'approved');
insert into public.member_private (member_id, phone, email, language)
select ('00000000-0000-0000-0000-0000000038' || k)::uuid, '+2557120038' || k, 'mt' || k || '@test.invalid', 'en'
from unnest(array['01', '02', '03', '04', '05']) k;
insert into public.verification_requests (member_id, level, status, submitted_at, decided_at)
select ('00000000-0000-0000-0000-0000000038' || k)::uuid, 1, 'approved', now(), now()
from unnest(array['01', '02', '03', '04', '05']) k;
insert into public.staff (id, full_name, role, active) values
  ('00000000-0000-0000-0000-0000000038a1', 'Plain Admin', 'admin', true),
  ('00000000-0000-0000-0000-0000000038a2', 'Super Admin', 'super_admin', true);

select set_config('test.sector', (select id::text from public.sectors order by name_en limit 1), true);
select set_config('test.sector2', (select id::text from public.sectors order by name_en offset 1 limit 1), true);
select set_config('test.region', (select id::text from public.regions where name_en = 'Mwanza'), true);
select set_config('test.region2', (select id::text from public.regions where name_en <> 'Mwanza' order by name_en limit 1), true);
select set_config('test.district', (select id::text from public.districts
                                     where region_id = current_setting('test.region')::uuid order by name_en limit 1), true);
select set_config('test.today', private.tanzania_today()::text, true);

insert into public.skills (name) values ('accounting'), ('auditing'), ('bookkeeping'), ('tax'), ('welding') on conflict (name) do nothing;
-- Three members with the same profile: 01 (owns a post, answered another), 02 (investor flag), 03 (no flag).
insert into public.profiles (member_id, full_name, region_id, district_id, profession, study_institution, study_course)
select ('00000000-0000-0000-0000-0000000038' || k)::uuid, 'Member ' || k, current_setting('test.region')::uuid,
       current_setting('test.district')::uuid, (select lower(name_en) from public.sectors where id = current_setting('test.sector2')::uuid),
       'Shihezi University', 'Accounting'
from unnest(array['01', '02', '03']) k;
insert into public.profiles (member_id, full_name) values
  ('00000000-0000-0000-0000-000000003804', 'Post Poster'), ('00000000-0000-0000-0000-000000003805', 'Empty Member');
insert into public.profile_skills (member_id, skill_id)
select ('00000000-0000-0000-0000-0000000038' || k)::uuid, s.id
from unnest(array['01', '02', '03']) k, public.skills s where s.name in ('accounting', 'auditing', 'bookkeeping', 'tax');
insert into public.investor_flags (member_id, granted_by, route)
  values ('00000000-0000-0000-0000-000000003802', '00000000-0000-0000-0000-0000000038a1', 'invitation');

create function pg_temp.add(title text, kind text default 'job', status text default 'published', skills text[] default '{}',
                            region text default null, district text default null, sector text default 'test.sector',
                            remote boolean default false, employment text default 'full_time', closing int default 20,
                            poster uuid default '00000000-0000-0000-0000-000000003804')
returns uuid language plpgsql as $$
declare saved uuid;
begin
  insert into public.opportunities (poster_member_id, type, title, employment_type, region_id, district_id, remote,
                                    sector_id, description, closing_at, status, published_at)
  values (poster, kind, title, case when kind = 'job' then employment end,
          case when remote then null else coalesce(current_setting(region, true), current_setting('test.region2'))::uuid end,
          case when remote then null else current_setting(district, true)::uuid end, remote,
          current_setting(sector)::uuid, repeat('A fair description of the work to do. ', 4),
          current_setting('test.today')::date + closing, status, now() - make_interval(hours => closing))
  returning id into saved;
  insert into public.opportunity_skills (opportunity_id, skill_id)
  select saved, s.id from public.skills s where s.name = any (skills);
  return saved;
end $$;
select pg_temp.add('A same district two skills', skills => array['accounting', 'auditing'], region => 'test.region',
                   district => 'test.district', closing => 25);
select pg_temp.add('C same region four skills', skills => array['accounting', 'auditing', 'bookkeeping', 'tax'],
                   region => 'test.region', closing => 22);
select pg_temp.add('G internship one skill', skills => array['tax'], employment => 'internship', closing => 24);
select pg_temp.add('H sector two one skill', skills => array['accounting'], sector => 'test.sector2', closing => 21);
select pg_temp.add('B remote no skills', remote => true, closing => 23);
select pg_temp.add('Not matching welding', skills => array['welding'], closing => 26);
select pg_temp.add('Closed with skills', status => 'closed', skills => array['accounting', 'auditing'], region => 'test.region');
select pg_temp.add('Hidden with skills', status => 'hidden', skills => array['accounting', 'auditing'], region => 'test.region');
select pg_temp.add('Own post with skills', skills => array['accounting', 'auditing'], region => 'test.region',
                   poster => '00000000-0000-0000-0000-000000003801');
select pg_temp.add('Answered post with skills', skills => array['accounting', 'auditing'], region => 'test.region');
insert into public.responses (opportunity_id, member_id, kind)
select id, '00000000-0000-0000-0000-000000003801', 'application' from public.opportunities where title = 'Answered post with skills';

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000038' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
create function pg_temp.titles(rows int default 20) returns text language sql as $$
  select coalesce(string_agg(left(title, 1), ',' order by score desc, closing_at), '') from public.scan_opportunities(rows);
$$;

set local role authenticated;
select pg_temp.login('01');
select is(pg_temp.titles(), 'C,A,H,G', 'matches come best first, without the own, answered, closed, hidden or weak ones');
select is((select string_agg(score::text, ',' order by score desc) from public.scan_opportunities()), '68,55,35,30',
  'scores follow the weights: skills (3 counted) 20 each, sector 15, location 15 or 8, study 10');
select is((select reasons -> 0 ->> 'code' || ',' || (reasons -> 1 ->> 'code') from public.scan_opportunities() where title like 'A %'),
  'skills,location', 'the top two reasons come with a code');
select is((select reasons -> 0 -> 'detail' -> 'skills' from public.scan_opportunities() where title like 'A %'),
  '["accounting", "auditing"]'::jsonb, 'the skill reason carries the member''s matching tags');
select is((select reasons -> 1 -> 'detail' ->> 'kind' from public.scan_opportunities() where title like 'A %'), 'district',
  'and the location reason its kind');
select is((select reasons -> 1 ->> 'code' from public.scan_opportunities() where title like 'H %'), 'sector',
  'a sector match shows as a reason when it is among the top two');
select is((select reasons -> 1 ->> 'code' from public.scan_opportunities() where title like 'G %'), 'study',
  'and study info for an internship');
select is(pg_temp.titles(2), 'C,A', 'a row limit applies');
select is((select score from public.scan_opportunities() where title like 'C %'), 68, 'only 3 skills count of 4');
select is((select count(*)::int from public.scan_opportunities() where title like 'B %'), 0,
  'a remote post with nothing else is under the minimum');

select pg_temp.login('03');
create temp table twin as select title, score, reasons from public.scan_opportunities();
grant select on twin to authenticated;
select is((select count(*)::int from twin), 6,
  'a member without the flag, with the same profile, also sees the posts the first member owns and answered');
select pg_temp.login('02');
select is((select count(*)::int from (
             (select title, score, reasons from public.scan_opportunities() except select title, score, reasons from twin)
             union all
             (select title, score, reasons from twin except select title, score, reasons from public.scan_opportunities())) x),
  0, 'the investor flag holder gets exactly the same matches, scores and reasons');

select pg_temp.login('05');
select is((select count(*)::int from public.scan_opportunities()), 0, 'a member with an empty profile gets no matches');
select is(public.scan_missing_fields(), array['skills', 'location', 'profession'], 'and is told which fields are missing');
select pg_temp.login('01');
select is(public.scan_missing_fields(), '{}'::text[], 'a full profile has none missing');

select is((select count(*)::int from public.matching_settings_list()), 0, 'members cannot read the weights');
select pg_temp.login('a1');
select is((select count(*)::int from public.matching_settings_list() where feature = 'scan'), 8, 'staff read them');
select is(public.set_matching_setting('scan', 'sector', 30), 'not_super_admin', 'an Administrator cannot change them');
select pg_temp.login('a2');
select is(public.set_matching_setting('scan', 'skill_max', 11), 'invalid_points', 'the skill count is 1 to 10');
select is(public.set_matching_setting('scan', 'minimum', 50), 'ok', 'a Super Administrator changes a weight');
select pg_temp.login('01');
select is(pg_temp.titles(), 'C,A', 'which applies at once');

reset role;
select is((select (before ->> 'points') || '>' || (after ->> 'points') from private.audit_log
           where target_type = 'matching_settings' and action = 'matching_settings.update'), '20>50',
  'and the audit log keeps the before and after values');

select * from finish();
rollback;
