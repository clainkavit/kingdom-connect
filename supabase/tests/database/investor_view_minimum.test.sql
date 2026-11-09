begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(4);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000041' || k)::uuid, 'iv' || k || '@test.invalid'
from unnest(array['01', '02', '03', '04', 'a1']) k;
insert into public.members (id, username, status)
select ('00000000-0000-0000-0000-0000000041' || k)::uuid, 'iv_' || k, 'approved' from unnest(array['01', '02', '03', '04']) k;
insert into public.member_private (member_id, phone, email, language)
select ('00000000-0000-0000-0000-0000000041' || k)::uuid, '+2557120041' || k, 'iv' || k || '@test.invalid', 'en'
from unnest(array['01', '02', '03', '04']) k;
insert into public.verification_requests (member_id, level, status, submitted_at, decided_at)
select ('00000000-0000-0000-0000-0000000041' || k)::uuid, 1, 'approved', now(), now() from unnest(array['01', '02', '03', '04']) k;
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000041a1', 'Viewer Checker', 'admin', true);
insert into public.investor_flags (member_id, granted_by, route)
select ('00000000-0000-0000-0000-0000000041' || k)::uuid, '00000000-0000-0000-0000-0000000041a1', 'invitation'
from unnest(array['02', '03', '04']) k;
insert into public.ideas (id, owner_id, title, problem, sector_id, stage, seeking, status, published_at)
values ('00000000-0000-0000-0000-00000000e411', '00000000-0000-0000-0000-000000004101', 'Cold rooms',
        'Fish spoils before it reaches the market.', (select id from public.sectors order by name_en limit 1),
        'prototype', 'both', 'published', now());
insert into public.idea_views (idea_id, viewer_id, kind) values
  ('00000000-0000-0000-0000-00000000e411', '00000000-0000-0000-0000-000000004102', 'summary'),
  ('00000000-0000-0000-0000-00000000e411', '00000000-0000-0000-0000-000000004102', 'detail'),
  ('00000000-0000-0000-0000-00000000e411', '00000000-0000-0000-0000-000000004103', 'summary');

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000041' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;

set local role authenticated;
select pg_temp.login('01');
select is(public.investor_view_count('00000000-0000-0000-0000-00000000e411'), 0, 'two investors looked, under the minimum of 3, so the owner sees 0');
reset role;
insert into public.idea_views (idea_id, viewer_id, kind)
values ('00000000-0000-0000-0000-00000000e411', '00000000-0000-0000-0000-000000004104', 'summary');
set local role authenticated;
select pg_temp.login('01');
select is(public.investor_view_count('00000000-0000-0000-0000-00000000e411'), 3, 'three investors looked, so the owner sees 3');
select pg_temp.login('02');
select is(public.investor_view_count('00000000-0000-0000-0000-00000000e411'), 0, 'another member always sees 0');
select pg_temp.login('a1');
select is(public.investor_view_count('00000000-0000-0000-0000-00000000e411'), 0, 'and so does staff, who read the log directly');

select * from finish();
rollback;
