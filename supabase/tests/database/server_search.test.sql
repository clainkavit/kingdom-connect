begin;
create extension if not exists pgtap with schema extensions;
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(12);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000035' || k)::uuid, 'ss' || k || '@test.invalid' from unnest(array['01', '02']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000003501', 'ss_poster', 'approved'),
  ('00000000-0000-0000-0000-000000003502', 'ss_reader', 'approved');
insert into public.member_private (member_id, phone, email, language)
select ('00000000-0000-0000-0000-0000000035' || k)::uuid, '+2557120035' || k, 'ss' || k || '@test.invalid', 'en'
from unnest(array['01', '02']) k;
insert into public.verification_requests (member_id, level, status, submitted_at, decided_at)
select ('00000000-0000-0000-0000-0000000035' || k)::uuid, 1, 'approved', now(), now() from unnest(array['01', '02']) k;
insert into public.profiles (member_id, full_name) values
  ('00000000-0000-0000-0000-000000003501', 'Asha Poster'), ('00000000-0000-0000-0000-000000003502', 'Reader Two');

insert into public.opportunities (id, poster_member_id, type, title, role, employment_type, remote, sector_id,
                                  description, closing_at, status, published_at)
values
  ('00000000-0000-0000-0000-00000000e501', '00000000-0000-0000-0000-000000003501', 'job',
   'Mvule door carpenter', 'Carpenter', 'full_time', true, (select id from public.sectors limit 1),
   repeat('Build and fit hardwood doors for homes in Mwanza. ', 3), private.tanzania_today() + 20, 'published', now()),
  ('00000000-0000-0000-0000-00000000e502', '00000000-0000-0000-0000-000000003501', 'job',
   'Mvule table maker', null, 'part_time', true, (select id from public.sectors limit 1),
   repeat('Make dining tables in a small workshop near the lake. ', 3), private.tanzania_today() + 20, 'hidden', now()),
  ('00000000-0000-0000-0000-00000000e503', '00000000-0000-0000-0000-000000003501', 'partnership',
   'Partner for a timber yard', null, null, true, (select id from public.sectors limit 1),
   repeat('We are looking for a partner to run a mvule timber yard. ', 3), private.tanzania_today() + 20,
   'published', now());
insert into public.opportunity_skills (opportunity_id, skill_id)
select '00000000-0000-0000-0000-00000000e501', id from public.skills where name = 'carpentry';

insert into public.trainings (poster_member_id, title, provider, format, details, starts_at, seats, status, published_at)
values
  ('00000000-0000-0000-0000-000000003501', 'Mvule finishing class', 'Mkuyuni Workshop', 'online',
   'Oils and varnish', now() + interval '5 days', 20, 'published', now()),
  ('00000000-0000-0000-0000-000000003501', 'Mvule draft class', 'Mkuyuni Workshop', 'online',
   null, now() + interval '5 days', 20, 'draft', null),
  ('00000000-0000-0000-0000-000000003501', 'Mvule old class', 'Mkuyuni Workshop', 'online',
   null, now() - interval '2 days', 20, 'published', now());

select is((select count(*) from public.search_opportunities('mvule'))::int, 0, 'nobody signed in finds nothing');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub', '00000000-0000-0000-0000-000000003502', 'role', 'authenticated', 'otp_verified', true)::text, true);

select set_eq($$select title from public.search_opportunities('MVULE')$$,
  array['Mvule door carpenter', 'Partner for a timber yard'],
  'case is ignored and the description counts; a hidden post is not found');
select set_eq($$select title from public.search_opportunities('carpenter mvule')$$,
  array['Mvule door carpenter'], 'every word must appear, in any order');
select set_eq($$select title from public.search_opportunities('hardwood doors')$$,
  array['Mvule door carpenter'], 'words in the description match');
select set_eq($$select title from public.search_opportunities('asha')$$,
  array['Mvule door carpenter', 'Partner for a timber yard'], 'the poster''s name matches');
select is((select count(*) from public.search_opportunities('m'))::int, 0, 'one letter finds nothing');
select is((select count(*) from public.search_opportunities('mv%le'))::int, 0, 'wildcards are plain text');
select is((select count(*) from public.search_opportunities('mvule plumber'))::int, 0,
  'a word that is nowhere finds nothing');

select set_eq($$select title from public.search_trainings('mvule')$$, array['Mvule finishing class'],
  'only published, upcoming training is found');
select set_eq($$select title from public.search_trainings('varnish mkuyuni')$$, array['Mvule finishing class'],
  'details and provider match');

select set_config('request.jwt.claims', json_build_object(
  'sub', '00000000-0000-0000-0000-000000003501', 'role', 'authenticated', 'otp_verified', true)::text, true);
select set_eq($$select title from public.search_trainings('mvule')$$, array['Mvule finishing class'],
  'the poster''s own draft is not a search result');
select throws_ok($$select private.has_all_words('a', 'a')$$, '42501', null,
  'members cannot call the helper directly');

select * from finish();
rollback;
