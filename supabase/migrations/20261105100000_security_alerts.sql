alter table private.email_outbox alter column member_id drop not null;
alter table private.email_outbox add constraint outbox_has_recipient check (member_id is not null or to_email is not null);

create table public.security_alerts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('failed_logins', 'lockouts', 'message_volume', 'duplicate_id')),
  summary text not null,
  member_id uuid references public.members (id),
  source_id uuid,
  acknowledged_by uuid references public.staff (id),
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, source_id)
);
create table private.login_events (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('failure', 'lockout')),
  identifier text not null,
  created_at timestamptz not null default now()
);
create index login_events_recent on private.login_events (kind, created_at);
revoke all on private.login_events from public, anon, authenticated;

create function private.record_login_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.failed_count > coalesce(case when tg_op = 'UPDATE' then old.failed_count end, 0) then
    insert into private.login_events (kind, identifier) values ('failure', new.identifier);
  end if;
  if new.locked_until > now()
     and (tg_op = 'INSERT' or old.locked_until is null or old.locked_until <= now()) then
    insert into private.login_events (kind, identifier) values ('lockout', new.identifier);
  end if;
  return null;
end;
$$;
create trigger record_login_event after insert or update on private.login_attempts
  for each row execute function private.record_login_event();

create index messages_recent on public.messages (created_at);

create index security_alerts_open on public.security_alerts (created_at desc) where acknowledged_at is null;
create trigger set_updated_at before update on public.security_alerts
  for each row execute function private.set_updated_at();
create trigger audit after update on public.security_alerts
  for each row execute function private.log_change();

alter table public.security_alerts enable row level security;
revoke all on public.security_alerts from anon, authenticated;
create policy "base rule" on public.security_alerts as restrictive for all to authenticated
  using ((select access.is_member()) or (select access.is_staff()))
  with check ((select access.is_member()) or (select access.is_staff()));
grant select on public.security_alerts to authenticated;
create policy "staff read" on public.security_alerts for select to authenticated using ((select access.is_staff()));

create function private.raise_security_alert(kind text, summary text, member uuid default null,
                                             source uuid default null, quiet_for interval default null)
returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare created uuid;
begin
  if quiet_for is not null and exists (
       select 1 from public.security_alerts a
       where a.kind = raise_security_alert.kind and a.member_id is not distinct from member
         and a.created_at > now() - quiet_for) then
    return false;
  end if;
  insert into public.security_alerts (kind, summary, member_id, source_id)
  values (raise_security_alert.kind, raise_security_alert.summary, member, source)
  on conflict on constraint security_alerts_kind_source_id_key do nothing
  returning id into created;
  if created is null then
    return false;
  end if;
  perform private.queue_email(null, 'Y1', jsonb_build_object('alert', raise_security_alert.summary), u.email)
  from public.staff s join auth.users u on u.id = s.id
  where s.role = 'super_admin' and s.active;
  return true;
end;
$$;

create function private.check_security_alerts() returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  raised int := 0;
  failures int;
  lockouts int;
  r record;
begin
  select count(*) into failures from private.login_events e
  where e.kind = 'failure' and e.created_at > now() - interval '10 minutes';
  if failures >= 20
     and private.raise_security_alert('failed_logins', failures || ' failed sign-ins in the last 10 minutes',
                                      quiet_for => interval '10 minutes') then
    raised := raised + 1;
  end if;

  select count(*) into lockouts from private.login_events e
  where e.kind = 'lockout' and e.created_at > now() - interval '1 hour';
  if lockouts >= 3
     and private.raise_security_alert('lockouts', lockouts || ' accounts locked in the last hour',
                                      quiet_for => interval '1 hour') then
    raised := raised + 1;
  end if;

  for r in select ms.sender_id, count(*) as sent from public.messages ms
           where ms.created_at > now() - interval '1 hour' group by ms.sender_id having count(*) > 100 loop
    if private.raise_security_alert('message_volume', r.sent || ' messages sent by one member in the last hour',
                                    r.sender_id, quiet_for => interval '1 hour') then
      raised := raised + 1;
    end if;
  end loop;

  for r in select l.id, l.target_id from private.audit_log l
           where l.action = 'registration.duplicate_id' and l.created_at > now() - interval '1 day' loop
    if private.raise_security_alert('duplicate_id', 'An ID already registered was used again at sign-up',
                                    r.target_id, r.id) then
      raised := raised + 1;
    end if;
  end loop;
  return raised;
end;
$$;

create function access.acknowledge_security_alert(alert uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not (select access.is_staff()) then
    raise exception 'not_allowed';
  end if;
  update public.security_alerts set acknowledged_by = auth.uid(), acknowledged_at = now()
  where id = alert and acknowledged_at is null;
end;
$$;

revoke all on function private.record_login_event(), private.raise_security_alert(text, text, uuid, uuid, interval),
  private.check_security_alerts()
  from public, anon, authenticated;
revoke all on function access.acknowledge_security_alert(uuid) from public, anon;
grant execute on function access.acknowledge_security_alert(uuid) to authenticated;
create function public.acknowledge_security_alert(alert uuid) returns void
language sql volatile security invoker set search_path = '' as $$
  select access.acknowledge_security_alert(alert);
$$;
revoke all on function public.acknowledge_security_alert(uuid) from public, anon;
grant execute on function public.acknowledge_security_alert(uuid) to authenticated;

select cron.schedule('check-security-alerts', '*/5 * * * *', $job$ select private.check_security_alerts() $job$);
select cron.schedule('prune-login-events', '0 3 * * *',
  $job$ delete from private.login_events where created_at < now() - interval '7 days' $job$);
