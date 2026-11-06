create function private.guard_business_requests() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.business_id is not null
     and (new.status is distinct from old.status or new.reviewer_id is distinct from old.reviewer_id
          or new.decided_at is distinct from old.decided_at or new.reason is distinct from old.reason
          or new.reason_code is distinct from old.reason_code or new.reason_note is distinct from old.reason_note
          or new.duplicate_suspected_of is distinct from old.duplicate_suspected_of)
     and coalesce(current_setting('kc.business_review', true), '') <> 'on' then
    raise exception 'a business request is decided with decide_business_verification()';
  end if;
  return new;
end;
$$;
create trigger guard_business_requests before update on public.verification_requests
  for each row execute function private.guard_business_requests();

create function private.check_reason_scope() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.reason_code is not null and new.reason_code is distinct from old.reason_code
     and not exists (select 1 from public.rejection_reasons r
                     where r.code = new.reason_code
                       and case when new.business_id is null then r.for_identity else r.for_business end) then
    raise exception 'that reason does not apply to this kind of request';
  end if;
  return new;
end;
$$;
create trigger check_reason_scope before update on public.verification_requests
  for each row execute function private.check_reason_scope();
revoke all on function private.guard_business_requests(), private.check_reason_scope() from public, anon, authenticated;

create or replace function access.business_file_writable(path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select access.is_member()) and split_part(path, '/', 1) = auth.uid()::text
     and split_part(path, '/', 2) <> '' and split_part(path, '/', 3) = ''
     and not exists (select 1 from public.verification_documents d where d.storage_path = path)
     and (select count(*) from storage.objects o
          where o.bucket_id = 'business-documents' and o.name like auth.uid()::text || '/%') < 30;
$$;

create or replace function access.submit_business_verification(
  business_name text, sector uuid, size text, description text, brela_no text, tin text, licence_no text,
  licence_expires_on date, brela_path text, tin_path text, licence_path text
) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  clean_name text := btrim(coalesce(business_name, ''));
  clean_tin text := regexp_replace(coalesce(tin, ''), '[[:space:]-]', '', 'g');
  clean_brela text := btrim(coalesce(brela_no, ''));
  clean_licence text := btrim(coalesce(licence_no, ''));
  clean_description text := nullif(btrim(coalesce(description, '')), '');
  owned public.businesses;
  created uuid;
  paths text[] := array[brela_path, tin_path, licence_path];
begin
  if not (select access.is_member()) then
    raise exception 'not_allowed';
  end if;
  perform pg_advisory_xact_lock(hashtext('business:' || me::text));
  if char_length(clean_name) not between 2 and 120 then return 'invalid_name'; end if;
  if not exists (select 1 from public.sectors s where s.id = sector) then return 'invalid_sector'; end if;
  if size not in ('micro', 'small', 'medium', 'large') then return 'invalid_size'; end if;
  if char_length(clean_description) > 1000 then return 'too_long'; end if;
  if private.holds_contact_details(jsonb_build_object('name', clean_name, 'description', coalesce(clean_description, ''))) then
    return 'contact_details';
  end if;
  if char_length(clean_brela) not between 3 and 40 or char_length(clean_licence) not between 3 and 40 then
    return 'invalid_number';
  end if;
  if clean_tin !~ '^[0-9]{9}$' then return 'invalid_tin'; end if;
  if licence_expires_on is null
     or licence_expires_on <= (now() at time zone 'Africa/Dar_es_Salaam')::date then
    return 'licence_expired';
  end if;
  if licence_expires_on > (now() at time zone 'Africa/Dar_es_Salaam')::date + interval '10 years' then
    return 'invalid_date';
  end if;
  if exists (select 1 from unnest(paths) p where p is null or split_part(p, '/', 1) <> me::text
                or split_part(p, '/', 2) = '' or split_part(p, '/', 3) <> '')
     or (select count(distinct p) from unnest(paths) p) <> 3
     or (select count(*) from storage.objects o
         where o.bucket_id = 'business-documents' and o.name = any (paths)) <> 3 then
    return 'documents_missing';
  end if;

  select * into owned from public.businesses b where b.member_id = me for update;
  if found then
    if exists (select 1 from public.verification_requests v
               where v.member_id = me and v.level = 2 and v.status = 'pending') then
      return 'already_pending';
    end if;
    if exists (select 1 from public.verification_requests v
               where v.member_id = me and v.level = 2 and v.status = 'approved') then
      return 'already_approved';
    end if;
    update public.businesses
    set name = clean_name, sector_id = sector, size = submit_business_verification.size,
        description = clean_description, status = 'pending'
    where id = owned.id;
    update public.business_private
    set brela_no = clean_brela, tin = substr(clean_tin, 1, 3) || '-' || substr(clean_tin, 4, 3) || '-' || substr(clean_tin, 7, 3),
        licence_no = clean_licence, licence_expires_on = submit_business_verification.licence_expires_on
    where business_id = owned.id;
  else
    insert into public.businesses (member_id, name, sector_id, size, description)
    values (me, clean_name, sector, submit_business_verification.size, clean_description)
    returning * into owned;
    insert into public.business_private (business_id, brela_no, tin, licence_no, licence_expires_on)
    values (owned.id, clean_brela, substr(clean_tin, 1, 3) || '-' || substr(clean_tin, 4, 3) || '-' || substr(clean_tin, 7, 3),
            clean_licence, submit_business_verification.licence_expires_on);
  end if;

  insert into public.verification_requests (member_id, level, business_id)
  values (me, 2, owned.id) returning id into created;
  insert into public.verification_documents (request_id, kind, storage_path) values
    (created, 'brela', brela_path), (created, 'tin', tin_path), (created, 'licence', licence_path);
  insert into private.audit_log (actor_member_id, action, target_type, target_id, after, ip_address)
  values (me, 'business.verification_submitted', 'verification_requests', created,
          jsonb_build_object('business_id', owned.id, 'level', 2), private.request_ip());
  return 'ok';
