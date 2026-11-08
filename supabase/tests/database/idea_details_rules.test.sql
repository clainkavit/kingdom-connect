begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(23);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000029' || k)::uuid, 'dr' || k || '@test.invalid'
from unnest(array['01', '02', '03', '04', 'a1']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000002901', 'dr_owner', 'approved'),
  ('00000000-0000-0000-0000-000000002902', 'dr_requester', 'approved'),
  ('00000000-0000-0000-0000-000000002903', 'dr_blocked', 'approved'),
  ('00000000-0000-0000-0000-000000002904', 'dr_other', 'approved');
insert into public.member_private (member_id, phone, email, language)
select ('00000000-0000-0000-0000-0000000029' || k)::uuid, '+2557120029' || k, 'dr' || k || '@test.invalid', 'en'
from unnest(array['01', '02', '03', '04']) k;
insert into public.verification_requests (member_id, level, status, submitted_at, decided_at)
select ('00000000-0000-0000-0000-0000000029' || k)::uuid, 1, 'approved', now(), now()
from unnest(array['01', '02', '03', '04']) k;
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000029a1', 'Idea Checker', 'admin', true);
insert into public.ideas (id, owner_id, title, problem, sector_id, stage, seeking, status, published_at) values
  ('00000000-0000-0000-0000-00000000e291', '00000000-0000-0000-0000-000000002901', 'Cold rooms',
   'Fish spoils before it reaches the market.', (select id from public.sectors order by name_en limit 1),
   'prototype', 'both', 'published', now());
insert into public.idea_details (idea_id, description) values
  ('00000000-0000-0000-0000-00000000e291', repeat('Confidential plan. ', 5));
insert into public.idea_access_requests (idea_id, requester_id, role, status, decided_at)
select '00000000-0000-0000-0000-00000000e291', ('00000000-0000-0000-0000-0000000029' || k)::uuid, 'partner',
       'nda_accepted', now()
from unnest(array['02', '03']) k;
insert into public.blocks (blocker_id, blocked_id)
  values ('00000000-0000-0000-0000-000000002901', '00000000-0000-0000-0000-000000002903');
insert into storage.objects (bucket_id, name, metadata) values
  ('idea-files', '00000000-0000-0000-0000-00000000e291/00000000-0000-0000-0000-0000000f0291.pdf', '{"size": 1000}');
insert into public.idea_files (id, idea_id, storage_path, file_name, mime, size) values
  ('00000000-0000-0000-0000-0000000f0291', '00000000-0000-0000-0000-00000000e291',
   '00000000-0000-0000-0000-00000000e291/00000000-0000-0000-0000-0000000f0291.pdf', 'Plan.pdf', 'application/pdf', 1000);

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000029' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
create function pg_temp.idea() returns uuid language sql as $$ select '00000000-0000-0000-0000-00000000e291'::uuid; $$;
create function pg_temp.member(who text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000029' || who)::uuid;
$$;

set local role authenticated;
select pg_temp.login('02');
select is((select count(*)::int from public.idea_details), 0,
  'a requester past the NDA cannot read the details table directly');
select is((select count(*)::int from public.open_idea_details(pg_temp.idea())), 1, 'only through the logging function');
select is((select count(*)::int from public.idea_views), 0, 'a requester cannot read the view log');
select throws_ok($$insert into public.idea_views (idea_id, viewer_id, kind) values (pg_temp.idea(), pg_temp.member('02'), 'detail')$$,
  '42501', null, 'nor write to it');
select throws_ok($$delete from public.idea_views$$, '42501', null, 'nor delete from it');

select pg_temp.login('01');
select is((select count(*)::int from public.idea_views), 0, 'the owner cannot read the view log either');
select throws_ok($$update public.idea_views set kind = 'summary'$$, '42501', null, 'nor change it');
select is((select count(*)::int from public.idea_details), 1, 'the owner still reads her own details');

select pg_temp.login('03');
select is((select count(*)::int from public.open_idea_details(pg_temp.idea())), 0,
  'a requester the owner has blocked gets no details');
select is((select count(*)::int from public.idea_files), 0, 'and no file list');

select pg_temp.login('a1');
select is((select count(*)::int from public.open_idea_details(pg_temp.idea())), 1, 'staff open the details');
select is((select count(*)::int from public.idea_views), 1, 'staff see the member opens in the view log');

reset role;
select is((select count(*)::int from public.idea_views where viewer_id = pg_temp.member('02')), 1,
  'the requester''s open is in the view log');
select is((select count(*)::int from private.audit_log where action = 'idea_views.detail' and target_id = pg_temp.idea()
           and actor_member_id = pg_temp.member('02')), 1, 'and in the audit log');
select is((select count(*)::int from private.audit_log where action = 'idea_views.detail' and target_id = pg_temp.idea()
           and actor_staff_id = '00000000-0000-0000-0000-0000000029a1'), 1,
  'a staff open is in the audit log, against the staff id');
select is((select count(*)::int from private.open_idea_file('00000000-0000-0000-0000-0000000029a1', '00000000-0000-0000-0000-0000000f0291')), 1,
  'staff open a file');
select is((select count(*)::int from private.open_idea_file(pg_temp.member('03'), '00000000-0000-0000-0000-0000000f0291')), 0,
  'a blocked requester gets no file');
select is((select count(*)::int from private.audit_log where action = 'idea_views.download' and target_id = pg_temp.idea()), 1,
  'a download is in the audit log');

select is((select count(*)::int from private.open_idea_file(pg_temp.member('02'), '00000000-0000-0000-0000-0000000f0291')), 1,
  'a requester past the NDA gets the file');
update public.ideas set status = 'hidden' where id = pg_temp.idea();
select is((select count(*)::int from private.open_idea_file(pg_temp.member('02'), '00000000-0000-0000-0000-0000000f0291')), 0,
  'but not once the idea is hidden');
set local role authenticated;
select pg_temp.login('02');
select is((select count(*)::int from public.open_idea_details(pg_temp.idea())), 0, 'nor the details');
select pg_temp.login('01');
select is((select count(*)::int from public.open_idea_details(pg_temp.idea())), 1, 'the owner still opens them');

set local role anon;
select throws_ok($$select * from public.open_idea_details('00000000-0000-0000-0000-00000000e291')$$, '42501', null,
  'a signed-out visitor cannot open the details');

select * from finish();
rollback;
