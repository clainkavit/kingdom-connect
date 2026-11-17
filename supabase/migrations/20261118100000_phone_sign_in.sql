-- R29 Phone sign-in by SMS code (S04b, notification A9). Supabase Auth makes the code and the session;
-- these tables keep the email code's rules (10 minutes, 3 attempts, a limit per hour) on top of it.

-- The code Supabase Auth just made, held only until the phone-start function hashes it and sends it.
create table private.sms_pending (
  phone text primary key,
  code text not null,
  created_at timestamptz not null default clock_timestamp()
);

create table private.phone_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null check (phone ~ '^\+255[0-9]{9}$'),
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0 check (attempts between 0 and 3),
  consumed_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
create index phone_codes_phone on private.phone_codes (phone, created_at desc);

-- Only filled while SMS_SENDER is "test": what the test sender would have sent, for local runs and e2e.
create table private.test_sms (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  body text not null,
  created_at timestamptz not null default clock_timestamp()
);

revoke all on private.sms_pending, private.phone_codes, private.test_sms from public, anon, authenticated;
grant all on private.sms_pending, private.phone_codes, private.test_sms to service_role;
grant insert, update on private.sms_pending to supabase_auth_admin;

-- Supabase Auth's Send SMS hook. Refuses numbers outside Tanzania before anything is sent.
create function private.send_sms_hook(event jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  number text := '+' || ltrim(coalesce(event #>> '{user,phone}', ''), '+');
begin
  if number !~ '^\+255[0-9]{9}$' then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 400, 'message', 'Use a Tanzanian number that starts with +255.'));
  end if;
  insert into private.sms_pending (phone, code) values (number, event #>> '{sms,otp}')
    on conflict (phone) do update set code = excluded.code, created_at = clock_timestamp();
  return '{}'::jsonb;
end $$;

revoke all on function private.send_sms_hook(jsonb) from public, anon, authenticated;
grant execute on function private.send_sms_hook(jsonb) to supabase_auth_admin;
grant usage on schema private to supabase_auth_admin;

create function private.issue_phone_code(phone text, code_hash text, valid_minutes int, max_per_hour int)
returns boolean
language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(issue_phone_code.phone, 0));
  if (select count(*) from private.phone_codes c
      where c.phone = issue_phone_code.phone and c.created_at > now() - interval '1 hour') >= max_per_hour then
    return false;
  end if;
  insert into private.phone_codes (phone, code_hash, expires_at)
    values (issue_phone_code.phone, issue_phone_code.code_hash,
            now() + make_interval(mins => valid_minutes));
  return true;
end $$;

create function private.check_phone_code(phone text, code_hash text, max_attempts int)
returns table (result text, attempts_left int)
language plpgsql set search_path = '' as $$
declare
  code private.phone_codes;
begin
  select * into code from private.phone_codes c
    where c.phone = check_phone_code.phone
    order by c.created_at desc limit 1
    for update;
  if not found or code.consumed_at is not null then
    result := 'no_code';
  elsif code.attempts >= max_attempts then
    result := 'too_many';
  elsif code.expires_at <= now() then
    result := 'expired';
  else
    update private.phone_codes set attempts = attempts + 1 where id = code.id;
    attempts_left := max_attempts - code.attempts - 1;
    if code.code_hash = check_phone_code.code_hash then
      update private.phone_codes set consumed_at = now() where id = code.id;
      result := 'ok';
    else
      result := case when attempts_left = 0 then 'too_many' else 'wrong_code' end;
    end if;
  end if;
  return next;
end $$;

revoke all on function private.issue_phone_code(text, text, int, int),
  private.check_phone_code(text, text, int) from public, anon, authenticated;
grant execute on function private.issue_phone_code(text, text, int, int),
  private.check_phone_code(text, text, int) to service_role;


-- A phone sign-in account has no email: the empty address no longer counts as taken.
drop index public.member_private_email_unique;
create unique index member_private_email_unique on public.member_private (lower(email)) where email <> '';

-- First sign-in (S01a) also keeps the number someone signed in with by SMS.
create or replace function access.complete_first_sign_in(username text, accepted uuid[]) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  clean text := lower(btrim(coalesce(username, '')));
  mail text;
  number text;
  clash text;
begin
  if me is null or not (select access.otp_verified()) then
    return 'not_allowed';
  end if;
  if exists (select 1 from public.members m where m.id = me) or exists (select 1 from public.staff s where s.id = me) then
    return 'already_done';
  end if;
  if clean !~ '^[a-z0-9][a-z0-9._]{2,29}$' then
    return 'username_invalid';
  end if;
  if exists (select 1 from public.members m where m.username = clean::extensions.citext) then
    return 'username_taken';
  end if;
  if exists (select 1 from unnest(array['terms', 'privacy']) k
             where access.current_legal_text_id(k) is not null
               and not access.current_legal_text_id(k) = any (coalesce(accepted, '{}'))) then
    return 'texts_missing';
  end if;

  select u.email, u.phone into mail, number from auth.users u where u.id = me;
  insert into public.members (id, username, status) values (me, clean, 'signed_in');
  insert into public.member_private (member_id, email, phone)
    values (me, coalesce(mail, ''), case when number ~ '^255[0-9]{9}$' then '+' || number end);
  insert into public.legal_acceptances (member_id, legal_text_id, context_type)
  select me, access.current_legal_text_id(k), 'registration'
  from unnest(array['terms', 'privacy']) k
  where access.current_legal_text_id(k) is not null;
  return 'ok';
exception when unique_violation then
  get stacked diagnostics clash = constraint_name;
  return case when clash = 'member_private_email_unique' then 'email_taken' else 'username_taken' end;
end $$;
