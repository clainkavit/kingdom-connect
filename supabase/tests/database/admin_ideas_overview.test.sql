begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(13);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000049' || k)::uuid, 'ai' || k || '@test.invalid' from unnest(array['01', '02', '03', 'a1']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000004901', 'ai_owner', 'approved'),
  ('00000000-0000-0000-0000-000000004902', 'ai_partner', 'approved'),
  ('00000000-0000-0000-0000-000000004903', 'ai_investor', 'approved');
insert into public.member_private (member_id, phone, email, language)
select ('00000000-0000-0000-0000-0000000049' || k)::uuid, '+2557120049' || k, 'ai' || k || '@test.invalid', 'en'
from unnest(array['01', '02', '03']) k;
insert into public.verification_requests (member_id, level, status, submitted_at, decided_at)
select ('00000000-0000-0000-0000-0000000049' || k)::uuid, 1, 'approved', now(), now() from unnest(array['01', '02', '03']) k;
insert into public.profiles (member_id, full_name) values
  ('00000000-0000-0000-0000-000000004901', 'Amina Owner'), ('00000000-0000-0000-0000-000000004903', 'Secret Investor');
insert into public.staff (id, full_name, role, active) values ('00000000-0000-0000-0000-0000000049a1', 'Ideas Admin', 'admin', true);

insert into public.ideas (id, owner_id, title, problem, sector_id, stage, seeking, status, published_at, show_owner)
select ('00000000-0000-0000-0000-00000000e49' || n)::uuid, '00000000-0000-0000-0000-000000004901', t,
       'A real problem that this idea solves for people.', (select id from public.sectors order by name_en limit 1),
       st, 'both', s, case when s = 'published' then now() end, n <> '2'
from (values ('1', 'Solar cold rooms', 'prototype', 'published'), ('2', 'Quiet tailoring', 'idea', 'published'),
             ('3', 'Waiting idea', 'idea', 'pending_moderation'), ('4', 'Hidden idea', 'growing', 'hidden'),
             ('5', 'Old idea', 'idea', 'archived'), ('6', 'Draft idea', 'idea', 'draft')) as x (n, t, st, s);
insert into public.idea_details (idea_id, description) values ('00000000-0000-0000-0000-00000000e491', repeat('Confidential plan. ', 5));
insert into public.idea_access_requests (idea_id, requester_id, role, anonymous, status, decided_at) values
  ('00000000-0000-0000-0000-00000000e491', '00000000-0000-0000-0000-000000004902', 'partner', false, 'approved', now()),
  ('00000000-0000-0000-0000-00000000e491', '00000000-0000-0000-0000-000000004903', 'investor', true, 'pending', null);

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000049' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
create function pg_temp.ours() returns text language sql as $$
  select string_agg(title, ', ' order by title) from public.admin_ideas_list()
  where idea_id::text like '00000000-0000-0000-0000-00000000e49%';
$$;

set local role authenticated;
select pg_temp.login('a1');
select ok((select published >= 2 and waiting >= 1 and hidden >= 1 and archived >= 1 from public.admin_ideas_overview()),
  'staff get the counts by status');
select ok((select (by_stage ->> 'prototype')::int >= 1 from public.admin_ideas_overview()), 'and published ideas by stage');
select ok((select jsonb_array_length(by_industry) >= 1 from public.admin_ideas_overview()), 'and by industry');
select ok((select interest_sent >= 2 and owner_approved >= 1 from public.admin_ideas_overview()), 'and interest to NDA this month');
select is(pg_temp.ours(), 'Hidden idea, Old idea, Quiet tailoring, Solar cold rooms, Waiting idea',
  'the list holds every idea but drafts');
select is((select posted_by || ':' || shared_without_name from public.admin_ideas_list() where title = 'Quiet tailoring'),
  'Amina Owner:true', 'staff see who posted an idea shared without a name');
select is((select interested || '/' || with_access from public.admin_ideas_list() where title = 'Solar cold rooms'), '2/0',
  'interest and access are counts only');
select is((select position('Secret Investor' in admin_ideas_list::text) + position('Confidential' in admin_ideas_list::text)
           from public.admin_ideas_list() where title = 'Solar cold rooms'), 0,
  'the list never names who is interested and never holds the details');
select is((select string_agg(title, ',') from public.admin_ideas_list(query => 'solar')), 'Solar cold rooms', 'search by title');
select is((select count(*)::int from public.admin_ideas_list(status => 'hidden') where idea_id::text like '00000000-0000-0000-0000-00000000e49%'), 1,
  'filter by status');

select pg_temp.login('01');
select is((select count(*)::int from public.admin_ideas_overview()), 0, 'a member gets no overview');
select is((select count(*)::int from public.admin_ideas_list()), 0, 'nor the list');

set local role anon;
select throws_ok($$select * from public.admin_ideas_list()$$, '42501', null, 'nor does a signed-out visitor');

select * from finish();
rollback;
