create function private.application_status(member uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  account public.members;
  latest public.verification_requests;
  ahead int;
  decided int;
  working_days_in_window constant numeric := 10;
begin
  select * into account from public.members where id = member;
  if not found or account.status not in ('pending', 'rejected', 'approved') then
    return null;
  end if;
  if account.status = 'approved' then
    return jsonb_build_object('state', 'approved');
  end if;

  select * into latest from public.verification_requests
  where member_id = member and level = 1
  order by submitted_at desc limit 1;

  if account.status = 'rejected' then
    return jsonb_build_object(
      'state', case when account.resubmissions_used > 0 then 'rejected_final' else 'rejected' end,
      'reason', latest.reason);
  end if;
  if latest.status is distinct from 'pending' then
    return jsonb_build_object('state', 'drafting');
  end if;

  select count(*) into ahead from public.verification_requests
  where level = 1 and status = 'pending' and submitted_at <= latest.submitted_at;
  select count(*) into decided from public.verification_requests
  where level = 1 and status in ('approved', 'rejected') and decided_at > now() - interval '14 days';
  return jsonb_build_object(
    'state', 'under_review',
    'expectedWorkingDays',
      case when decided = 0 then null
           else greatest(1, ceil(ahead / (decided / working_days_in_window)))::int end);
end $$;

create function private.reopen_draft(member uuid) returns void
language sql security definer set search_path = '' as $$
  update public.members set status = 'pending' where id = member;
  update public.registration_drafts set submitted_at = null, step = 6 where member_id = member;
$$;

create function private.start_resubmission(member uuid, ip inet default null) returns text
language plpgsql security definer set search_path = '' as $$
declare account public.members;
begin
  select * into account from public.members where id = member for update;
  if account.status is distinct from 'rejected' then
    return 'not_rejected';
  end if;
  if account.resubmissions_used > 0 then
    return 'final';
  end if;
  update public.members set resubmissions_used = resubmissions_used + 1 where id = member;
  perform private.reopen_draft(member);
  insert into private.audit_log (actor_member_id, action, target_type, target_id, ip_address)
  values (member, 'application.resubmission_started', 'members', member, ip);
  return 'ok';
end $$;

create function private.reopen_application(actor uuid, request uuid, note text, ip inet default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  current public.verification_requests;
  clean_note text := nullif(btrim(coalesce(note, '')), '');
begin
  if not private.active_staff(actor) then
    return 'not_staff';
  end if;
  if clean_note is null then
    return 'note_required';
  end if;
  select * into current from public.verification_requests where id = request for update;
  if not found or current.level <> 1 then
    return 'not_found';
  end if;
  if current.status <> 'rejected'
     or not exists (select 1 from public.members
                    where id = current.member_id and status = 'rejected' and resubmissions_used > 0)
     or exists (select 1 from public.verification_requests
                where member_id = current.member_id and level = 1 and submitted_at > current.submitted_at) then
    return 'not_final';
  end if;

  perform 1 from public.members where id = current.member_id for update;
  perform private.reopen_draft(current.member_id);
  insert into private.audit_log (actor_staff_id, action, target_type, target_id, after, ip_address)
  values (actor, 'application.reopened', 'verification_requests', request,
          jsonb_build_object('member_id', current.member_id, 'note', clean_note), ip);
  perform private.notify(current.member_id, 'A6', '{}');
  return 'ok';
end $$;

revoke all on function private.application_status(uuid), private.reopen_draft(uuid),
  private.start_resubmission(uuid, inet), private.reopen_application(uuid, uuid, text, inet)
  from public, anon, authenticated;
