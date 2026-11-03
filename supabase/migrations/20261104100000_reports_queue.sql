alter table public.reports add column subject_id uuid references public.members (id);
update public.reports r set subject_id = case
  when r.target_type = 'profile' then r.target_id
  when r.target_type = 'thread' then (select case when t.member_a = r.reporter_id then t.member_b else t.member_a end
                                      from public.message_threads t where t.id = r.target_id)
end;
alter table public.reports alter column subject_id set not null;
create index reports_case on public.reports (target_type, target_id, subject_id) where status in ('open', 'under_review');

create or replace function access.report(target_type text, target_id uuid, reason text, note text, screenshot_path text)
returns table (reference_no text, already_reported boolean)
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  existing text;
  created text;
  subject uuid;
begin
  if not (select access.is_member()) then
    raise exception 'not_allowed';
  end if;
  perform pg_advisory_xact_lock(hashtext('report:' || me::text));
  select r.reference_no into existing from public.reports r
  where r.reporter_id = me and r.target_type = report.target_type and r.target_id = report.target_id
    and r.status in ('open', 'under_review');
  if existing is not null then
    return query select existing, true;
    return;
  end if;
  if (select count(*) from public.reports r
      where r.reporter_id = me
        and r.created_at >= ((now() at time zone 'Africa/Dar_es_Salaam')::date::timestamp
                             at time zone 'Africa/Dar_es_Salaam')) >= 10 then
    raise exception 'daily_limit';
  end if;
  if report.target_type = 'profile' then
    if report.target_id = me
       or not exists (select 1 from public.members m where m.id = report.target_id and m.status = 'approved') then
      raise exception 'not_available';
    end if;
    subject := report.target_id;
  elsif report.target_type = 'thread' then
    select case when t.member_a = me then t.member_b else t.member_a end into subject
    from public.message_threads t
    where t.id = report.target_id and me in (t.member_a, t.member_b);
    if subject is null then
      raise exception 'not_available';
    end if;
  else
    raise exception 'not_available';
  end if;
  insert into public.reports (reporter_id, target_type, target_id, subject_id, reason, note, screenshot_path)
  values (me, report.target_type, report.target_id, subject, report.reason, nullif(btrim(report.note), ''),
          report.screenshot_path)
  returning reports.reference_no into created;
  if report.target_type = 'thread' then
    update public.message_threads set status = 'reported', reported_at = now()
    where id = report.target_id and status <> 'reported';
  end if;
  return query select created, false;
end;
$$;

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id),
  subject_id uuid not null references public.members (id),
  target_type text check (target_type in ('profile', 'opportunity', 'idea', 'thread', 'plan')),
  target_id uuid,
  action text not null check (action in ('no_action', 'restore', 'edit_request', 'remove', 'warn', 'suspend_posting',
                                         'suspend_account', 'lift_posting_pause', 'reinstate_account')),
  note text not null check (btrim(note) <> '' and char_length(note) <= 2000),
  member_message text check (char_length(member_message) <= 500),
  report_ids uuid[] not null default '{}',
  automatic boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default now()
);
create index moderation_actions_subject on public.moderation_actions (subject_id, created_at);
create trigger set_updated_at before update on public.moderation_actions
  for each row execute function private.set_updated_at();

alter table public.moderation_actions enable row level security;
revoke all on public.moderation_actions from anon, authenticated;
create policy "base rule" on public.moderation_actions as restrictive for all to authenticated
  using ((select access.is_member()) or (select access.is_staff()))
  with check ((select access.is_member()) or (select access.is_staff()));
grant select on public.moderation_actions to authenticated;
create policy "staff read" on public.moderation_actions for select to authenticated
  using ((select access.is_staff()));

create trigger audit after insert or update or delete on public.moderation_actions
  for each row execute function private.log_change();
create trigger audit after update on public.reports
  for each row execute function private.log_change();
create trigger audit_posting after update of posting_suspended_until on public.members
  for each row when (old.posting_suspended_until is distinct from new.posting_suspended_until)
  execute function private.log_change();

