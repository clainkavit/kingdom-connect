begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(15);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000020' || k)::uuid, 'nw' || k || '@test.invalid'
from unnest(array['01', '02', 'a1']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000002001', 'nw_member', 'approved'),
  ('00000000-0000-0000-0000-000000002002', 'nw_applicant', 'pending');
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000020a1', 'News Editor', 'admin', true);

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000020' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;

set local role authenticated;
select pg_temp.login('01');
select throws_ok($$insert into public.news_items (title, body) values ('Member news', 'Not allowed')$$,
  '42501', null, 'a member cannot write news');

select pg_temp.login('a1');
select lives_ok($$insert into public.news_items (title, body) values ('Draft note', 'Still being written')$$,
  'staff save a draft');
select lives_ok($$insert into public.news_items (title, body, status, published_at)
                  values ('Pilot opens', 'Kingdom Connect opens for the pilot.', 'published', now() - interval '1 day')$$,
  'staff publish news');
select lives_ok($$insert into public.news_items (title, body, status, published_at, pinned)
                  values ('Welcome week', 'Join the welcome events this week.', 'published', now() - interval '2 days', true)$$,
  'and pin an item');
select is((select staff_id::text from public.news_items where title = 'Pilot opens'),
  '00000000-0000-0000-0000-0000000020a1', 'the author is the signed-in staff member');
select throws_ok($$insert into public.news_items (title, body, status) values ('No date', 'Published without a date', 'published')$$,
  '23514', null, 'a published item has a publish date');
select throws_ok($$insert into public.news_items (title, body, image_path) values ('Odd image', 'Body', 'members/photo.jpg')$$,
  '23514', null, 'news images live under news/');
select is((select count(*)::int from public.news_items), 3, 'staff see drafts and published items');

select pg_temp.login('01');
select is((select string_agg(title, ',' order by pinned desc, published_at desc) from public.news_items),
  'Welcome week,Pilot opens', 'a member sees published news, pinned first');
update public.news_items set title = 'Changed by a member' where title = 'Pilot opens';
delete from public.news_items where title = 'Pilot opens';

select pg_temp.login('02');
select is((select count(*)::int from public.news_items where status <> 'published'), 0,
  'an applicant who accepted the terms reads published news only (R27)');

select pg_temp.login('a1');
select is((select count(*)::int from public.news_items where title = 'Pilot opens'), 1,
  'a member cannot edit or delete news');
select lives_ok($$update public.news_items set status = 'published', published_at = now() where title = 'Draft note'$$,
  'staff publish a draft');
select lives_ok($$delete from public.news_items where title = 'Welcome week'$$, 'and delete an item');

reset role;
select ok(exists (select 1 from private.audit_log where action = 'news_items.insert'
                  and actor_staff_id = '00000000-0000-0000-0000-0000000020a1'), 'news changes are in the audit log');
select is((select public from storage.buckets where id = 'public-media'), false,
  'news images are not public on the internet');

select * from finish();
rollback;
