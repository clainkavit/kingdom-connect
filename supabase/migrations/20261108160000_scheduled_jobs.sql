-- D04: the timed jobs. Each job now takes the moment it runs at, defaulting to now(), so tests can use a fixed
-- clock, and returns how many things it did. Every job is safe to run twice: reminders are logged before they
-- are sent (licence and event reminders) or marked on the row (plan reminders), and lapses only move rows that
-- are still pending. A new job clears temporary sign-in lockouts once they have ended. The weekly Scan digest
-- arrives with O09. The schedules stay as they are: cron calls each job with no argument.
--
--   check-licence-expiry       daily 21:05 UTC (00:05 in Tanzania)   B3 at 30 and 7 days, B4 and expiry
--   send-event-reminders       every 5 minutes                       T1 a day before, T2 an hour before
--   milestone-plan-deadlines   every 15 minutes                      P2 on day 7, P8 and Lapsed on day 14
--   clear-sign-in-lockouts     every 10 minutes                      lockouts whose time is up

drop function private.check_licence_expiry();
drop function private.send_event_reminders();
drop function private.run_plan_deadlines();

create function private.check_licence_expiry(run_at timestamptz default now()) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  today date := (run_at at time zone 'Africa/Dar_es_Salaam')::date;
  due record;
  lapsed record;
  sent int := 0;
begin
  for due in
    select b.id, b.member_id, b.level, p.licence_expires_on, p.licence_expires_on - today as days_left
    from public.businesses b join public.business_private p on p.business_id = b.id
    where b.status = 'approved' and b.level >= 2 and p.licence_expires_on - today between 1 and 30
      and not exists (select 1 from public.verification_requests v join public.licence_renewals lr on lr.request_id = v.id
                      where v.business_id = b.id and v.status = 'pending')
  loop
    insert into private.licence_reminders (business_id, expires_on, reminder)
    values (due.id, due.licence_expires_on, case when due.days_left <= 7 then 7 else 30 end)
    on conflict do nothing;
    if found then
      perform private.notify(due.member_id, 'B3', jsonb_build_object('days', due.days_left, 'level', due.level));
      sent := sent + 1;
    end if;
  end loop;

  for lapsed in
    update public.businesses b set status = 'expired'
    from public.business_private p
    where p.business_id = b.id and b.status = 'approved' and b.level >= 2 and p.licence_expires_on <= today
    returning b.id, b.member_id, b.level
  loop
    perform private.notify(lapsed.member_id, 'B4', jsonb_build_object('level', lapsed.level));
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;
revoke all on function private.check_licence_expiry(timestamptz) from public, anon, authenticated;

-- Reminders for events and scheduled training (T1, T2), logged in private.event_reminders before sending.
create function private.send_event_reminders(run_at timestamptz default now()) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  due record;
  sent int := 0;
begin
  for due in
    select r.id as registration_id, r.member_id, x.item_key, x.item_id, x.title, x.starts_at,
           case when x.starts_at <= run_at + interval '1 hour' then 'T2' else 'T1' end as reminder
    from public.registrations r
    join lateral (
      select 'event_id' as item_key, e.id as item_id, e.title, e.starts_at, e.status
      from public.events e where e.id = r.event_id
      union all
      select 'training_id', tr.id, tr.title, tr.starts_at, tr.status
      from public.trainings tr where tr.id = r.training_id
    ) x on true
    join public.members m on m.id = r.member_id
    where r.status = 'registered' and x.status = 'published' and m.status = 'approved'
      and x.starts_at > run_at and x.starts_at <= run_at + interval '24 hours'
  loop
    insert into private.event_reminders (registration_id, reminder, starts_at)
    values (due.registration_id, due.reminder, due.starts_at)
    on conflict do nothing;
    if found then
      perform private.notify(due.member_id, due.reminder,
        jsonb_build_object('title', due.title, due.item_key, due.item_id::text,
                           'time', to_char(due.starts_at at time zone 'Africa/Dar_es_Salaam', 'HH24:MI')));
      sent := sent + 1;
    end if;
  end loop;
  return sent;
end;
$$;
revoke all on function private.send_event_reminders(timestamptz) from public, anon, authenticated;

-- The day-7 reminder (P2) and the 14-day lapse (P8) of a pending milestone plan.
create function private.run_plan_deadlines(run_at timestamptz default now()) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  due public.milestone_plans;
  sent int := 0;
begin
  for due in select * from public.milestone_plans p
             where p.status = 'pending' and p.reminded_at is null and p.expires_at - interval '7 days' <= run_at
               and p.expires_at > run_at
             for update skip locked loop
    update public.milestone_plans set reminded_at = run_at where id = due.id;
    perform private.notify(case when due.started_by = due.member_a then due.member_b else due.member_a end, 'P2',
      jsonb_build_object('name', private.viewer_name(due.started_by), 'item', private.plan_item(due),
                         'plan_id', due.id::text));
    sent := sent + 1;
  end loop;
  for due in select * from public.milestone_plans p where p.status = 'pending' and p.expires_at <= run_at
             for update skip locked loop
    update public.milestone_plans set status = 'lapsed' where id = due.id;
    perform private.notify(due.started_by, 'P8', jsonb_build_object(
      'name', private.viewer_name(case when due.started_by = due.member_a then due.member_b else due.member_a end),
      'item', private.plan_item(due), 'plan_id', due.id::text));
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;
revoke all on function private.run_plan_deadlines(timestamptz) from public, anon, authenticated;

-- Temporary sign-in lockouts end by themselves at sign-in; this job also clears them once their time is up,
-- so the failed-attempt count starts again from zero.
create function private.clear_sign_in_lockouts(run_at timestamptz default now()) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  cleared int;
begin
  update private.login_attempts a set failed_count = 0, locked_until = null, updated_at = run_at
  where a.locked_until is not null and a.locked_until <= run_at;
  get diagnostics cleared = row_count;
  return cleared;
end;
$$;
revoke all on function private.clear_sign_in_lockouts(timestamptz) from public, anon, authenticated;
select cron.schedule('clear-sign-in-lockouts', '*/10 * * * *', $job$ select private.clear_sign_in_lockouts() $job$);
