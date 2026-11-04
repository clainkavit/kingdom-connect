alter table private.email_outbox add column to_email text;

create function private.queue_email(member uuid, kind text, payload jsonb, to_email text) returns void
language sql volatile security definer set search_path = '' as $$
  insert into private.email_outbox (member_id, kind, payload, to_email) values (member, kind, payload, to_email);
$$;

create table public.email_recoveries (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id),
  new_email text not null,
  id_digits_match boolean not null,
  photo_path text,
  filed_by uuid references public.staff (id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'refused', 'cancelled', 'applied')),
  decided_by uuid references public.staff (id),
  decided_at timestamptz,
  refusal_reason text check (char_length(refusal_reason) <= 500),
  takes_effect_at timestamptz,
  requester_ip inet,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (photo_path is null or photo_path like member_id::text || '/recovery-%')
);
create index email_recoveries_open on public.email_recoveries (status, created_at);
create trigger set_updated_at before update on public.email_recoveries
  for each row execute function private.set_updated_at();
create trigger audit after insert or update on public.email_recoveries
  for each row execute function private.log_change();

alter table public.email_recoveries enable row level security;
revoke all on public.email_recoveries from anon, authenticated;
create policy "base rule" on public.email_recoveries as restrictive for all to authenticated
  using ((select access.is_member()) or (select access.is_staff()))
  with check ((select access.is_member()) or (select access.is_staff()));
grant select on public.email_recoveries to authenticated;
create policy "own or staff" on public.email_recoveries for select to authenticated
  using (member_id = (select auth.uid()) or (select access.is_staff()));

create function private.file_email_recovery(username text, new_email text, last_digits text, filed_by uuid,
                                            requester_ip inet default null)
returns table (result text, recovery_id uuid, member_id uuid)
language plpgsql volatile security definer set search_path = '' as $$
declare
  target public.members;
  clean text := lower(btrim(file_email_recovery.new_email));
  id_number text;
  created uuid;
begin
  if clean !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(clean) > 254
     or coalesce(last_digits, '') !~ '^[0-9]{4}$' then
    return query select 'invalid', null::uuid, null::uuid;
    return;
  end if;
  select * into target from public.members m where lower(m.username::text) = lower(btrim(file_email_recovery.username));
  if file_email_recovery.requester_ip is not null and file_email_recovery.filed_by is null
     and (select count(*) from public.email_recoveries r
          where r.requester_ip = file_email_recovery.requester_ip and r.created_at > now() - interval '24 hours') >= 3 then
    return query select 'too_many', null::uuid, null::uuid;
    return;
  end if;
  if not found or target.status in ('deleted', 'pending', 'rejected') or private.email_in_use(clean, target.id) then
    return query select 'ok', null::uuid, null::uuid;
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext('recovery:' || target.id::text));
  if (select count(*) from public.email_recoveries r
      where r.member_id = target.id and r.status = 'pending') >= 5 then
    return query select 'ok', null::uuid, null::uuid;
    return;
  end if;
  select extensions.pgp_sym_decrypt(p.id_encrypted, private.vault_secret('id_encryption_key')) into id_number
  from public.member_private p where p.member_id = target.id and p.id_encrypted is not null;
  insert into public.email_recoveries (member_id, new_email, id_digits_match, filed_by, requester_ip)
  values (target.id, clean, coalesce(right(id_number, 4) = last_digits, false), file_email_recovery.filed_by,
          file_email_recovery.requester_ip)
  returning id into created;
  insert into private.audit_log (actor_staff_id, action, target_type, target_id, after, ip_address)
  values (file_email_recovery.filed_by, 'recovery.requested', 'email_recoveries', created,
          jsonb_build_object('member_id', target.id, 'new_email', clean), file_email_recovery.requester_ip);
  perform private.notify(target.id, 'E4');
  perform private.queue_email(target.id, 'E4', '{}', clean);
  return query select 'ok', created, target.id;
end;
$$;

create function private.attach_recovery_photo(recovery uuid, path text) returns void
language sql volatile security definer set search_path = '' as $$
  update public.email_recoveries set photo_path = path where id = recovery;
$$;

create function private.drop_recovery(recovery uuid) returns void
language sql volatile security definer set search_path = '' as $$
  update public.email_recoveries set status = 'cancelled' where id = recovery and status = 'pending';
$$;

