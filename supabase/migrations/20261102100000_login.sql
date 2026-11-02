create table private.login_attempts (
  identifier text primary key,
  user_id uuid references auth.users (id) on delete cascade,
  failed_count int not null default 0 check (failed_count >= 0),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table private.login_otps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null references auth.sessions (id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0 check (attempts between 0 and 3),
  consumed_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
create index login_otps_session on private.login_otps (session_id, created_at desc);
create index login_otps_user on private.login_otps (user_id, created_at desc);

create table private.mfa_sessions (
  session_id uuid primary key references auth.sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  verified_at timestamptz not null default now()
);
create index mfa_sessions_user on private.mfa_sessions (user_id);

revoke all on private.login_attempts, private.login_otps, private.mfa_sessions from public, anon, authenticated;
grant all on private.login_attempts, private.login_otps, private.mfa_sessions to service_role;

create function private.start_login_attempt(identifier text, user_id uuid, lock_after int)
returns table (allowed boolean, attempt int, locked_until timestamptz)
language plpgsql set search_path = '' as $$
declare
  row private.login_attempts;
begin
  insert into private.login_attempts (identifier, user_id)
    values (start_login_attempt.identifier, start_login_attempt.user_id)
    on conflict on constraint login_attempts_pkey do nothing;
  select * into row from private.login_attempts a where a.identifier = start_login_attempt.identifier for update;
  if row.locked_until is not null and row.locked_until > now() then
    allowed := false;
    attempt := row.failed_count;
    locked_until := row.locked_until;
    return next;
    return;
  end if;
  if row.locked_until is not null then
    row.failed_count := 0;
  end if;
  attempt := row.failed_count + 1;
  allowed := attempt <= lock_after;
  locked_until := null;
  update private.login_attempts a
    set failed_count = attempt, locked_until = null,
        user_id = coalesce(start_login_attempt.user_id, a.user_id), updated_at = now()
    where a.identifier = start_login_attempt.identifier;
  return next;
end $$;

create function private.finish_failed_login(identifier text, attempt int, lock_after int, lock_minutes int)
returns table (just_locked boolean, locked_until timestamptz)
language plpgsql set search_path = '' as $$
begin
  if attempt < lock_after then
    just_locked := false;
    return next;
    return;
  end if;
  update private.login_attempts a
    set locked_until = now() + make_interval(mins => lock_minutes), updated_at = now()
    where a.identifier = finish_failed_login.identifier and a.locked_until is null
    returning true, a.locked_until into just_locked, locked_until;
  just_locked := coalesce(just_locked, false);
  return next;
end $$;

create function private.issue_login_code(user_id uuid, session_id uuid, code_hash text, valid_minutes int, max_per_hour int)
returns boolean
language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(issue_login_code.user_id::text, 0));
  if (select count(*) from private.login_otps o
      where o.user_id = issue_login_code.user_id and o.created_at > now() - interval '1 hour') >= max_per_hour then
    return false;
  end if;
  insert into private.login_otps (user_id, session_id, code_hash, expires_at)
    values (issue_login_code.user_id, issue_login_code.session_id, issue_login_code.code_hash,
            now() + make_interval(mins => valid_minutes));
  return true;
end $$;

create function private.check_login_code(session_id uuid, code_hash text, max_attempts int)
returns table (result text, attempts_left int)
language plpgsql set search_path = '' as $$
declare
  code private.login_otps;
begin
  select * into code from private.login_otps o
    where o.session_id = check_login_code.session_id
    order by o.created_at desc limit 1
    for update;
  if not found or code.consumed_at is not null then
    result := 'no_code';
  elsif code.attempts >= max_attempts then
    result := 'too_many';
  elsif code.expires_at <= now() then
    result := 'expired';
  else
    update private.login_otps set attempts = attempts + 1 where id = code.id;
    attempts_left := max_attempts - code.attempts - 1;
    if code.code_hash = check_login_code.code_hash then
      update private.login_otps set consumed_at = now() where id = code.id;
      insert into private.mfa_sessions (session_id, user_id) values (code.session_id, code.user_id)
        on conflict on constraint mfa_sessions_pkey do nothing;
      result := 'ok';
    else
      result := case when attempts_left = 0 then 'too_many' else 'wrong_code' end;
    end if;
  end if;
  return next;
end $$;

revoke execute on function private.start_login_attempt(text, uuid, int), private.finish_failed_login(text, int, int, int), private.issue_login_code(uuid, uuid, text, int, int),
  private.check_login_code(uuid, text, int) from public, anon, authenticated;
grant execute on function private.start_login_attempt(text, uuid, int), private.finish_failed_login(text, int, int, int), private.issue_login_code(uuid, uuid, text, int, int),
  private.check_login_code(uuid, text, int) to service_role;

insert into public.platform_settings (key, value) values ('platform_name', '"Kingdom Connect"')
  on conflict (key) do nothing;

create function private.account_status(user_id uuid) returns text
language sql stable set search_path = '' as $$
  select coalesce(
    (select m.status from public.members m where m.id = account_status.user_id),
    (select case when s.active then 'staff' else 'inactive_staff' end from public.staff s where s.id = account_status.user_id),
    'none');
$$;
revoke execute on function private.account_status(uuid) from public, anon, authenticated;
grant execute on function private.account_status(uuid) to service_role;

create function private.custom_access_token_hook(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  claims jsonb := event -> 'claims';
  uid uuid := (event ->> 'user_id')::uuid;
  sid uuid := nullif(claims ->> 'session_id', '')::uuid;
begin
  claims := claims
    || jsonb_build_object(
      'otp_verified', exists (select 1 from private.mfa_sessions v where v.session_id = sid),
      'user_status', private.account_status(uid)
    );
  return jsonb_set(event, '{claims}', claims);
end $$;

revoke execute on function private.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant usage on schema private to supabase_auth_admin;
grant execute on function private.custom_access_token_hook(jsonb) to supabase_auth_admin;

create function private.sign_out_everywhere() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from auth.sessions where user_id = new.id;
  return null;
end $$;

create trigger sign_out_on_status after update of status on public.members
  for each row when (old.status is distinct from new.status and new.status in ('rejected', 'suspended', 'deactivated', 'deleted'))
  execute function private.sign_out_everywhere();

create trigger sign_out_on_deactivation after update of active on public.staff
  for each row when (old.active and not new.active)
  execute function private.sign_out_everywhere();
