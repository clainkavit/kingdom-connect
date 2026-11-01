create table private.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_member_id uuid,
  actor_staff_id uuid,
  action text not null,
  target_type text not null,
  target_id uuid,
  before jsonb,
  after jsonb,
  ip_address inet,
  created_at timestamptz not null default now(),
  check (actor_member_id is null or actor_staff_id is null)
);
create index audit_log_created_at on private.audit_log (created_at);
create index audit_log_target on private.audit_log (target_type, target_id);

revoke all on private.audit_log from public, anon, authenticated, service_role;
grant select, insert on private.audit_log to service_role;

create function private.audit_log_is_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'private.audit_log is append only: % is not allowed', lower(tg_op);
end $$;

create trigger append_only before update or delete on private.audit_log
  for each row execute function private.audit_log_is_append_only();
create trigger append_only_truncate before truncate on private.audit_log
  for each statement execute function private.audit_log_is_append_only();

create function private.request_ip() returns inet
language plpgsql stable set search_path = '' as $$
declare forwarded text;
begin
  forwarded := split_part(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ',', 1);
  return nullif(btrim(forwarded), '')::inet;
exception when others then
  return null;
end $$;

create function private.log_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  is_staff_actor boolean := exists (select 1 from public.staff s where s.id = actor);
  old_row jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_row jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
begin
  insert into private.audit_log (actor_member_id, actor_staff_id, action, target_type, target_id, before, after, ip_address)
  values (
    case when not is_staff_actor then actor end,
    case when is_staff_actor then actor end,
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    (coalesce(new_row, old_row) ->> 'id')::uuid,
    old_row,
    new_row,
    private.request_ip()
  );
  return null;
end $$;

create trigger audit_status after update of status on public.members
  for each row when (old.status is distinct from new.status) execute function private.log_change();
create trigger audit after insert or update or delete on public.staff
  for each row execute function private.log_change();
create trigger audit after insert or update or delete on public.investor_flags
  for each row execute function private.log_change();
create trigger audit after insert or update or delete on public.platform_settings
  for each row execute function private.log_change();
