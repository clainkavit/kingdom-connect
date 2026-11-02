create table public.rejection_reasons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z_]+$'),
  label_en text not null,
  label_sw text not null,
  sort int not null,
  needs_note boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.rejection_reasons
  for each row execute function private.set_updated_at();
insert into public.rejection_reasons (code, label_en, label_sw, sort, needs_note) values
  ('id_photo_unclear', 'The ID photo is not clear enough to read', 'Picha ya kitambulisho haisomeki vizuri', 1, false),
  ('face_photo_unclear', 'The face photo is not clear enough', 'Picha ya uso haionekani vizuri', 2, false),
  ('face_mismatch', 'The face photo does not match the ID photo', 'Picha ya uso haifanani na picha ya kitambulisho', 3, false),
  ('name_mismatch', 'The name on the form does not match the ID', 'Jina kwenye fomu halilingani na jina kwenye kitambulisho', 4, false),
  ('id_number_mismatch', 'The ID number on the form does not match the ID', 'Namba ya kitambulisho kwenye fomu hailingani na kitambulisho', 5, false),
  ('id_expired', 'The ID has expired', 'Kitambulisho kimeisha muda wake', 6, false),
  ('other', 'Another reason, explained in the note', 'Sababu nyingine, imeelezwa kwenye maelezo', 7, true);

revoke all on public.rejection_reasons from anon, authenticated;
grant select on public.rejection_reasons to authenticated;
alter table public.rejection_reasons enable row level security;
create policy "base rule" on public.rejection_reasons as restrictive for all to authenticated
  using ((select access.is_staff()));
create policy "staff read" on public.rejection_reasons for select to authenticated
  using ((select access.is_staff()));

alter table public.verification_requests
  add column reason_code text references public.rejection_reasons (code),
  add column reason_note text check (char_length(reason_note) <= 500);

drop policy "staff decide" on public.verification_requests;
revoke update on public.verification_requests from authenticated;

create function private.active_staff(actor uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff where id = actor and active);
$$;

create function private.decide_application(
  actor uuid, request uuid, decision text, code text default null, note text default null, ip inet default null
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  current public.verification_requests;
  applicant_language text;
  reason_text text;
  clean_note text := nullif(btrim(coalesce(note, '')), '');
  final boolean := false;
begin
  if not private.active_staff(actor) then
    return 'not_staff';
  end if;
  if decision not in ('approved', 'rejected') then
    return 'invalid';
  end if;
  select * into current from public.verification_requests where id = request for update;
  if not found then
    return 'not_found';
  end if;
  if current.status <> 'pending' then
    return 'already_decided';
  end if;
  if current.level = 1 and not exists (
    select 1 from public.members where id = current.member_id and status = 'pending') then
    return 'member_not_pending';
  end if;

  if decision = 'rejected' then
    select coalesce(language, 'en') into applicant_language
    from public.member_private where member_id = current.member_id;
    select case when applicant_language = 'sw' then label_sw else label_en end into reason_text
    from public.rejection_reasons
    where rejection_reasons.code = decide_application.code
      and (not needs_note or clean_note is not null);
    if reason_text is null then
      return 'reason_required';
    end if;
    if clean_note is not null then
      if private.holds_contact_details(jsonb_build_object('note', clean_note)) then
        return 'note_has_contact_details';
      end if;
      reason_text := reason_text || '. ' || clean_note;
    end if;
  end if;

  update public.verification_requests
  set status = decision, reviewer_id = actor, decided_at = now(),
      reason_code = case when decision = 'rejected' then code end,
      reason_note = case when decision = 'rejected' then clean_note end,
      reason = reason_text
  where id = request;

  if current.level = 1 then
    update public.members
    set status = decision,
        approved_at = case when decision = 'approved' then now() else approved_at end
    where id = current.member_id
    returning resubmissions_used > 0 into final;
  end if;

  insert into private.audit_log (actor_staff_id, action, target_type, target_id, before, after, ip_address)
  values (actor, 'application.' || decision, 'verification_requests', request,
          jsonb_build_object('status', current.status),
          jsonb_build_object('status', decision, 'member_id', current.member_id, 'level', current.level,
                             'reason_code', case when decision = 'rejected' then code end,
                             'reason_note', clean_note),
          ip);

  if current.level = 1 and decision = 'approved' then
    perform private.notify(current.member_id, 'A2', '{}');
  elsif current.level = 1 then
    perform private.notify(current.member_id, case when final then 'A4' else 'A3' end,
                           jsonb_build_object('reason', reason_text));
  end if;
  return 'ok';
end $$;

create function private.mark_duplicate(actor uuid, request uuid, other_username text, ip inet default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  current public.verification_requests;
  other uuid;
begin
  if not private.active_staff(actor) then
    return 'not_staff';
  end if;
  select * into current from public.verification_requests where id = request for update;
  if not found then
    return 'not_found';
  end if;
  if current.status <> 'pending' then
    return 'already_decided';
  end if;
  if nullif(btrim(coalesce(other_username, '')), '') is not null then
    select id into other from public.members
    where username = lower(btrim(other_username)) and id <> current.member_id;
    if other is null then
      return 'unknown_member';
    end if;
  end if;

  update public.verification_requests set duplicate_suspected_of = other where id = request;
  insert into private.audit_log (actor_staff_id, action, target_type, target_id, before, after, ip_address)
  values (actor, 'application.duplicate_marked', 'verification_requests', request,
          jsonb_build_object('duplicate_suspected_of', current.duplicate_suspected_of),
          jsonb_build_object('duplicate_suspected_of', other), ip);
  return 'ok';
end $$;

create function private.reveal_id_number(actor uuid, member uuid, ip inet default null) returns text
language plpgsql security definer set search_path = '' as $$
declare number text;
begin
  if not private.active_staff(actor) then
    raise exception 'only staff can reveal an ID number' using errcode = '42501';
  end if;
  select extensions.pgp_sym_decrypt(id_encrypted, private.vault_secret('id_encryption_key')) into number
  from public.member_private where member_id = member and id_encrypted is not null;
  if number is null then
    return null;
  end if;
  insert into private.audit_log (actor_staff_id, action, target_type, target_id, ip_address)
  values (actor, 'id.revealed', 'members', member, ip);
  return number;
end $$;

revoke all on function private.active_staff(uuid),
  private.decide_application(uuid, uuid, text, text, text, inet),
  private.mark_duplicate(uuid, uuid, text, inet),
  private.reveal_id_number(uuid, uuid, inet) from public, anon, authenticated;