end;
$$;

create or replace function access.decide_business_verification(request uuid, approve boolean, reason_code text, note text)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  req public.verification_requests;
  reason_row public.rejection_reasons;
  clean_note text := nullif(btrim(coalesce(note, '')), '');
  member_language text;
  reason_text text;
begin
  if not (select access.is_staff()) then
    raise exception 'not_allowed';
  end if;
  perform set_config('kc.business_review', 'on', true);
  select * into req from public.verification_requests r
  where r.id = request and r.level = 2 and r.business_id is not null for update;
  if not found then
    return 'not_found';
  end if;
  if req.status <> 'pending' then
    return 'already_decided';
  end if;
  if approve then
    update public.verification_requests
    set status = 'approved', reviewer_id = auth.uid(), decided_at = now() where id = request;
    update public.businesses set level = 2, status = 'approved' where id = req.business_id;
    perform private.notify(req.member_id, 'B1', jsonb_build_object('level', 2));
    insert into private.audit_log (actor_staff_id, action, target_type, target_id, before, after, ip_address)
    values (auth.uid(), 'business.verification_approved', 'verification_requests', request,
            jsonb_build_object('status', 'pending'),
            jsonb_build_object('status', 'approved', 'level', 2, 'business_id', req.business_id),
            private.request_ip());
    return 'ok';
  end if;

  select * into reason_row from public.rejection_reasons rr
  where rr.code = decide_business_verification.reason_code and rr.for_business;
  if not found or (reason_row.needs_note and clean_note is null) then
    return 'reason_required';
  end if;
  if clean_note is not null and private.holds_contact_details(jsonb_build_object('note', clean_note)) then
    return 'note_has_contact_details';
  end if;
  select coalesce(p.language, 'en') into member_language from public.member_private p where p.member_id = req.member_id;
  reason_text := case when member_language = 'sw' then reason_row.label_sw else reason_row.label_en end;
  if clean_note is not null then
    reason_text := reason_text || '. ' || clean_note;
  end if;
  update public.verification_requests
  set status = 'rejected', reviewer_id = auth.uid(), decided_at = now(),
      reason_code = reason_row.code, reason_note = clean_note, reason = reason_text
  where id = request;
  update public.businesses set status = 'rejected' where id = req.business_id;
  perform private.notify(req.member_id, 'B2', jsonb_build_object('reason', reason_text));
  insert into private.audit_log (actor_staff_id, action, target_type, target_id, before, after, ip_address)
  values (auth.uid(), 'business.verification_rejected', 'verification_requests', request,
          jsonb_build_object('status', 'pending'),
          jsonb_build_object('status', 'rejected', 'reason_code', reason_row.code, 'business_id', req.business_id),
          private.request_ip());
  return 'ok';
end;
$$;
