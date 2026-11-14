begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(7);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000025' || k)::uuid, 'ip' || k || '@test.invalid'
from unnest(array['01', '02', '03', '04']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000002501', 'ip_owner', 'approved'),
  ('00000000-0000-0000-0000-000000002502', 'ip_reader', 'approved'),
  ('00000000-0000-0000-0000-000000002503', 'ip_blocked', 'approved'),
  ('00000000-0000-0000-0000-000000002504', 'ip_pending', 'pending');
insert into public.profiles (member_id, full_name) values ('00000000-0000-0000-0000-000000002501', 'Asha Mwita');
insert into public.verification_requests (member_id, level, status, submitted_at, decided_at)
select ('00000000-0000-0000-0000-0000000025' || k)::uuid, 1, 'approved', now(), now()
from unnest(array['01', '02', '03']) k;
insert into public.ideas (id, owner_id, title, problem, sector_id, stage, seeking, show_owner, status, published_at)
select ('00000000-0000-0000-0000-00000000d25' || k)::uuid, '00000000-0000-0000-0000-000000002501', t,
       'A problem worth solving for many people.', (select id from public.sectors order by name_en limit 1),
       'idea', 'both', named, 'published', now() - (k || ' minutes')::interval
from (values ('1', 'Named idea', true), ('2', 'Unnamed idea', false)) v(k, t, named);
insert into public.idea_details (idea_id, description, financials)
select id, repeat('Confidential plan. ', 5), 'Secret numbers' from public.ideas;
insert into public.blocks (blocker_id, blocked_id)
values ('00000000-0000-0000-0000-000000002503', '00000000-0000-0000-0000-000000002501');

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000025' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;

set local role authenticated;
select pg_temp.login('02');
select is((select string_agg(title || ':' || coalesce(owner_name, 'A verified member') || ':' || is_mine, ','
                             order by published_at desc) from public.idea_summaries),
  'Named idea:Asha Mwita:false,Unnamed idea:A verified member:false', 'a member browses the pool, newest first');
select is((select count(*)::int from public.idea_summaries
           where owner_id = '00000000-0000-0000-0000-000000002501'), 1,
  'the owner''s profile tab lists only the named idea');
select ok(not exists (select 1 from information_schema.columns where table_schema = 'public'
                      and table_name = 'idea_summaries'
                      and column_name in ('description', 'business_model', 'market', 'financials', 'team')),
  'the details are never in the summary query');
select ok(position('Secret numbers' in (select string_agg(row_to_json(s)::text, '') from public.idea_summaries s)) = 0,
  'and no detail text reaches a member');

select pg_temp.login('01');
select is((select count(*)::int from public.idea_summaries where is_mine), 2,
  'the owner sees both as their own, the unnamed one too');

select pg_temp.login('03');
select is((select count(*)::int from public.idea_summaries), 0,
  'a member who blocked the owner sees none of their ideas, named or not');

select pg_temp.login('04');
select is((select count(*)::int from public.idea_summaries where owner_id is not null), 0,
  'an applicant who accepted the terms looks at summaries (R27), never with the owner''s member id');

select * from finish();
rollback;
