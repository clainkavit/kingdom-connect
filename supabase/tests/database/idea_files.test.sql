begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(25);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000028' || k)::uuid, 'nf' || k || '@test.invalid'
from unnest(array['01', '02', '03']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000002801', 'nf_owner', 'approved'),
  ('00000000-0000-0000-0000-000000002802', 'nf_requester', 'approved'),
  ('00000000-0000-0000-0000-000000002803', 'nf_other', 'approved');
insert into public.member_private (member_id, phone, email, language)
select ('00000000-0000-0000-0000-0000000028' || k)::uuid, '+2557120008' || k, 'nf' || k || '@test.invalid', 'en'
from unnest(array['01', '02', '03']) k;
insert into public.profiles (member_id, full_name) values
  ('00000000-0000-0000-0000-000000002801', 'Asha Mwita'),
  ('00000000-0000-0000-0000-000000002802', 'Neema Joseph');
insert into public.verification_requests (member_id, level, status, submitted_at, decided_at)
select ('00000000-0000-0000-0000-0000000028' || k)::uuid, 1, 'approved', now(), now()
from unnest(array['01', '02', '03']) k;
insert into public.ideas (id, owner_id, title, problem, sector_id, stage, seeking, status, published_at) values
  ('00000000-0000-0000-0000-00000000e281', '00000000-0000-0000-0000-000000002801', 'Solar dryers',
   'Farmers lose much of their harvest before market.', (select id from public.sectors order by name_en limit 1),
   'prototype', 'both', 'published', now()),
  ('00000000-0000-0000-0000-00000000e282', '00000000-0000-0000-0000-000000002803', 'Other idea',
   'Someone else entirely owns this idea here.', (select id from public.sectors order by name_en limit 1),
   'idea', 'partner', 'published', now());
insert into public.idea_details (idea_id, description, financials) values
  ('00000000-0000-0000-0000-00000000e281', repeat('Confidential plan. ', 5), 'Pays back in one season.');
insert into public.idea_access_requests (id, idea_id, requester_id, role, status, decided_at) values
  ('00000000-0000-0000-0000-00000000a281', '00000000-0000-0000-0000-00000000e281',
   '00000000-0000-0000-0000-000000002802', 'partner', 'nda_accepted', now());
insert into storage.objects (bucket_id, name, metadata) values
  ('idea-files', '00000000-0000-0000-0000-00000000e281/00000000-0000-0000-0000-0000000f0281.pdf', '{"size": 1000}'),
  ('idea-files', '00000000-0000-0000-0000-00000000e281/00000000-0000-0000-0000-0000000f0282.png', '{"size": 5000}'),
  ('idea-files', '00000000-0000-0000-0000-00000000e281/00000000-0000-0000-0000-0000000f0284.png', '{"size": 20971000}'),
  ('idea-files', '00000000-0000-0000-0000-00000000e282/00000000-0000-0000-0000-0000000f0283.pdf', '{"size": 10}');

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000028' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
create function pg_temp.idea() returns uuid language sql as $$ select '00000000-0000-0000-0000-00000000e281'::uuid; $$;
create function pg_temp.path(n text) returns text language sql as $$
  select '00000000-0000-0000-0000-00000000e281/00000000-0000-0000-0000-0000000f028' || n;
$$;
create function pg_temp.member(who text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000028' || who)::uuid;
$$;

set local role authenticated;
select pg_temp.login('01');
select throws_ok($$insert into public.idea_files (idea_id, storage_path, file_name, mime, size)
                   values (pg_temp.idea(), pg_temp.path('1.pdf'), 'x', 'application/pdf', 1)$$,
  '42501', null, 'nobody writes to the table directly');
select is((select result from public.add_idea_file(pg_temp.idea(), 'Business plan.pdf', pg_temp.path('1.pdf'), 1000)),
  'ok', 'the owner adds a PDF');
select is((select result from public.add_idea_file(pg_temp.idea(), 'Big.png', pg_temp.path('4.png'), 1)),
  'too_large', 'the 20 MB counts every file of the idea, by the stored size and not the size the app reports');
select is((select result from public.add_idea_file(pg_temp.idea(), 'Prototype.png', pg_temp.path('2.png'), 5000)),
  'ok', 'the owner adds an image');
select is((select mime from public.idea_files where file_name = 'Prototype.png'), 'image/png', 'its type follows the path');
select is((select result from public.add_idea_file('00000000-0000-0000-0000-00000000e282', 'Not mine.pdf',
  '00000000-0000-0000-0000-00000000e282/00000000-0000-0000-0000-0000000f0283.pdf', 10)), 'not_allowed',
  'nobody adds files to another member''s idea');
select is((select is_owner::text || ' ' || viewer_name from public.open_idea_details(pg_temp.idea())), 'true Asha Mwita',
  'the owner opens the details, stamped with her name');

select pg_temp.login('03');
select is((select count(*)::int from public.open_idea_details(pg_temp.idea())), 0,
  'a member without access gets no details');
select is((select count(*)::int from public.idea_files), 0, 'nor the file list');
select ok(not access.idea_file_writable(pg_temp.path('9.pdf')), 'nor may upload to it');

select pg_temp.login('02');
select is((select viewer_name || ' ' || financials from public.open_idea_details(pg_temp.idea())),
  'Neema Joseph Pays back in one season.', 'a requester past the NDA opens the details, stamped with their name');
select is((select string_agg(file_name, ',' order by file_name) from public.idea_files), 'Business plan.pdf,Prototype.png',
  'and sees the file list');
select throws_ok($$select storage_path from public.idea_files$$, '42501', null, 'but never the storage paths');
select is((select count(*)::int from storage.objects where bucket_id = 'idea-files'), 0,
  'and cannot read the bucket directly');
select throws_ok($$select * from private.open_idea_file(pg_temp.member('02'),
                   (select id from public.idea_files where file_name = 'Business plan.pdf'))$$,
  '42501', null, 'only the Edge Function opens a file');
select is(public.remove_idea_file((select id from public.idea_files where file_name = 'Prototype.png')), null,
  'only the owner removes a file');

reset role;
select is((select storage_path || ' ' || viewer_name from private.open_idea_file(pg_temp.member('02'),
          (select id from public.idea_files where file_name = 'Business plan.pdf'))),
  pg_temp.path('1.pdf') || ' Neema Joseph', 'the Edge Function gets the file and the name to stamp');
select is((select string_agg(kind, ',' order by kind) from public.idea_views where viewer_id = pg_temp.member('02')),
  'detail,download', 'every view and download is logged');
select is((select count(*)::int from public.idea_views where viewer_id = pg_temp.member('01')), 0,
  'the owner''s own opens are not');
select is((select count(*)::int from private.open_idea_file(pg_temp.member('03'),
          (select id from public.idea_files where file_name = 'Business plan.pdf'))), 0,
  'a member without access gets no file');

set local role authenticated;
select pg_temp.login('01');
select is(public.revoke_idea_access('00000000-0000-0000-0000-00000000a281'), 'ok', 'the owner revokes access');
select is(public.remove_idea_file((select id from public.idea_files where file_name = 'Prototype.png')),
  pg_temp.path('2.png'), 'and removes a file, getting its path back');

reset role;
select is((select count(*)::int from private.open_idea_file(pg_temp.member('02'),
          (select id from public.idea_files where file_name = 'Business plan.pdf'))), 0,
  'a revoked requester cannot open a file link');
set local role authenticated;
select pg_temp.login('02');
select is((select count(*)::int from public.open_idea_details(pg_temp.idea())), 0, 'nor the details');
select is((select count(*)::int from public.idea_files), 0, 'nor the file list');

select * from finish();
rollback;
