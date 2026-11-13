begin;
create extension if not exists pgtap with schema extensions;
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(7);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000038' || k)::uuid, 'bm' || k || '@test.invalid' from unnest(array['01', '02', '03']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000003801', 'bm_poster', 'approved'),
  ('00000000-0000-0000-0000-000000003802', 'bm_skilled', 'approved'),
  ('00000000-0000-0000-0000-000000003803', 'bm_new', 'approved');
insert into public.profiles (member_id, full_name) values
  ('00000000-0000-0000-0000-000000003801', 'Best Poster'), ('00000000-0000-0000-0000-000000003802', 'Skilled One'),
  ('00000000-0000-0000-0000-000000003803', 'New One');
insert into public.skills (name) values ('bm joinery'), ('bm carving'), ('bm plumbing') on conflict (name) do nothing;
insert into public.profile_skills (member_id, skill_id)
select '00000000-0000-0000-0000-000000003802', id from public.skills where name in ('bm joinery', 'bm carving');

-- A: both skills, oldest. B: one of two, newer. C: no skills, newest and featured.
insert into public.opportunities (id, poster_member_id, type, title, employment_type, remote, sector_id,
                                  description, closing_at, status, published_at, featured_at)
values
  ('00000000-0000-0000-0038-00000000000a', '00000000-0000-0000-0000-000000003801', 'job', 'BM post A', 'full_time',
   true, (select id from public.sectors limit 1), repeat('A joinery and carving job for the best matches test. ', 3),
   private.tanzania_today() + 20, 'published', now() - interval '3 days', null),
  ('00000000-0000-0000-0038-00000000000b', '00000000-0000-0000-0000-000000003801', 'job', 'BM post B', 'full_time',
   true, (select id from public.sectors limit 1), repeat('A joinery and plumbing job for the best matches test. ', 3),
   private.tanzania_today() + 20, 'published', now() - interval '2 days', null),
  ('00000000-0000-0000-0038-00000000000c', '00000000-0000-0000-0000-000000003801', 'job', 'BM post C', 'full_time',
   true, (select id from public.sectors limit 1), repeat('A general job with no skills for the best matches test. ', 3),
   private.tanzania_today() + 20, 'published', now() - interval '1 day', now());
insert into public.opportunity_skills (opportunity_id, skill_id)
select '00000000-0000-0000-0038-00000000000a'::uuid, id from public.skills where name in ('bm joinery', 'bm carving')
union all
select '00000000-0000-0000-0038-00000000000b'::uuid, id from public.skills where name in ('bm joinery', 'bm plumbing');

create function pg_temp.order_of(best boolean) returns text[] language sql as $$
  select array_agg(title order by n) from (
    select title, row_number() over () as n from public.opportunity_list(best => best)
    where title like 'BM post %') x;
$$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub', '00000000-0000-0000-0000-000000003802', 'role', 'authenticated', 'otp_verified', true)::text, true);

select is(public.my_skill_count(), 2, 'the member has two skills');
select is(pg_temp.order_of(true), array['BM post A', 'BM post B', 'BM post C'],
  'best matches: all skills first, then some, then none, even before a featured post');
select is(pg_temp.order_of(false), array['BM post C', 'BM post B', 'BM post A'],
  'newest keeps the old order: featured first, then newest');
select is((select skills_matched || '/' || skills_total from public.opportunity_list() where title = 'BM post B'),
  '1/2', 'each post says how many of its skills the member has');
select is((select skills_matched || '/' || skills_total from public.opportunity_list() where title = 'BM post C'),
  '0/0', 'a post with no skills says 0 of 0');

select set_config('request.jwt.claims', json_build_object(
  'sub', '00000000-0000-0000-0000-000000003803', 'role', 'authenticated', 'otp_verified', true)::text, true);
select is(public.my_skill_count(), 0, 'a member without skills has none');
select is((select sum(skills_matched) from public.opportunity_list() where title like 'BM post %')::int, 0,
  'and matches nothing; another member''s skills never count');

select * from finish();
rollback;
