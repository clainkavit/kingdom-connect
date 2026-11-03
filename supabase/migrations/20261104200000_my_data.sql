create function access.my_data_export() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when (select access.is_approved_member()) then jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object('username', m.username, 'status', m.status, 'category', m.category,
                                          'joined_at', m.created_at, 'approved_at', m.approved_at)
                from public.members m where m.id = me.id),
    'profile', (select to_jsonb(p) - 'member_id' from public.profiles p where p.member_id = me.id),
    'skills', (select coalesce(jsonb_agg(s.name order by s.name), '[]') from public.profile_skills ps
               join public.skills s on s.id = ps.skill_id where ps.member_id = me.id),
    'private', (select jsonb_build_object('phone', x.phone, 'email', x.email, 'address', x.address,
                                          'id_type', x.id_type, 'id_expires_on', x.id_expires_on,
                                          'share_phone', x.share_phone, 'share_email', x.share_email,
                                          'share_address', x.share_address, 'language', x.language)
                from public.member_private x where x.member_id = me.id),
    'connections', (select coalesce(jsonb_agg(jsonb_build_object('name', p.full_name, 'since', c.created_at)), '[]')
                    from public.connections c
                    left join public.profiles p
                      on p.member_id = case when c.member_a = me.id then c.member_b else c.member_a end
                    where me.id in (c.member_a, c.member_b)),
    'connection_requests_sent', (select coalesce(jsonb_agg(jsonb_build_object(
                                   'to', p.full_name, 'note', r.note, 'sent_at', r.created_at)), '[]')
                                 from public.connection_requests r
                                 left join public.profiles p on p.member_id = r.receiver_id
                                 where r.requester_id = me.id),
    'blocked', (select coalesce(jsonb_agg(jsonb_build_object('name', p.full_name, 'since', b.created_at)), '[]')
                from public.blocks b left join public.profiles p on p.member_id = b.blocked_id
                where b.blocker_id = me.id),
    'messages_sent', (select coalesce(jsonb_agg(jsonb_build_object(
                        'to', p.full_name, 'body', ms.body, 'sent_at', ms.created_at,
                        'deleted', ms.deleted_at is not null) order by ms.created_at), '[]')
                      from public.messages ms
                      join public.message_threads t on t.id = ms.thread_id
                      left join public.profiles p
                        on p.member_id = case when t.member_a = me.id then t.member_b else t.member_a end
                      where ms.sender_id = me.id),
    'notifications', (select coalesce(jsonb_agg(jsonb_build_object('kind', n.kind, 'at', n.created_at,
                                                                  'read_at', n.read_at) order by n.created_at), '[]')
                      from public.notifications n where n.member_id = me.id),
    'reports_filed', (select coalesce(jsonb_agg(jsonb_build_object('reference', r.reference_no, 'outcome', r.outcome,
                                                                  'reported_at', r.reported_at)), '[]')
                      from access.my_reports() r),
    'legal_acceptances', (select coalesce(jsonb_agg(jsonb_build_object('text', t.kind, 'version', t.version,
                                                                      'accepted_at', a.accepted_at)), '[]')
                          from public.legal_acceptances a join public.legal_texts t on t.id = a.legal_text_id
                          where a.member_id = me.id),
    'verification', (select coalesce(jsonb_agg(jsonb_build_object('level', v.level, 'status', v.status,
                                                                 'submitted_at', v.submitted_at,
                                                                 'decided_at', v.decided_at)), '[]')
                     from public.verification_requests v where v.member_id = me.id)
  ) end
  from (select auth.uid() as id) me;
$$;
revoke all on function access.my_data_export() from public, anon;
grant execute on function access.my_data_export() to authenticated;

create function public.my_data_export() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select access.my_data_export();
$$;
revoke all on function public.my_data_export() from public, anon;
grant execute on function public.my_data_export() to authenticated;

create function private.member_file_paths(member uuid) returns table (bucket text, path text)
language sql stable security definer set search_path = '' as $$
  select 'avatars', p.photo_path from public.profiles p where p.member_id = member and p.photo_path is not null
  union
  select 'identity-documents', d.storage_path from public.verification_documents d
  join public.verification_requests v on v.id = d.request_id where v.member_id = member
  union
  select 'report-files', r.screenshot_path from public.reports r
  where r.reporter_id = member and r.screenshot_path is not null
  union
  select 'message-files', a.storage_path from public.message_attachments a
  join public.messages ms on ms.id = a.message_id where ms.sender_id = member
  union
  select o.bucket_id, o.name from storage.objects o
  where o.bucket_id in ('avatars', 'identity-documents', 'report-files') and o.name like member::text || '/%';
