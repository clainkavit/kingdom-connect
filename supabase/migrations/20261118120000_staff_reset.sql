-- R30 Staff password reset, approved by a Super Administrator (decided 18 Nov 2026; boards Admin-Forgot,
-- Admin-ForgotSent, Admin-NewPassword and "Password resets and locked accounts" in Staff accounts).

create table private.staff_resets (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting', 'sent', 'refused', 'used')),
  requested_at timestamptz not null default clock_timestamp(),
  decided_by uuid references public.staff (id),
  decided_at timestamptz,
  token_hash text,
  link_expires_at timestamptz,
  check ((status = 'waiting') = (decided_by is null)),
  check ((status in ('sent', 'used')) = (token_hash is not null and link_expires_at is not null))
);
create unique index staff_resets_one_waiting on private.staff_resets (staff_id) where status = 'waiting';

revoke all on private.staff_resets from public, anon, authenticated;
grant all on private.staff_resets to service_role;

-- Step 1, from the Forgot password page. Nothing tells the caller whether the email is a staff account.
create function private.request_staff_reset(email text, ip inet) returns void
language plpgsql security definer set search_path = '' as $$
declare
  who record;
  id uuid;
begin
  select s.id, s.full_name into who
  from public.staff s join auth.users u on u.id = s.id
  where s.active and lower(u.email) = lower(btrim(request_staff_reset.email));
  if who.id is null then return; end if;

  insert into private.staff_resets (staff_id) values (who.id)
    on conflict (staff_id) where status = 'waiting' do nothing
    returning staff_resets.id into id;
  if id is null then return; end if;

  insert into private.audit_log (action, target_type, target_id, after, ip_address)
  values ('staff.reset_requested', 'staff', who.id, '{}'::jsonb, ip);
  perform private.queue_email(null, 'Y2', jsonb_build_object('name', who.full_name), u.email)
  from public.staff s join auth.users u on u.id = s.id
  where s.active and s.role = 'super_admin' and s.id <> who.id;
end $$;

-- What a Super Administrator sees: waiting requests, and staff accounts locked after failed sign-ins.
create function access.staff_access_queue()
returns table (kind text, request_id uuid, staff_id uuid, full_name text, email text, at timestamptz, failed int)
language sql stable security definer set search_path = '' as $$
  select 'reset', r.id, s.id, s.full_name, u.email::text, r.requested_at, null::int
  from private.staff_resets r
  join public.staff s on s.id = r.staff_id
  join auth.users u on u.id = s.id
  where (select access.is_super_admin()) and r.status = 'waiting' and s.active
  union all
  select 'locked', null, s.id, s.full_name, u.email::text, a.updated_at, a.failed_count
  from private.login_attempts a
  join auth.users u on a.identifier = 'email:' || lower(u.email)
  join public.staff s on s.id = u.id
  where (select access.is_super_admin()) and a.locked_until > now() and s.active
  order by 6 desc;
$$;
revoke all on function access.staff_access_queue() from public, anon;
grant execute on function access.staff_access_queue() to authenticated;

create function public.staff_access_queue()
returns table (kind text, request_id uuid, staff_id uuid, full_name text, email text, at timestamptz, failed int)
language sql stable security invoker set search_path = '' as $$ select * from access.staff_access_queue(); $$;
revoke all on function public.staff_access_queue() from public, anon;
grant execute on function public.staff_access_queue() to authenticated;

create function private.active_super_admin(id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff s where s.id = active_super_admin.id and s.active and s.role = 'super_admin');
$$;

