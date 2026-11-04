create table private.email_changes (
  member_id uuid primary key references public.members (id) on delete cascade,
  new_email text not null,
  code_hash text,
  expires_at timestamptz not null,
  attempts int not null default 0,
  tries_in_window int not null default 1,
  window_started_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
revoke all on private.email_changes from public, anon, authenticated;

create unique index member_private_email_unique on public.member_private (lower(email));

create function private.log_contact_change(member uuid, action text, before jsonb, after jsonb) returns void
language sql volatile security definer set search_path = '' as $$
  insert into private.audit_log (actor_member_id, actor_staff_id, action, target_type, target_id, before, after,
                                 ip_address)
  select case when s.id is null then coalesce(me.uid, member) end, s.id, action, 'member_private', member, before,
         after, private.request_ip()
  from (select auth.uid() as uid) me left join public.staff s on s.id = me.uid;
$$;

create function private.may_change_contact(member uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.members m where m.id = member and m.status = 'approved')
     and not exists (
       select 1 from unnest(array['terms', 'privacy']) k
       where access.current_legal_text_id(k) is not null
         and not exists (select 1 from public.legal_acceptances a
                         where a.member_id = member and a.legal_text_id = access.current_legal_text_id(k)));
$$;

create function private.email_in_use(candidate text, member uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users u where lower(u.email) = lower(btrim(candidate)) and u.id <> member)
      or exists (select 1 from public.member_private p
                 where lower(p.email) = lower(btrim(candidate)) and p.member_id <> member);
$$;

create function private.start_email_change(member uuid, new_email text, code_hash text, valid_minutes int,
                                           max_per_hour int) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  clean text := lower(btrim(new_email));
  pending private.email_changes;
  taken boolean;
begin
  if clean !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(clean) > 254 then
    return 'invalid_email';
  end if;
  if exists (select 1 from public.member_private p where p.member_id = member and lower(p.email) = clean) then
    return 'same_email';
  end if;
  select * into pending from private.email_changes c where c.member_id = member for update;
  if found and pending.window_started_at > now() - interval '1 hour' and pending.tries_in_window >= max_per_hour then
    return 'too_many_codes';
  end if;
  taken := private.email_in_use(clean, member);
  insert into private.email_changes (member_id, new_email, code_hash, expires_at)
  values (member, clean, case when taken then null else code_hash end, now() + make_interval(mins => valid_minutes))
  on conflict (member_id) do update
  set new_email = excluded.new_email, code_hash = excluded.code_hash, expires_at = excluded.expires_at,
      attempts = 0,
      tries_in_window = case when email_changes.window_started_at > now() - interval '1 hour'
                             then email_changes.tries_in_window + 1 else 1 end,
      window_started_at = case when email_changes.window_started_at > now() - interval '1 hour'
                               then email_changes.window_started_at else now() end;
  return case when taken then 'taken' else 'ok' end;
end;
$$;

create function private.check_email_change_code(member uuid, code_hash text, max_attempts int)
returns table (result text, new_email text)
language plpgsql volatile security definer set search_path = '' as $$
declare pending private.email_changes;
begin
  select * into pending from private.email_changes c where c.member_id = member for update;
  if not found then
    return query select 'no_code', null::text;
  elsif pending.expires_at < now() then
    return query select 'expired', null::text;
  elsif pending.attempts >= max_attempts then
    return query select 'too_many_attempts', null::text;
  elsif pending.code_hash is distinct from check_email_change_code.code_hash then
    update private.email_changes set attempts = attempts + 1 where member_id = member;
    return query select 'wrong_code', null::text;
  elsif private.email_in_use(pending.new_email, member) then
    return query select 'email_taken', null::text;
  else
    return query select 'ok', pending.new_email;
  end if;
end;
$$;

create function private.finish_email_change(member uuid) returns void
language sql volatile security definer set search_path = '' as $$
  delete from private.email_changes where member_id = member;
$$;

create function private.sync_member_email() returns trigger
language plpgsql security definer set search_path = '' as $$
declare old_contact text;
begin
  select p.email into old_contact from public.member_private p where p.member_id = new.id;
  if not found then
    return null;
  end if;
  update public.member_private set email = new.email where member_id = new.id;
  perform private.log_contact_change(new.id, 'member.email_changed', jsonb_build_object('email', old.email),
                                     jsonb_build_object('email', new.email));
  if exists (select 1 from public.members m where m.id = new.id and m.status = 'approved') then
    perform private.notify(new.id, 'E1');
  end if;
  return null;
end;
$$;

create trigger sync_member_email after update of email on auth.users
  for each row when (old.email is distinct from new.email and new.email not like 'deleted-%@deleted.invalid')
  execute function private.sync_member_email();

revoke all on function private.log_contact_change(uuid, text, jsonb, jsonb), private.may_change_contact(uuid),
  private.email_in_use(text, uuid), private.start_email_change(uuid, text, text, int, int),
  private.check_email_change_code(uuid, text, int), private.finish_email_change(uuid)
  from public, anon, authenticated;

create function access.set_my_phone(phone text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  clean text := regexp_replace(coalesce(phone, ''), '[[:space:]-]', '', 'g');
  old_phone text;
begin
  if not (select access.is_member()) then
    raise exception 'not_allowed';
  end if;
  if clean !~ '^\+255[0-9]{9}$' then
    return 'invalid_phone';
  end if;
  select p.phone into old_phone from public.member_private p where p.member_id = auth.uid() for update;
  if old_phone = clean then
    return 'ok';
  end if;
  update public.member_private set phone = clean where member_id = auth.uid();
  perform private.log_contact_change(auth.uid(), 'member.phone_changed', jsonb_build_object('phone', old_phone),
                                     jsonb_build_object('phone', clean));
  perform private.notify(auth.uid(), 'E2');
  return 'ok';
end;
$$;

create function access.set_my_address(address text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  clean text := nullif(btrim(coalesce(address, '')), '');
  old_address text;
begin
  if not (select access.is_member()) then
    raise exception 'not_allowed';
  end if;
  if char_length(clean) > 300 then
    return 'too_long';
  end if;
  select p.address into old_address from public.member_private p where p.member_id = auth.uid() for update;
  if old_address is not distinct from clean then
    return 'ok';
  end if;
  update public.member_private set address = clean where member_id = auth.uid();
  perform private.log_contact_change(auth.uid(), 'member.address_changed',
                                     jsonb_build_object('address', old_address), jsonb_build_object('address', clean));
  return 'ok';
end;
$$;

revoke all on function access.set_my_phone(text), access.set_my_address(text) from public, anon;
grant execute on function access.set_my_phone(text), access.set_my_address(text) to authenticated;

create function public.set_my_phone(phone text) returns text
language sql volatile security invoker set search_path = '' as $$
  select access.set_my_phone(phone);
$$;
create function public.set_my_address(address text) returns text
language sql volatile security invoker set search_path = '' as $$
  select access.set_my_address(address);
$$;
revoke all on function public.set_my_phone(text), public.set_my_address(text) from public, anon;
grant execute on function public.set_my_phone(text), public.set_my_address(text) to authenticated;
