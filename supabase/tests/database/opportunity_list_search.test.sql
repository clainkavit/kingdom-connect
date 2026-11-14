begin;
create extension if not exists pgtap with schema extensions;
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(8);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000045' || k)::uuid, 'os' || k || '@test.invalid' from unnest(array['01', '02']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000004501', 'os_poster', 'approved'),
  ('00000000-0000-0000-0000-000000004502', 'os_reader', 'approved');
insert into public.profiles (member_id, full_name) values
  ('00000000-0000-0000-0000-000000004501', 'Oswords Hardware'), ('00000000-0000-0000-0000-000000004502', 'Os Reader');
insert into public.skills (name) values ('os bookkeeping'), ('os tax') on conflict (name) do nothing;
insert into public.profile_skills (member_id, skill_id)
select '00000000-0000-0000-0000-000000004502', id from public.skills where name = 'os bookkeeping';

insert into public.opportunities (id, poster_member_id, type, title, role, employment_type, remote, sector_id,
                                  region_id, description, closing_at, status, published_at)
values
  ('00000000-0000-0000-0045-00000000000a', '00000000-0000-0000-0000-000000004501', 'job', 'OS shop bookkeeper',
   'Bookkeeper', 'full_time', false, (select id from public.sectors limit 1),
   (select id from public.regions where name_en = 'Mwanza'),
   'Keep daily   sales records.' || E'\n\n' || repeat('Prepare monthly reports for the owner. ', 10),
   private.tanzania_today() + 20, 'published', now() - interval '1 day'),
  ('00000000-0000-0000-0045-00000000000b', '00000000-0000-0000-0000-000000004501', 'job', 'OS delivery driver',
   'Driver', 'part_time', true, (select id from public.sectors limit 1), null,
   repeat('Drive school deliveries around town every morning. ', 3),
   private.tanzania_today() + 20, 'published', now() - interval '2 days');
insert into public.opportunity_skills (opportunity_id, skill_id)
select '00000000-0000-0000-0045-00000000000a'::uuid, id from public.skills where name in ('os bookkeeping', 'os tax');

create function pg_temp.titles(words text) returns text language sql as $$
  select coalesce(string_agg(title, ', ' order by title), '') from public.opportunity_list(q => words)
  where title like 'OS %';
$$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub', '00000000-0000-0000-0000-000000004502', 'role', 'authenticated', 'otp_verified', true)::text, true);

select is(pg_temp.titles(null), 'OS delivery driver, OS shop bookkeeper', 'with no words, every open post lists');
select is(pg_temp.titles('BOOKKEEPER monthly'), 'OS shop bookkeeper',
  'every word must match, in any case, across title and description');
select is(pg_temp.titles('mwanza os'), 'OS shop bookkeeper', 'the place name matches');
select is(pg_temp.titles('oswords driver'), 'OS delivery driver', 'the poster''s name matches');
select is(pg_temp.titles('os tax'), 'OS shop bookkeeper', 'a skill matches');
select is((select summary from public.opportunity_list() where title = 'OS shop bookkeeper'),
  left('Keep daily sales records. ' || repeat('Prepare monthly reports for the owner. ', 10), 180),
  'the summary is the description on one line, cut to 180 characters');
select is((select skills_mine from public.opportunity_list() where title = 'OS shop bookkeeper'),
  array['os bookkeeping'], 'each row names the post''s skills the member already has');
select ok(not exists (select 1 from information_schema.routines r
                      join information_schema.parameters p on p.specific_name = r.specific_name
                      where r.routine_schema = 'public' and r.routine_name = 'opportunity_list'
                        and p.parameter_mode = 'OUT' and p.parameter_name in ('total', 'count')),
  'the list returns no total: members see no platform-wide figures');

select * from finish();
rollback;