-- Step 2: a Super Administrator sends the link (decision 'sent', with the token's hash) or refuses.
create function private.decide_staff_reset(request uuid, decider uuid, decision text, token_hash text,
  valid_hours int, ip inet)
returns table (result text, email text)
language plpgsql security definer set search_path = '' as $$
declare
  target uuid;
  mail text;
begin
  if not private.active_super_admin(decider) then
    return query select 'not_super_admin'::text, null::text; return;
  end if;
  select r.staff_id, u.email into target, mail
  from private.staff_resets r join auth.users u on u.id = r.staff_id
  where r.id = request and r.status = 'waiting' for update of r;
  if target is null then
    return query select 'not_found'::text, null::text; return;
  end if;
  if target = decider then
    return query select 'own_request'::text, null::text; return;
  end if;
  if decision not in ('sent', 'refused') or (decision = 'sent') <> (token_hash is not null) then
    raise exception 'invalid decision';
  end if;

  update private.staff_resets r set
    status = decision, decided_by = decider, decided_at = clock_timestamp(),
    token_hash = decide_staff_reset.token_hash,
    link_expires_at = case when decision = 'sent' then clock_timestamp() + make_interval(hours => valid_hours) end
  where r.id = request;
  insert into private.audit_log (actor_staff_id, action, target_type, target_id, after, ip_address)
  values (decider, 'staff.reset_' || decision, 'staff', target, '{}'::jsonb, ip);
  if decision = 'refused' then
    perform private.queue_email(null, 'Y4', '{}'::jsonb, mail);
  end if;
  return query select 'ok'::text, mail;
end $$;

-- Ends a lockout on a staff account early. The edge function also lifts the sign-in ban in Supabase Auth.
create function private.unlock_staff(target uuid, decider uuid, ip inet) returns text
language plpgsql security definer set search_path = '' as $$
declare
  removed int;
begin
  if not private.active_super_admin(decider) then return 'not_super_admin'; end if;
  delete from private.login_attempts a
  using auth.users u join public.staff s on s.id = u.id
  where u.id = target and a.identifier = 'email:' || lower(u.email) and a.locked_until > now();
  get diagnostics removed = row_count;
  if removed = 0 then return 'not_found'; end if;
  insert into private.audit_log (actor_staff_id, action, target_type, target_id, after, ip_address)
  values (decider, 'login.unlocked', 'staff', target, '{}'::jsonb, ip);
  return 'ok';
end $$;

-- Step 3: the link opens the New password page. Returns the staff email while the link is good.
create function private.check_staff_reset(request uuid, token_hash text)
returns table (result text, staff_id uuid, email text)
language sql stable security definer set search_path = '' as $$
  select case when r.id is null then 'expired' else 'ok' end, r.staff_id, u.email::text
  from (select 1) one
  left join (private.staff_resets r
             join public.staff s on s.id = r.staff_id and s.active
             join auth.users u on u.id = s.id)
    on r.id = request and r.token_hash = check_staff_reset.token_hash
       and r.status = 'sent' and r.link_expires_at > now();
$$;

-- After the new password is saved: the link is used up, every session ends, a lockout ends, and the staff
-- member gets the "password changed" email (E7).
create function private.finish_staff_reset(request uuid, ip inet) returns void
language plpgsql security definer set search_path = '' as $$
declare
  target uuid;
  mail text;
begin
  update private.staff_resets r set status = 'used' where r.id = request and r.status = 'sent'
    returning r.staff_id into target;
  if target is null then raise exception 'reset link already used'; end if;
  select u.email into mail from auth.users u where u.id = target;
  delete from auth.sessions s where s.user_id = target;
  delete from private.login_attempts a where a.identifier = 'email:' || lower(mail);
  insert into private.audit_log (action, target_type, target_id, after, ip_address)
  values ('password.reset', 'staff', target, '{}'::jsonb, ip);
  perform private.queue_email(null, 'E7', '{}'::jsonb, mail);
end $$;

revoke all on function private.request_staff_reset(text, inet), private.active_super_admin(uuid),
  private.decide_staff_reset(uuid, uuid, text, text, int, inet), private.unlock_staff(uuid, uuid, inet),
  private.check_staff_reset(uuid, text), private.finish_staff_reset(uuid, inet)
  from public, anon, authenticated;
