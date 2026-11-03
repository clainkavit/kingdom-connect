begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(20);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000011' || k)::uuid, 'dd' || k || '@test.invalid'
from unnest(array['01', '02', 'a1']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000001101', 'dd_leaver', 'approved'),
  ('00000000-0000-0000-0000-000000001102', 'dd_friend', 'approved');
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000011a1', 'Data Staff', 'admin', true);
insert into public.profiles (member_id, full_name, photo_path) values
  ('00000000-0000-0000-0000-000000001101', 'Leaving Member', '00000000-0000-0000-0000-000000001101/photo'),
  ('00000000-0000-0000-0000-000000001102', 'Staying Friend', null);
insert into public.member_private (member_id, phone, email) values
  ('00000000-0000-0000-0000-000000001101', '+255712000011', 'dd01@test.invalid');
insert into public.verification_requests (id, member_id, level, status)
  values ('00000000-0000-0000-0011-000000000001', '00000000-0000-0000-0000-000000001101', 1, 'approved');
insert into public.verification_documents (request_id, kind, storage_path)
  values ('00000000-0000-0000-0011-000000000001', 'face_photo', '00000000-0000-0000-0000-000000001101/face');
insert into public.connections (member_a, member_b)
  values ('00000000-0000-0000-0000-000000001101', '00000000-0000-0000-0000-000000001102');
insert into public.message_threads (id, member_a, member_b) values
  ('00000000-0000-0000-0011-000000000002', '00000000-0000-0000-0000-000000001101', '00000000-0000-0000-0000-000000001102');
insert into public.messages (id, thread_id, sender_id, body) values
  ('00000000-0000-0000-0011-000000000003', '00000000-0000-0000-0011-000000000002',
   '00000000-0000-0000-0000-000000001101', 'Here is my CV'),
  ('00000000-0000-0000-0011-000000000004', '00000000-0000-0000-0011-000000000002',
   '00000000-0000-0000-0000-000000001102', 'Thanks');
insert into public.message_attachments (message_id, storage_path, file_name, mime, size)
  values ('00000000-0000-0000-0011-000000000003', '00000000-0000-0000-0011-000000000002/cv.pdf', 'cv.pdf',
          'application/pdf', 100);
insert into public.notifications (member_id, kind) values ('00000000-0000-0000-0000-000000001101', 'C2');
insert into public.investor_flags (member_id, granted_by, route)
  values ('00000000-0000-0000-0000-000000001101', '00000000-0000-0000-0000-0000000011a1', 'invitation');
insert into storage.objects (bucket_id, name)
  values ('identity-documents', '00000000-0000-0000-0000-000000001101/id');

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000011' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;

set local role authenticated;
select pg_temp.login('01');
select is((select my_data_export() -> 'profile' ->> 'full_name'), 'Leaving Member', 'the export holds the profile');
select is((select my_data_export() -> 'private' ->> 'phone'), '+255712000011', 'and the private details');
select is((select jsonb_array_length(my_data_export() -> 'messages_sent')), 1, 'and the messages they sent');
select ok((select not (my_data_export() -> 'private' ? 'id_encrypted') and not (my_data_export() -> 'private' ? 'id_fingerprint')),
  'but not the encrypted ID number or its fingerprint');
select pg_temp.login('a1');
select is((select my_data_export()), null, 'staff get no export of their own');
set local role anon;
select throws_ok($$select public.my_data_export()$$, '42501', null, 'nor does a visitor');

reset role;
select is((select array_agg(bucket || ':' || path order by bucket) from private.member_file_paths('00000000-0000-0000-0000-000000001101')),
  array['avatars:00000000-0000-0000-0000-000000001101/photo',
        'identity-documents:00000000-0000-0000-0000-000000001101/face',
        'identity-documents:00000000-0000-0000-0000-000000001101/id',
        'message-files:00000000-0000-0000-0011-000000000002/cv.pdf'],
  'the files to remove: avatar, ID documents, an unsubmitted ID photo and the attachments they sent');
set local role authenticated;
select pg_temp.login('01');
select throws_ok($$select private.delete_member_data('00000000-0000-0000-0000-000000001101')$$, '42501', null,
  'a member cannot call the deletion directly');
select throws_ok($$select * from private.member_file_paths('00000000-0000-0000-0000-000000001101')$$, '42501', null,
  'nor list the files');
reset role;
select is(private.delete_member_data('00000000-0000-0000-0000-000000001101'), 'ok', 'the member''s data is deleted');

set local role authenticated;
select pg_temp.login('a1');
select is((select count(*)::int from public.profiles where member_id = '00000000-0000-0000-0000-000000001101')
          + (select count(*)::int from public.member_private where member_id = '00000000-0000-0000-0000-000000001101')
          + (select count(*)::int from public.verification_documents d join public.verification_requests v
             on v.id = d.request_id where v.member_id = '00000000-0000-0000-0000-000000001101')
          + (select count(*)::int from public.connections where '00000000-0000-0000-0000-000000001101' in (member_a, member_b)),
  0, 'after deletion not even staff can read the member''s private data');
select is((select row(status, username::text)::text from public.members where id = '00000000-0000-0000-0000-000000001101'),
  '(deleted,deleted_00000000000000000000000000001101)', 'the member row stays as a Deleted member placeholder');

reset role;
select is((select count(*)::int from public.notifications where member_id = '00000000-0000-0000-0000-000000001101')
          + (select count(*)::int from public.message_attachments a join public.messages m on m.id = a.message_id
             where m.sender_id = '00000000-0000-0000-0000-000000001101'), 0,
  'their notifications and sent attachments are gone');
select is((select count(*)::int from public.investor_flags where member_id = '00000000-0000-0000-0000-000000001101'), 0,
  'and their investor flag');
select ok(exists (select 1 from private.audit_log where action = 'member.data_deleted'
                  and target_id = '00000000-0000-0000-0000-000000001101'), 'the deletion is in the audit log');
select is(private.delete_member_data('00000000-0000-0000-0000-000000001101'), 'already_deleted', 'deleting twice does nothing');

set local role authenticated;
select pg_temp.login('02');
select is((select count(*)::int from public.messages where thread_id = '00000000-0000-0000-0011-000000000002'), 2,
  'the other member''s thread stays readable');
select is((select count(*)::int from public.profiles where member_id = '00000000-0000-0000-0000-000000001101'), 0,
  'with no profile left for the deleted member');
select is((select array_agg(d) from public.deleted_members(array['00000000-0000-0000-0000-000000001101'::uuid,
                                                                   '00000000-0000-0000-0000-000000001102'::uuid]) d),
  array['00000000-0000-0000-0000-000000001101'::uuid], 'the app can tell a deleted member from a hidden one');
select pg_temp.login('01');
select is((select my_data_export()), null, 'a deleted member has nothing to export');

select * from finish();
rollback;
