alter table public.business_private
  add column region_id uuid references public.regions (id),
  add column district_id uuid references public.districts (id);

alter table public.verification_documents drop constraint verification_documents_kind_check;
alter table public.verification_documents add constraint verification_documents_kind_check
  check (kind in ('face_photo', 'id_photo', 'brela', 'tin', 'licence', 'directorship', 'authorisation_letter', 'address_proof'));

alter table public.rejection_reasons add column for_poster boolean not null default false;
update public.rejection_reasons set for_poster = true where code = 'other';
insert into public.rejection_reasons (code, label_en, label_sw, sort, needs_note, for_identity, for_business, for_poster) values
  ('directorship_unclear', 'The document does not show you are a director or authorised',
   'Hati haionyeshi kuwa wewe ni mkurugenzi au umeidhinishwa', 21, false, false, false, true),
  ('authorisation_unsigned', 'The authorisation letter is not signed by a director',
   'Barua ya idhini haijasainiwa na mkurugenzi', 22, false, false, false, true),
  ('address_proof_old', 'The address proof is older than 3 months',
   'Uthibitisho wa anwani una zaidi ya miezi 3', 23, false, false, false, true),
  ('address_mismatch', 'The address does not match the proof',
   'Anwani haifanani na uthibitisho', 24, false, false, false, true);

create or replace function private.check_reason_scope() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.reason_code is not null and new.reason_code is distinct from old.reason_code
     and not exists (select 1 from public.rejection_reasons r
                     where r.code = new.reason_code
                       and case when new.business_id is null then r.for_identity
                                when new.level = 3 then r.for_poster
                                else r.for_business end) then
    raise exception 'that reason does not apply to this kind of request';
  end if;
  return new;
end;
$$;

create function access.submit_poster_verification(
  proof_kind text, proof_path text, address text, region uuid, district uuid, address_proof_path text
) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  clean_address text := btrim(coalesce(address, ''));
  owned public.businesses;
  created uuid;
  paths text[] := array[proof_path, address_proof_path];
begin
  if not (select access.is_member()) then
    raise exception 'not_allowed';
  end if;
  perform pg_advisory_xact_lock(hashtext('business:' || me::text));
  if exists (select 1 from public.verification_requests v
             where v.member_id = me and v.level = 3 and v.status = 'pending') then
    return 'already_pending';
  end if;
  if exists (select 1 from public.verification_requests v
             where v.member_id = me and v.level = 3 and v.status = 'approved') then
    return 'already_approved';
  end if;
  select * into owned from public.businesses b where b.member_id = me for update;
  if not found or owned.status <> 'approved'
     or not exists (select 1 from public.verification_requests v
                    where v.business_id = owned.id and v.level = 2 and v.status = 'approved') then
    return 'level2_required';
  end if;
  if proof_kind is null or proof_kind not in ('directorship', 'authorisation_letter') then
    return 'invalid_proof_kind';
  end if;
  if char_length(clean_address) not between 5 and 300 then return 'invalid_address'; end if;
  if private.holds_contact_details(jsonb_build_object('text', clean_address)) then
    return 'contact_details';
  end if;
  if not exists (select 1 from public.districts d where d.id = district and d.region_id = region) then
    return 'invalid_region';
  end if;
  if exists (select 1 from unnest(paths) p where p is null or split_part(p, '/', 1) <> me::text
                or split_part(p, '/', 2) = '' or split_part(p, '/', 3) <> '')
     or (select count(distinct p) from unnest(paths) p) <> 2
     or (select count(*) from storage.objects o
         where o.bucket_id = 'business-documents' and o.name = any (paths)) <> 2
     or exists (select 1 from public.verification_documents x where x.storage_path = any (paths)) then
    return 'documents_missing';
  end if;

  update public.business_private
  set address = clean_address, region_id = region, district_id = district
  where business_id = owned.id;
  insert into public.verification_requests (member_id, level, business_id)
  values (me, 3, owned.id) returning id into created;
  insert into public.verification_documents (request_id, kind, storage_path) values
    (created, proof_kind, proof_path), (created, 'address_proof', address_proof_path);
  insert into private.audit_log (actor_member_id, action, target_type, target_id, after, ip_address)
  values (me, 'business.verification_submitted', 'verification_requests', created,
          jsonb_build_object('business_id', owned.id, 'level', 3, 'address', clean_address,
                             'region_id', region, 'district_id', district), private.request_ip());
  return 'ok';
