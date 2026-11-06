create or replace function private.member_file_paths(member uuid) returns table (bucket text, path text)
language sql stable security definer set search_path = '' as $$
  select 'avatars', p.photo_path from public.profiles p where p.member_id = member and p.photo_path is not null
  union
  select 'identity-documents', d.storage_path from public.verification_documents d
  join public.verification_requests v on v.id = d.request_id
  where v.member_id = member and d.kind in ('face_photo', 'id_photo')
  union
  select 'report-files', r.screenshot_path from public.reports r
  where r.reporter_id = member and r.screenshot_path is not null
  union
  select 'message-files', a.storage_path from public.message_attachments a
  join public.messages ms on ms.id = a.message_id where ms.sender_id = member
  union
  select o.bucket_id, o.name from storage.objects o
  where o.bucket_id in ('avatars', 'identity-documents', 'report-files', 'business-documents') and o.name like member::text || '/%';
$$;

create or replace function private.delete_member_data(member uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare current_status text;
begin
  select status into current_status from public.members where id = member for update;
  if current_status is null then
    return 'not_found';
  end if;
  if current_status = 'deleted' then
    return 'already_deleted';
  end if;

  delete from public.message_attachments a using public.messages ms
    where ms.id = a.message_id and ms.sender_id = member;
  update public.reports set screenshot_path = null where reporter_id = member and screenshot_path is not null;
  delete from public.verification_documents d using public.verification_requests v
    where v.id = d.request_id and v.member_id = member;
  update public.verification_requests set business_id = null where member_id = member and business_id is not null;
  delete from public.businesses where member_id = member;
  delete from public.profiles where member_id = member;
  delete from public.member_private where member_id = member;
  delete from public.investor_flags where member_id = member;
  delete from public.registration_drafts where member_id = member;
  delete from public.connections where member in (member_a, member_b);
  delete from public.connection_requests where member in (requester_id, receiver_id);
  delete from public.blocks where blocker_id = member;
  delete from public.thread_reads where member_id = member;
  delete from public.notifications where member_id = member;
  delete from public.notification_preferences where member_id = member;
  delete from public.push_tokens where member_id = member;
  delete from private.email_outbox where member_id = member;
  delete from private.login_otps where user_id = member;
  delete from private.mfa_sessions where user_id = member;
  delete from private.login_attempts
  where user_id = member
     or identifier in (select lower(u.email) from auth.users u where u.id = member)
     or identifier in (select lower(m.username::text) from public.members m where m.id = member);

  update public.members
  set status = 'deleted', username = 'deleted_' || replace(member::text, '-', ''), category = null,
      posting_suspended_until = null
  where id = member;

  insert into private.audit_log (actor_member_id, action, target_type, target_id, after)
  values (member, 'member.data_deleted', 'members', member, jsonb_build_object('status', 'deleted'));
  return 'ok';
end;
$$;
