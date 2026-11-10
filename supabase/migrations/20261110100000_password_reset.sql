-- R21: forgot password (REG-6, decided 10 Nov 2026, #182). A member types their username and gets a 6-digit code
-- by email (A7), with the login code's rules: 10 minutes, 3 attempts, a new code after 60 seconds, at most 10 an
-- hour. Every request gets a reset row, also for a username that does not exist (user_id empty, a code nobody
-- knows), so no answer tells whether an account exists. With the right code the member sets a new password; saving
-- signs them out on every other device, ends a running lockout and always tells them (E7).

create table private.password_resets (
  id uuid primary key,
  user_id uuid references auth.users (id) on delete cascade,
  code_hash text not null,
  attempts int not null default 0 check (attempts >= 0),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index password_resets_user on private.password_resets (user_id, created_at);
revoke all on private.password_resets from public, anon, authenticated;

-- Starts a reset. For a real account it refuses more than max_per_hour codes an hour, or a new code within
-- resend_seconds of the last; the caller answers the same way whatever this returns.
create function private.start_password_reset(user_id uuid, reset_id uuid, code_hash text, valid_minutes int,
                                             max_per_hour int, resend_seconds int) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if start_password_reset.user_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('password_reset:' || start_password_reset.user_id::text, 0));
    if (select count(*) from private.password_resets r
        where r.user_id = start_password_reset.user_id and r.created_at > now() - interval '1 hour') >= max_per_hour then
      return 'too_many';
    end if;
    if exists (select 1 from private.password_resets r
               where r.user_id = start_password_reset.user_id
                 and r.created_at > now() - make_interval(secs => resend_seconds)) then
      return 'too_soon';
    end if;
  end if;
  insert into private.password_resets (id, user_id, code_hash, expires_at)
  values (reset_id, start_password_reset.user_id, start_password_reset.code_hash, now() + make_interval(mins => valid_minutes));
  return 'ok';
end;
$$;

-- Checks a code. With consume false it only confirms the code (the code step); with consume true it also uses
-- the code up (the new password step). Every check counts as an attempt.
create function private.check_password_reset(reset_id uuid, code_hash text, max_attempts int, consume boolean)
returns table (result text, attempts_left int, user_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  reset private.password_resets;
begin
  select * into reset from private.password_resets r where r.id = reset_id for update;
  if not found then
    result := 'wrong_code';
    attempts_left := max_attempts - 1;
  elsif reset.consumed_at is not null then
    result := 'expired';
  elsif reset.attempts >= max_attempts then
    result := 'too_many';
  elsif reset.expires_at <= now() then
    result := 'expired';
  else
    update private.password_resets set attempts = attempts + 1 where id = reset.id;
    attempts_left := max_attempts - reset.attempts - 1;
    if reset.user_id is not null and reset.code_hash = check_password_reset.code_hash then
      result := 'ok';
      user_id := reset.user_id;
      if consume then
        update private.password_resets set consumed_at = now() where id = reset.id;
      end if;
    else
      result := case when attempts_left > 0 then 'wrong_code' else 'too_many' end;
    end if;
  end if;
  return next;
end;
$$;

-- After the new password is saved: every session ends, a running lockout ends, and the member is told (E7).
create function private.finish_password_reset(user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  name text := (select m.username::text from public.members m where m.id = finish_password_reset.user_id);
begin
  delete from auth.sessions s where s.user_id = finish_password_reset.user_id;
  if name is not null then
    delete from private.login_attempts a where a.identifier = 'username:' || lower(name);
    perform private.notify(finish_password_reset.user_id, 'E7', '{}'::jsonb);
  end if;
  insert into private.audit_log (actor_member_id, action, target_type, target_id, after, ip_address)
  values (case when name is not null then finish_password_reset.user_id end, 'password.reset', 'auth.users',
          finish_password_reset.user_id, '{}'::jsonb, private.request_ip());
end;
$$;

revoke all on function private.start_password_reset(uuid, uuid, text, int, int, int),
  private.check_password_reset(uuid, text, int, boolean), private.finish_password_reset(uuid)
  from public, anon, authenticated;