end;
$$;

create function access.my_poster_verification()
returns table (request_status text, reason text, submitted_at timestamptz, decided_at timestamptz,
               proof_kind text, address text, region_id uuid, district_id uuid)
language sql stable security definer set search_path = '' as $$
  select v.status, v.reason, v.submitted_at, v.decided_at, d.kind, p.address, p.region_id, p.district_id
  from public.businesses b
  join public.business_private p on p.business_id = b.id
  left join lateral (select r.id, r.status, r.reason, r.submitted_at, r.decided_at from public.verification_requests r
                     where r.business_id = b.id and r.level = 3 order by r.submitted_at desc limit 1) v on true
  left join lateral (select x.kind from public.verification_documents x
                     where x.request_id = v.id and x.kind in ('directorship', 'authorisation_letter') limit 1) d on true
  where b.member_id = auth.uid() and (select access.is_member());
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
  where r.id = request and r.level in (2, 3) and r.business_id is not null for update;
  if not found then
    return 'not_found';
  end if;
  if req.status <> 'pending' then
    return 'already_decided';
  end if;
  if approve then
    update public.verification_requests
    set status = 'approved', reviewer_id = auth.uid(), decided_at = now() where id = request;
    update public.businesses
    set level = req.level, status = case when req.level = 2 then 'approved' else status end
    where id = req.business_id;
    perform private.notify(req.member_id, 'B1', jsonb_build_object('level', req.level));
    insert into private.audit_log (actor_staff_id, action, target_type, target_id, before, after, ip_address)
    values (auth.uid(), 'business.verification_approved', 'verification_requests', request,
            jsonb_build_object('status', 'pending'),
            jsonb_build_object('status', 'approved', 'level', req.level, 'business_id', req.business_id),
            private.request_ip());
    return 'ok';
  end if;

  select * into reason_row from public.rejection_reasons rr
  where rr.code = decide_business_verification.reason_code
    and case when req.level = 3 then rr.for_poster else rr.for_business end;
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
  if req.level = 2 then
    update public.businesses set status = 'rejected' where id = req.business_id;
  end if;
  perform private.notify(req.member_id, 'B2', jsonb_build_object('reason', reason_text));
  insert into private.audit_log (actor_staff_id, action, target_type, target_id, before, after, ip_address)
  values (auth.uid(), 'business.verification_rejected', 'verification_requests', request,
          jsonb_build_object('status', 'pending'),
          jsonb_build_object('status', 'rejected', 'level', req.level, 'reason_code', reason_row.code,
                             'business_id', req.business_id),
          private.request_ip());
  return 'ok';
end;
$$;

revoke all on function access.submit_poster_verification(text, text, text, uuid, uuid, text),
  access.my_poster_verification() from public, anon;
grant execute on function access.submit_poster_verification(text, text, text, uuid, uuid, text),
  access.my_poster_verification() to authenticated;

create function public.submit_poster_verification(
  proof_kind text, proof_path text, address text, region uuid, district uuid, address_proof_path text
) returns text
language sql volatile security invoker set search_path = '' as $$
  select access.submit_poster_verification(proof_kind, proof_path, address, region, district, address_proof_path);
$$;
create function public.my_poster_verification()
returns table (request_status text, reason text, submitted_at timestamptz, decided_at timestamptz,
               proof_kind text, address text, region_id uuid, district_id uuid)
language sql stable security invoker set search_path = '' as $$
  select * from access.my_poster_verification();
$$;
revoke all on function public.submit_poster_verification(text, text, text, uuid, uuid, text),
  public.my_poster_verification() from public, anon;
grant execute on function public.submit_poster_verification(text, text, text, uuid, uuid, text),
  public.my_poster_verification() to authenticated;