create function access.upheld_decisions(member uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.moderation_actions a
  where a.subject_id = member and not a.automatic
    and a.action in ('warn', 'suspend_posting', 'suspend_account')
    and a.created_at > now() - interval '12 months' and (select access.is_staff())
    and a.created_at > coalesce((select max(l.created_at) from public.moderation_actions l
                                 where l.subject_id = member
                                   and l.action in ('lift_posting_pause', 'reinstate_account')), '-infinity');
$$;

create function access.report_queue()
returns table (report_id uuid, reference_no text, target_type text, target_id uuid, subject_id uuid,
               subject_name text, reasons text[], report_count int, first_reported_at timestamptz, status text)
language sql stable security definer set search_path = '' as $$
  select (array_agg(r.id order by r.created_at))[1],
         (array_agg(r.reference_no order by r.created_at))[1],
         r.target_type, r.target_id, r.subject_id,
         coalesce(p.full_name, m.username::text),
         array_agg(distinct r.reason),
         count(*)::int,
         min(r.created_at),
         case when bool_or(r.status = 'under_review') then 'under_review' else 'open' end
  from public.reports r
  join public.members m on m.id = r.subject_id
  left join public.profiles p on p.member_id = r.subject_id
  where (select access.is_staff()) and r.status in ('open', 'under_review')
  group by r.target_type, r.target_id, r.subject_id, p.full_name, m.username
  order by min(r.created_at);
$$;

create function access.start_review(report uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare picked public.reports;
begin
  if not (select access.is_staff()) then
    raise exception 'not_allowed';
  end if;
  select * into picked from public.reports where id = report;
  if not found then
    raise exception 'not_found';
  end if;
  update public.reports r set status = 'under_review'
  where r.status = 'open' and r.target_type = picked.target_type and r.target_id = picked.target_id
    and r.subject_id = picked.subject_id;
end;
$$;

create function private.moderate(actor uuid, subject uuid, action text, note text, member_message text,
                                 target_type text default null, target_id uuid default null,
                                 report_ids uuid[] default '{}', automatic boolean default false)
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  insert into public.moderation_actions (staff_id, subject_id, target_type, target_id, action, note, member_message,
                                         report_ids, automatic)
  values (actor, subject, moderate.target_type, moderate.target_id, moderate.action, moderate.note,
          moderate.member_message, moderate.report_ids, moderate.automatic);
  if moderate.action = 'warn' then
    perform private.notify(subject, 'X3', jsonb_build_object('reason', moderate.member_message));
  elsif moderate.action = 'suspend_posting' then
    update public.members set posting_suspended_until = 'infinity'
    where id = subject and posting_suspended_until is distinct from 'infinity';
    if found then
      perform private.notify(subject, 'X2', jsonb_build_object('reason', moderate.member_message));
    end if;
  elsif moderate.action = 'suspend_account' then
    update public.members set status = 'suspended' where id = subject and status = 'approved';
    if found then
      perform private.notify(subject, 'X1', jsonb_build_object('reason', moderate.member_message));
    end if;
  end if;
end;
$$;

create function access.decide_report(report uuid, action text, note text, member_message text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  picked public.reports;
  closed uuid[];
  clean_note text := nullif(btrim(coalesce(decide_report.note, '')), '');
  message text := nullif(btrim(coalesce(decide_report.member_message, '')), '');
  upheld int;
  subject_member public.members;
  r record;
begin
  if not (select access.is_staff()) then
    raise exception 'not_allowed';
  end if;
  if decide_report.action not in ('no_action', 'warn', 'suspend_posting', 'suspend_account') then
    raise exception 'invalid_action';
  end if;
  if clean_note is null then
    raise exception 'note_required';
  end if;
  if decide_report.action <> 'no_action' and message is null then
    raise exception 'message_required';
  end if;
  select * into picked from public.reports where id = report;
  if not found then
    raise exception 'not_found';
  end if;
  if picked.status not in ('open', 'under_review') then
    raise exception 'already_decided';
  end if;
  perform pg_advisory_xact_lock(hashtext('moderate:' || picked.subject_id::text));
  select array_agg(x.id) into closed from (
    select rr.id from public.reports rr
    where rr.target_type = picked.target_type and rr.target_id = picked.target_id
      and rr.subject_id = picked.subject_id and rr.status in ('open', 'under_review')
    order by rr.created_at for update) x;
  if closed is null then
    raise exception 'already_decided';
  end if;

  update public.reports rr
  set status = case when decide_report.action = 'no_action' then 'no_action' else 'action_taken' end,
      decided_by = me, decided_at = now()
  where rr.id = any (closed);
  for r in select rr.reporter_id, rr.reference_no from public.reports rr where rr.id = any (closed) loop
    perform private.notify(r.reporter_id, case when decide_report.action = 'no_action' then 'R2' else 'R1' end,
                           jsonb_build_object('ref', r.reference_no));
  end loop;

  perform private.moderate(me, picked.subject_id, decide_report.action, clean_note,
                           case when decide_report.action <> 'no_action' then message end,
                           picked.target_type, picked.target_id, closed);
  if decide_report.action = 'no_action' then
    return;
  end if;

  upheld := access.upheld_decisions(picked.subject_id);
  select * into subject_member from public.members where id = picked.subject_id;
  if upheld >= 3 and subject_member.status = 'approved' then
    perform private.moderate(me, picked.subject_id, 'suspend_account',
                             'Automatic: ' || upheld || ' upheld decisions in 12 months', message, automatic => true);
  elsif upheld = 2 and subject_member.status = 'approved'
        and subject_member.posting_suspended_until is distinct from 'infinity' then
    perform private.moderate(me, picked.subject_id, 'suspend_posting',
                             'Automatic: 2 upheld decisions in 12 months', message, automatic => true);
  end if;
end;
$$;

create function access.lift_posting_pause(member uuid, note text) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not (select access.is_staff()) then
    raise exception 'not_allowed';
  end if;
  if nullif(btrim(coalesce(note, '')), '') is null then
    raise exception 'note_required';
  end if;
  update public.members set posting_suspended_until = null
  where id = member and posting_suspended_until is not null;
  if not found then
    raise exception 'not_paused';
  end if;
  perform private.moderate(auth.uid(), member, 'lift_posting_pause', btrim(note), null);
end;
$$;

create function access.reinstate_account(member uuid, note text) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not (select access.is_staff()) then
    raise exception 'not_allowed';
  end if;
  if nullif(btrim(coalesce(note, '')), '') is null then
    raise exception 'note_required';
  end if;
  update public.members set status = 'approved' where id = member and status = 'suspended';
  if not found then
    raise exception 'not_suspended';
  end if;
  perform private.moderate(auth.uid(), member, 'reinstate_account', btrim(note), null);
end;
$$;

revoke all on function private.moderate(uuid, uuid, text, text, text, text, uuid, uuid[], boolean)
  from public, anon, authenticated;
revoke all on function access.upheld_decisions(uuid), access.report_queue(), access.start_review(uuid),
  access.decide_report(uuid, text, text, text), access.lift_posting_pause(uuid, text),
  access.reinstate_account(uuid, text) from public, anon;
grant execute on function access.upheld_decisions(uuid), access.report_queue(), access.start_review(uuid),
  access.decide_report(uuid, text, text, text), access.lift_posting_pause(uuid, text),
  access.reinstate_account(uuid, text) to authenticated;

create function public.report_queue()
returns table (report_id uuid, reference_no text, target_type text, target_id uuid, subject_id uuid,
               subject_name text, reasons text[], report_count int, first_reported_at timestamptz, status text)
language sql stable security invoker set search_path = '' as $$
  select * from access.report_queue();
$$;
create function public.start_review(report uuid) returns void
language sql volatile security invoker set search_path = '' as $$
  select access.start_review(report);
$$;
create function public.decide_report(report uuid, action text, note text, member_message text default null)
returns void
language sql volatile security invoker set search_path = '' as $$
  select access.decide_report(report, action, note, member_message);
$$;
create function public.lift_posting_pause(member uuid, note text) returns void
language sql volatile security invoker set search_path = '' as $$
  select access.lift_posting_pause(member, note);
$$;
create function public.reinstate_account(member uuid, note text) returns void
language sql volatile security invoker set search_path = '' as $$
  select access.reinstate_account(member, note);
$$;
create function public.upheld_decisions(member uuid) returns int
language sql stable security invoker set search_path = '' as $$
  select access.upheld_decisions(member);
$$;
revoke all on function public.report_queue(), public.start_review(uuid), public.decide_report(uuid, text, text, text),
  public.lift_posting_pause(uuid, text), public.reinstate_account(uuid, text), public.upheld_decisions(uuid)
  from public, anon;
grant execute on function public.report_queue(), public.start_review(uuid), public.decide_report(uuid, text, text, text),
  public.lift_posting_pause(uuid, text), public.reinstate_account(uuid, text), public.upheld_decisions(uuid)
  to authenticated;
