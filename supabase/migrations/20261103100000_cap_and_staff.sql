insert into public.platform_settings (key, value) values ('daily_application_cap', 'null')
on conflict (key) do nothing;

create function private.sign_ups_today() returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.members
  where created_at >= (date_trunc('day', now() at time zone 'Africa/Dar_es_Salaam') at time zone 'Africa/Dar_es_Salaam');
$$;

create function private.application_cap_reached() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_typeof(value) = 'number' and private.sign_ups_today() >= (value #>> '{}')::int
     from public.platform_settings where key = 'daily_application_cap'),
    false);
$$;

create function private.guard_application_cap() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.key = 'daily_application_cap'
     and not (new.value = 'null'::jsonb
              or (jsonb_typeof(new.value) = 'number' and (new.value #>> '{}') ~ '^[1-9][0-9]{0,5}$')) then
    raise exception 'daily_application_cap is off (null) or a whole number from 1 to 999999' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger guard_application_cap before insert or update on public.platform_settings
  for each row execute function private.guard_application_cap();

create function private.guard_staff_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.id = auth.uid() and (not new.active or new.role <> old.role) then
    raise exception 'staff cannot deactivate or change the role of their own account' using errcode = '42501';
  end if;
  if old.role = 'super_admin' and old.active and (not new.active or new.role <> 'super_admin') then
    perform pg_advisory_xact_lock(hashtext('staff: active super administrators'));
  end if;
  if old.role = 'super_admin' and old.active and (not new.active or new.role <> 'super_admin')
     and not exists (select 1 from public.staff
                     where role = 'super_admin' and active and id <> old.id) then
    raise exception 'the last active Super Administrator cannot be removed' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_staff_change before update of active, role on public.staff
  for each row execute function private.guard_staff_change();

revoke all on function private.sign_ups_today(), private.application_cap_reached()
  from public, anon, authenticated;
