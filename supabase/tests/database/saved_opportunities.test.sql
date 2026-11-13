begin;
create extension if not exists pgtap with schema extensions;
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(12);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000037' || k)::uuid, 'sv' || k || '@test.invalid'
from unnest(array['01', '02', '03']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000003701', 'sv_poster', 'approved'),
  ('00000000-0000-0000-0000-000000003702', 'sv_saver', 'approved'),
  ('00000000-0000-0000-0000-000000003703', 'sv_other', 'approved');
insert into public.profiles (member_id, full_name) values ('00000000-0000-0000-0000-000000003701', 'Saved Poster');

insert into public.opportunities (id, poster_member_id, type, title, employment_type, remote, sector_id,
                                  description, closing_at, status, published_at)
select ('00000000-0000-0000-0037-00000000000' || k)::uuid, '00000000-0000-0000-0000-000000003701', 'job',
       'Saved post ' || k, 'full_time', true, (select id from public.sectors limit 1),
       repeat('A post for the saved opportunities test, with enough words. ', 3), private.tanzania_today() + 20,
       'published', now()
from unnest(array['1', '2', '3']) k;
insert into public.opportunities (id, poster_member_id, type, title, employment_type, remote, sector_id,
                                  description, closing_at, status)
values ('00000000-0000-0000-0037-000000000009', '00000000-0000-0000-0000-000000003701', 'job', 'A draft post',
        'full_time', true, (select id from public.sectors limit 1), 'Not ready', null, 'draft');

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000037' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;

set local role authenticated;
select pg_temp.login('02');
select lives_ok($$insert into public.saved_opportunities (opportunity_id) values
  ('00000000-0000-0000-0037-000000000001'), ('00000000-0000-0000-0037-000000000002'),
  ('00000000-0000-0000-0037-000000000003')$$, 'a member saves posts they can see');
select throws_ok($$insert into public.saved_opportunities (opportunity_id)
  values ('00000000-0000-0000-0037-000000000009')$$, '42501', null, 'but not someone else''s draft');
select throws_ok($$insert into public.saved_opportunities (member_id, opportunity_id)
  values ('00000000-0000-0000-0000-000000003703', '00000000-0000-0000-0037-000000000001')$$, '42501', null,
  'and not for another member');
select is((select count(*) from public.saved_opportunities)::int, 3, 'the member sees their three saves');
select is((select count(*) from public.saved_opportunities() where available and open)::int, 3,
  'all three are listed as open');

reset role;
update public.opportunities set status = 'closed', closed_at = now() where id = '00000000-0000-0000-0037-000000000002';
update public.opportunities set status = 'hidden' where id = '00000000-0000-0000-0037-000000000003';
set local role authenticated;
select pg_temp.login('02');
select is((select title from public.saved_opportunities() where id = '00000000-0000-0000-0037-000000000002'),
  'Saved post 2', 'a closed post stays on the list');
select is((select open from public.saved_opportunities() where id = '00000000-0000-0000-0037-000000000002'), false,
  'marked as not open');
select ok((select not available and title is null and poster_name is null from public.saved_opportunities()
           where id = '00000000-0000-0000-0037-000000000003'),
  'a hidden post stays as no longer available, with none of its content');

select pg_temp.login('03');
select is((select count(*) from public.saved_opportunities)::int, 0, 'another member sees none of these saves');
select is((select count(*) from public.saved_opportunities())::int, 0, 'nor in the saved list');
delete from public.saved_opportunities;

select pg_temp.login('02');
delete from public.saved_opportunities where opportunity_id = '00000000-0000-0000-0037-000000000001';
select is((select count(*) from public.saved_opportunities)::int, 2,
  'the member removes their own save, and another member''s delete touched nothing');

reset role;
delete from public.members where id = '00000000-0000-0000-0000-000000003702';
select is((select count(*) from public.saved_opportunities where member_id = '00000000-0000-0000-0000-000000003702')::int,
  0, 'saves go with the member');

select * from finish();
rollback;
