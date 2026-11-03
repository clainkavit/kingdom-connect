begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(23);

select is(
  (select array_agg(c.relname::text order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  null, 'row-level security is on for every public table');
select is(
  (select array_agg(c.relname::text order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname
                     and p.permissive = 'RESTRICTIVE' and p.policyname like 'base rule%')),
  null, 'every public table has a restrictive base rule');
select is(
  (select array_agg(c.relname::text order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and has_table_privilege('anon', c.oid, 'select')),
  array['legal_texts', 'platform_settings'],
  'signed-out visitors can select only from legal_texts (terms and privacy) and platform_settings (the names)');

select ok(not has_schema_privilege('anon', 'access', 'usage'), 'signed-out visitors cannot use the helper functions');
select ok(has_function_privilege('authenticated', 'access.is_connected(uuid, uuid)', 'execute'), 'policies run as signed-in users can call the helpers');
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef),
  null, 'no security definer function sits in public, the schema the API exposes');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'one@test.invalid'),
  ('00000000-0000-0000-0000-000000000002', 'two@test.invalid'),
  ('00000000-0000-0000-0000-000000000003', 'three@test.invalid'),
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.invalid');
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000000001', 'one', 'pending'),
  ('00000000-0000-0000-0000-000000000002', 'two', 'pending');
insert into public.staff (id, full_name, role) values ('00000000-0000-0000-0000-0000000000a1', 'Test Admin', 'admin');
insert into public.member_private (member_id, email, phone, id_type, id_fingerprint) values
  ('00000000-0000-0000-0000-000000000001', 'one@test.invalid', '+255700000001', 'nida', '\x01');
select throws_ok($$insert into public.member_private (member_id, email, phone, id_type, id_fingerprint)
  values ('00000000-0000-0000-0000-000000000002', 'two@test.invalid', '+255700000002', 'nida', '\x01')$$,
  '23505', null, 'the same ID cannot register twice');
select lives_ok($$insert into public.member_private (member_id, email, phone, id_type, id_fingerprint)
  values ('00000000-0000-0000-0000-000000000002', 'two@test.invalid', '+255700000002', 'passport', '\x01')$$,
  'the fingerprint is unique per ID type');
select throws_ok($$insert into public.members (id, username) values ('00000000-0000-0000-0000-000000000003', 'ONE')$$,
  '23505', null, 'usernames are unique regardless of case');
select throws_ok($$insert into public.members (id, username) values ('00000000-0000-0000-0000-0000000000a1', 'admin_as_member')$$,
  '23505', null, 'a staff account cannot also be a member');
select throws_ok($$insert into public.staff (id, full_name, role) values ('00000000-0000-0000-0000-000000000001', 'X', 'admin')$$,
  '23505', null, 'a member account cannot also be staff');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated","otp_verified":true}', true);
set local role authenticated;
update public.members set status = 'approved' where id = '00000000-0000-0000-0000-000000000001';
reset role;
select is(
  (select row(actor_staff_id, action, target_type, target_id, before ->> 'status', after ->> 'status')::text
   from private.audit_log where target_id = '00000000-0000-0000-0000-000000000001'),
  row('00000000-0000-0000-0000-0000000000a1'::uuid, 'members.update', 'members', '00000000-0000-0000-0000-000000000001'::uuid, 'pending', 'approved')::text,
  'a status change is logged with the staff actor and before and after values');

update public.members set resubmissions_used = 1 where id = '00000000-0000-0000-0000-000000000002';
select is((select count(*)::int from private.audit_log where target_id = '00000000-0000-0000-0000-000000000002'), 0,
  'a members change that is not a status change is not logged');

insert into public.investor_flags (member_id, granted_by, route) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'invitation');
select is((select count(*)::int from private.audit_log where action = 'investor_flags.insert' and created_at = now()), 1, 'granting an investor flag is logged');
update public.platform_settings set value = '3' where key = 'featured_slot_limit';
select is((select count(*)::int from private.audit_log where action = 'platform_settings.update' and created_at = now()), 1, 'changing a platform setting is logged');
select is((select count(*)::int from private.audit_log where target_type = 'member_private'), 0, 'private data changes are never copied into the log');

select throws_ok($$update private.audit_log set action = 'tampered'$$, 'P0001', null, 'the database owner cannot update the audit log');
select throws_ok($$delete from private.audit_log$$, 'P0001', null, 'the database owner cannot delete from the audit log');
select throws_ok($$truncate private.audit_log$$, 'P0001', null, 'the database owner cannot truncate the audit log');
set local role service_role;
select throws_ok($$update private.audit_log set action = 'tampered'$$, '42501', null, 'Edge Functions cannot update the audit log');
select throws_ok($$delete from private.audit_log$$, '42501', null, 'Edge Functions cannot delete from the audit log');
reset role;
set local role authenticated;
select throws_ok($$delete from private.audit_log$$, '42501', null, 'signed-in users cannot touch the audit log');
reset role;
select is((select count(*)::int from private.audit_log where created_at = now()), 4, 'every audit row survived (status change, staff account, flag, setting)');

select * from finish();
rollback;
