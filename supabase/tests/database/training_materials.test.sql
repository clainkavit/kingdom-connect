begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(25);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000023' || k)::uuid, 'tm' || k || '@test.invalid'
from unnest(array['01', '02', '03', '04', 'a1']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000002301', 'tm_poster', 'approved'),
  ('00000000-0000-0000-0000-000000002302', 'tm_registered', 'approved'),
  ('00000000-0000-0000-0000-000000002303', 'tm_waiting', 'approved'),
  ('00000000-0000-0000-0000-000000002304', 'tm_outsider', 'approved');
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000023a1', 'Materials Checker', 'admin', true);
insert into public.member_private (member_id, phone, email, language)
select ('00000000-0000-0000-0000-0000000023' || k)::uuid, '+2557120003' || k, 'tm' || k || '@test.invalid', 'en'
from unnest(array['01', '02', '03', '04']) k;
insert into public.verification_requests (member_id, level, status, submitted_at, decided_at)
select ('00000000-0000-0000-0000-0000000023' || k)::uuid, 1, 'approved', now(), now()
from unnest(array['01', '02', '03', '04']) k;
insert into public.trainings (id, poster_member_id, title, provider, format, seats, status, published_at)
values ('00000000-0000-0000-0000-00000000c231', '00000000-0000-0000-0000-000000002301', 'Bookkeeping basics',
        'Mwanza Business Centre', 'online', 1, 'published', now());
insert into public.registrations (member_id, training_id, status, waitlist_position) values
  ('00000000-0000-0000-0000-000000002302', '00000000-0000-0000-0000-00000000c231', 'registered', null),
  ('00000000-0000-0000-0000-000000002303', '00000000-0000-0000-0000-00000000c231', 'waitlisted', 1);

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000023' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
create function pg_temp.pdf() returns text language sql as $$
  select '00000000-0000-0000-0000-00000000c231/11111111-1111-4111-8111-111111111111.pdf';
$$;
create function pg_temp.add(kind text, title text, path text default null, size int default null,
                            url text default null) returns text language sql as $$
  select result from public.add_training_material('00000000-0000-0000-0000-00000000c231', kind, title, path, size, url);
$$;

set local role authenticated;
select pg_temp.login('04');
select ok(not public.can_manage_training('00000000-0000-0000-0000-00000000c231'), 'another member cannot manage it');
select is(pg_temp.add('link', 'Video', url => 'https://video.example.test/1'), 'not_allowed',
  'nor add materials');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('learning-materials', pg_temp.pdf())$$,
  '42501', null, 'nor upload a file to it');

select pg_temp.login('01');
select ok(public.can_manage_training('00000000-0000-0000-0000-00000000c231'), 'the poster manages the materials');
select is(pg_temp.add('link', 'Lesson 1 video', url => 'http://video.example.test/1'), 'invalid_url',
  'a link is https');
select is(pg_temp.add('link', 'Lesson 1 video', url => 'https://video.example.test/1'), 'ok', 'the poster adds a link');
select is(pg_temp.add('file', 'Workbook', pg_temp.pdf(), 5000), 'invalid_file', 'a file must be uploaded first');
select lives_ok($$insert into storage.objects (bucket_id, name) values ('learning-materials', pg_temp.pdf())$$,
  'the poster uploads a PDF under the training''s folder');
select throws_ok($$insert into storage.objects (bucket_id, name)
                   values ('learning-materials', '00000000-0000-0000-0000-00000000c231/notes.docx')$$,
  '42501', null, 'only PDFs, named by the app');
select is(pg_temp.add('file', 'Workbook', pg_temp.pdf(), 30000000), 'file_too_big', 'a PDF is at most 20 MB');
select is(pg_temp.add('file', 'Workbook', pg_temp.pdf(), 5000), 'ok', 'and adds it as a material');
select is((select count(*)::int from public.training_materials), 2, 'the poster sees both materials');

select pg_temp.login('02');
select is((select count(*)::int from public.training_materials), 2, 'a registered member sees the materials');
select is((select count(*)::int from storage.objects where bucket_id = 'learning-materials'), 1,
  'and can open the PDF');
select is(pg_temp.add('link', 'Extra', url => 'https://example.test/x'), 'not_allowed',
  'but cannot add materials');

select pg_temp.login('03');
select is((select count(*)::int from public.training_materials), 0, 'a waitlisted member sees no materials');
select is((select count(*)::int from storage.objects where bucket_id = 'learning-materials'), 0,
  'nor can they open the PDF');

select pg_temp.login('04');
select is((select count(*)::int from public.training_materials), 0, 'a member who did not register sees none');
select is((select count(*)::int from storage.objects where bucket_id = 'learning-materials'), 0,
  'nor can they open the PDF');

reset role;
update public.registrations set status = 'cancelled'
where member_id = '00000000-0000-0000-0000-000000002302';
set local role authenticated;
select pg_temp.login('02');
select is((select count(*)::int from public.training_materials), 0, 'cancelling a seat closes the materials');

select pg_temp.login('a1');
select is((select count(*)::int from public.training_materials), 2, 'staff see the materials');

select pg_temp.login('01');
select is(public.remove_training_material((select id from public.training_materials where kind = 'link')), 'ok',
  'the poster removes a material');
select is((select count(*)::int from public.training_materials), 1, 'and it is gone');

reset role;
select ok(not has_table_privilege('anon', 'public.training_materials', 'select'),
  'signed-out visitors see no materials');
select is((select public from storage.buckets where id = 'learning-materials'), false,
  'the materials bucket is private');

select * from finish();
rollback;
