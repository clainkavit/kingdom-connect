begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(20);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000032' || k)::uuid, 'pd' || k || '@test.invalid'
from unnest(array['01', '02', '04', 'a1']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000003201', 'pd_owner', 'approved'),
  ('00000000-0000-0000-0000-000000003202', 'pd_partner', 'approved'),
  ('00000000-0000-0000-0000-000000003204', 'pd_outsider', 'approved');
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000032a1', 'Plan Desk', 'admin', true);
insert into public.member_private (member_id, phone, email, language)
select ('00000000-0000-0000-0000-0000000032' || k)::uuid, '+2557120012' || k, 'pd' || k || '@test.invalid', 'en'
from unnest(array['01', '02', '04']) k;
insert into public.profiles (member_id, full_name) values
  ('00000000-0000-0000-0000-000000003201', 'Asha Mwita'),
  ('00000000-0000-0000-0000-000000003202', 'Neema Joseph');
insert into public.verification_requests (member_id, level, status, submitted_at, decided_at)
select ('00000000-0000-0000-0000-0000000032' || k)::uuid, 1, 'approved', now(), now()
from unnest(array['01', '02', '04']) k;
insert into public.ideas (id, owner_id, title, problem, sector_id, stage, seeking, status, published_at) values
  ('00000000-0000-0000-0000-00000000e321', '00000000-0000-0000-0000-000000003201', 'Solar dryers',
   'Farmers lose much of their harvest before market.', (select id from public.sectors order by name_en limit 1),
   'prototype', 'both', 'published', now());
insert into public.milestone_plans (id, member_a, member_b, idea_id, started_by, status, stage1_agreed_at) values
  ('00000000-0000-0000-0000-0000000a3201', '00000000-0000-0000-0000-000000003201',
   '00000000-0000-0000-0000-000000003202', '00000000-0000-0000-0000-00000000e321',
   '00000000-0000-0000-0000-000000003201', 'active', now() - interval '2 days');
insert into public.milestones (id, plan_id, position, title, responsible_member_id, status, confirmed_at) values
  ('00000000-0000-0000-0000-0000000b3201', '00000000-0000-0000-0000-0000000a3201', 1, 'Agreed in principle',
   '00000000-0000-0000-0000-000000003201', 'confirmed', now()),
  ('00000000-0000-0000-0000-0000000b3202', '00000000-0000-0000-0000-0000000a3201', 2, 'Build the first dryer',
   '00000000-0000-0000-0000-000000003202', 'done', null);

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000032' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
create function pg_temp.plan() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000a3201'::uuid; $$;
create function pg_temp.path(who text) returns text language sql as $$
  select '00000000-0000-0000-0000-0000000a3201/00000000-0000-0000-0000-0000000032' || who || '.pdf';
$$;
create function pg_temp.upload(who text, size int default 1000) returns void language sql as $$
  insert into storage.objects (bucket_id, name, metadata)
  values ('plan-documents', pg_temp.path(who), jsonb_build_object('size', size));
$$;

set local role authenticated;
select pg_temp.login('02');
select ok(not public.can_upload_plan_document(pg_temp.plan()), 'no upload before every stage is confirmed');
select is(public.record_plan_document(pg_temp.plan(), pg_temp.path('02'), 1000), 'not_allowed', 'nor recording one');

reset role;
update public.milestones set status = 'confirmed', confirmed_at = now() where id = '00000000-0000-0000-0000-0000000b3202';
set local role authenticated;

select pg_temp.login('02');
select ok(public.can_upload_plan_document(pg_temp.plan()), 'once every stage is confirmed, a member may upload');
select ok(not access.plan_document_path_ok(pg_temp.path('01')), 'only to their own path');
select lives_ok($$select pg_temp.upload('02', 20000000)$$, 'the member uploads their signed PDF');
select is(public.record_plan_document(pg_temp.plan(), pg_temp.path('02'), 1000), 'too_large',
  'up to 10 MB, by the stored size and not the size the app reports');
reset role;
update storage.objects set metadata = '{"size": 1000}' where bucket_id = 'plan-documents' and name = pg_temp.path('02');
set local role authenticated;
select pg_temp.login('02');
select is(public.record_plan_document(pg_temp.plan(), pg_temp.path('02'), 20000000), 'ok',
  'and records it, whatever size the app reports');
select is((select size from public.plan_documents where uploaded_by = '00000000-0000-0000-0000-000000003202'), 1000,
  'with the stored size');
select is(public.record_plan_document(pg_temp.plan(), pg_temp.path('02'), 1000), 'not_allowed', 'once per member');
select is((select status from public.milestone_plans where id = pg_temp.plan()), 'active', 'the plan waits for the other');

select pg_temp.login('04');
select is((select count(*)::int from public.plan_documents), 0, 'another member never sees it');
select is((select count(*)::int from storage.objects where bucket_id = 'plan-documents'), 0, 'nor the file');

select pg_temp.login('a1');
select is((select count(*)::int from storage.objects where bucket_id = 'plan-documents'), 0,
  'staff cannot open a signed document without an open report');
select is((select count(*)::int from public.plan_documents), 0, 'nor see it listed');

select pg_temp.login('01');
select is((select count(*)::int from storage.objects where bucket_id = 'plan-documents'), 1,
  'the other member can open it');
select lives_ok($$select pg_temp.upload('01')$$, 'and uploads theirs');
select is(public.record_plan_document(pg_temp.plan(), pg_temp.path('01'), 2000), 'ok', 'which completes the plan');
select is((select status from public.milestone_plans where id = pg_temp.plan()), 'completed', 'Completed');
select ok((select already_reported = false from public.report('plan', pg_temp.plan(), 'other', 'They stopped replying.')),
  'a member reports the plan');

select pg_temp.login('a1');
select is((select count(*)::int from storage.objects where bucket_id = 'plan-documents'), 2,
  'while that report is open, staff can open the signed documents');

select * from finish();
rollback;