create function access.decide_email_recovery(recovery uuid, approve boolean, reason text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare picked public.email_recoveries;
begin
  if not (select access.is_staff()) then
    raise exception 'not_allowed';
  end if;
  select * into picked from public.email_recoveries where id = recovery for update;
  if not found or picked.status <> 'pending' then
    return 'already_decided';
  end if;
  if picked.photo_path is null then
    return 'no_photo';
  end if;
  if picked.filed_by = auth.uid() then
    return 'filed_by_you';
  end if;
  if approve then
    update public.email_recoveries
    set status = 'approved', decided_by = auth.uid(), decided_at = now(), takes_effect_at = now() + interval '48 hours'
    where id = recovery;
    perform private.notify(picked.member_id, 'E5');
    perform private.queue_email(picked.member_id, 'E5', '{}', picked.new_email);
  else
    if nullif(btrim(coalesce(reason, '')), '') is null then
      return 'reason_required';
    end if;
    if private.holds_contact_details(jsonb_build_object('reason', reason)) then
      return 'reason_has_contact';
    end if;
    update public.email_recoveries
    set status = 'refused', decided_by = auth.uid(), decided_at = now(), refusal_reason = btrim(reason)
    where id = recovery;
    perform private.queue_email(picked.member_id, 'E6', jsonb_build_object('reason', btrim(reason)),
                                picked.new_email);
  end if;
  return 'ok';
end;
$$;

create function access.cancel_my_email_recovery() returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not (select access.is_member()) then
    raise exception 'not_allowed';
  end if;
  update public.email_recoveries set status = 'cancelled'
  where member_id = auth.uid() and status in ('pending', 'approved');
  return case when found then 'ok' else 'none' end;
end;
$$;

create function private.apply_due_email_recoveries() returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  due public.email_recoveries;
  old_email text;
  applied int := 0;
begin
  for due in select r.* from public.email_recoveries r
             where r.status = 'approved' and r.takes_effect_at <= now() for update skip locked loop
    if private.email_in_use(due.new_email, due.member_id)
       or exists (select 1 from public.members m where m.id = due.member_id and m.status = 'deleted') then
      update public.email_recoveries set status = 'cancelled' where id = due.id;
      continue;
    end if;
    select u.email into old_email from auth.users u where u.id = due.member_id;
    update auth.users
    set email = due.new_email, email_confirmed_at = coalesce(email_confirmed_at, now()),
        email_change = '', email_change_token_new = '', email_change_token_current = '',
        email_change_confirm_status = 0
    where id = due.member_id;
    delete from auth.sessions where user_id = due.member_id;
    update auth.identities
    set identity_data = jsonb_set(identity_data, '{email}', to_jsonb(due.new_email))
    where user_id = due.member_id and provider = 'email';
    update public.email_recoveries set status = 'applied' where id = due.id;
    insert into private.audit_log (actor_staff_id, action, target_type, target_id, before, after)
    values (due.decided_by, 'recovery.applied', 'email_recoveries', due.id, jsonb_build_object('email', old_email),
            jsonb_build_object('email', due.new_email));
    perform private.queue_email(due.member_id, 'E1', '{}', old_email);
    applied := applied + 1;
  end loop;
  return applied;
end;
$$;

create function private.cancel_open_recoveries(member uuid) returns void
language sql volatile security definer set search_path = '' as $$
  update public.email_recoveries set status = 'cancelled'
  where member_id = member and status in ('pending', 'approved');
$$;

create function private.cancel_recoveries_on_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.cancel_open_recoveries(new.id);
  return null;
end;
$$;
create trigger cancel_recoveries_on_delete after update of status on public.members
  for each row when (new.status = 'deleted' and old.status is distinct from 'deleted')
  execute function private.cancel_recoveries_on_delete();

revoke all on function private.queue_email(uuid, text, jsonb, text),
  private.file_email_recovery(text, text, text, uuid, inet), private.cancel_open_recoveries(uuid), private.attach_recovery_photo(uuid, text),
  private.drop_recovery(uuid), private.apply_due_email_recoveries() from public, anon, authenticated;
revoke all on function access.decide_email_recovery(uuid, boolean, text), access.cancel_my_email_recovery()
  from public, anon;
grant execute on function access.decide_email_recovery(uuid, boolean, text), access.cancel_my_email_recovery()
  to authenticated;

create function public.decide_email_recovery(recovery uuid, approve boolean, reason text default null) returns text
language sql volatile security invoker set search_path = '' as $$
  select access.decide_email_recovery(recovery, approve, reason);
$$;
create function public.cancel_my_email_recovery() returns text
language sql volatile security invoker set search_path = '' as $$
  select access.cancel_my_email_recovery();
$$;
revoke all on function public.decide_email_recovery(uuid, boolean, text), public.cancel_my_email_recovery()
  from public, anon;
grant execute on function public.decide_email_recovery(uuid, boolean, text), public.cancel_my_email_recovery()
  to authenticated;

select cron.schedule('apply-email-recoveries', '*/10 * * * *', $job$ select private.apply_due_email_recoveries() $job$);
