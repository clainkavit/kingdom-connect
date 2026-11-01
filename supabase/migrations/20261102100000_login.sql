create table private.login_attempts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  failed_count int not null default 0 check (failed_count >= 0),
  first_failed_at timestamptz,
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
  created_at timestamptz not null default now()
);
create index login_otps_session on private.login_otps (session_id, created_at desc);

create table private.mfa_sessions (
  session_id uuid primary key references auth.sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  verified_at timestamptz not null default now()
);
create index mfa_sessions_user on private.mfa_sessions (user_id);

revoke all on private.login_attempts, private.login_otps, private.mfa_sessions from public, anon, authenticated;
grant all on private.login_attempts, private.login_otps, private.mfa_sessions to service_role;

create function private.custom_access_token_hook(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  claims jsonb := event -> 'claims';
  uid uuid := (event ->> 'user_id')::uuid;
  sid uuid := nullif(claims ->> 'session_id', '')::uuid;
  status text;
begin
  select m.status into status from public.members m where m.id = uid;
  if status is null then
    select case when s.active then 'staff' else 'inactive_staff' end into status
    from public.staff s where s.id = uid;
  end if;
  claims := claims
    || jsonb_build_object(
      'otp_verified', exists (select 1 from private.mfa_sessions v where v.session_id = sid),
      'user_status', coalesce(status, 'none')
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