$$;

create function private.delete_member_data(member uuid) returns text
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

create function private.log_unfinished_deletion(member uuid, step text, detail jsonb) returns void
language sql volatile security definer set search_path = '' as $$
  insert into private.audit_log (actor_member_id, action, target_type, target_id, after)
  values (member, 'member.deletion_unfinished', 'members', member, jsonb_build_object('step', step) || detail);
$$;

revoke all on function private.member_file_paths(uuid), private.delete_member_data(uuid),
  private.log_unfinished_deletion(uuid, text, jsonb) from public, anon, authenticated;

create function access.deleted_members(ids uuid[]) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.id from public.members m
  where m.id = any (ids) and m.status = 'deleted' and (select access.is_member());
$$;
revoke all on function access.deleted_members(uuid[]) from public, anon;
grant execute on function access.deleted_members(uuid[]) to authenticated;
create function public.deleted_members(ids uuid[]) returns setof uuid
language sql stable security invoker set search_path = '' as $$
  select * from access.deleted_members(ids);
$$;
revoke all on function public.deleted_members(uuid[]) from public, anon;
grant execute on function public.deleted_members(uuid[]) to authenticated;

create or replace function access.report_queue()
returns table (report_id uuid, reference_no text, target_type text, target_id uuid, subject_id uuid,
               subject_name text, reasons text[], report_count int, first_reported_at timestamptz, status text)
language sql stable security definer set search_path = '' as $$
  select (array_agg(r.id order by r.created_at))[1],
         (array_agg(r.reference_no order by r.created_at))[1],
         r.target_type, r.target_id, r.subject_id,
         case when m.status = 'deleted' then '' else coalesce(p.full_name, m.username::text) end,
         array_agg(distinct r.reason),
         count(*)::int,
         min(r.created_at),
         case when bool_or(r.status = 'under_review') then 'under_review' else 'open' end
  from public.reports r
  join public.members m on m.id = r.subject_id
  left join public.profiles p on p.member_id = r.subject_id
  where (select access.is_staff()) and r.status in ('open', 'under_review')
  group by r.target_type, r.target_id, r.subject_id, p.full_name, m.username, m.status
  order by min(r.created_at);
$$;


create or replace function access.audit_log(actor_staff uuid default null, actor_username text default null,
                                 system_only boolean default false, action_name text default null,
                                 from_date date default null, to_date date default null,
                                 before_at timestamptz default null, before_id uuid default null,
                                 page_size int default 50)
returns table (id uuid, created_at timestamptz, actor_kind text, actor_id uuid, actor_name text, action text, target_type text,
               target_id uuid, before jsonb, after jsonb, ip_address text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select access.is_super_admin()) then
    raise exception 'not_allowed';
  end if;
  return query
  select l.id, l.created_at,
         case when l.actor_staff_id is not null then 'staff'
              when l.actor_member_id is not null then 'member'
              else 'system' end,
         coalesce(l.actor_staff_id, l.actor_member_id),
         coalesce(s.full_name, case when m.status = 'deleted' then '' else m.username::text end, ''),
         l.action, l.target_type, l.target_id, l.before, l.after, host(l.ip_address)
  from private.audit_log l
  left join public.staff s on s.id = l.actor_staff_id
  left join public.members m on m.id = l.actor_member_id
  where (audit_log.actor_staff is null or l.actor_staff_id = audit_log.actor_staff)
    and (audit_log.actor_username is null or lower(m.username::text) = lower(audit_log.actor_username))
    and (not audit_log.system_only or (l.actor_staff_id is null and l.actor_member_id is null))
    and (audit_log.action_name is null or l.action = audit_log.action_name)
    and (audit_log.from_date is null
         or l.created_at >= (audit_log.from_date::timestamp at time zone 'Africa/Dar_es_Salaam'))
    and (audit_log.to_date is null
         or l.created_at < ((audit_log.to_date + 1)::timestamp at time zone 'Africa/Dar_es_Salaam'))
    and (audit_log.before_at is null or (l.created_at, l.id) < (audit_log.before_at,
                                                                coalesce(audit_log.before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff')))
  order by l.created_at desc, l.id desc
  limit least(greatest(audit_log.page_size, 1), 200);
end;
$$;


