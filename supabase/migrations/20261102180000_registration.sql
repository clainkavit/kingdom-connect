insert into public.platform_settings (key, value) values ('test_data_only', 'false')
on conflict (key) do nothing;

create function access.is_applicant() returns boolean
language sql stable security definer set search_path = '' as $$
  select access.otp_verified()
     and exists (select 1 from public.members m where m.id = auth.uid() and m.status = 'pending');
$$;

create function access.registration_editable() returns boolean
language sql stable security definer set search_path = '' as $$
  select access.is_applicant()
     and not exists (select 1 from public.verification_requests v
                     where v.member_id = auth.uid() and v.level = 1 and v.status = 'pending');
$$;
create function access.request_owner(request uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select member_id from public.verification_requests where id = request;
$$;
grant execute on function access.is_applicant(), access.registration_editable(), access.request_owner(uuid)
  to authenticated, service_role;

alter table public.profiles add column category_details jsonb not null default '{}';

create table public.registration_drafts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null unique default auth.uid() references public.members (id) on delete cascade,
  step int not null default 1 check (step between 1 and 6),
  data jsonb not null default '{}' check (octet_length(data::text) < 20000),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.registration_drafts
  for each row execute function private.set_updated_at();

create table public.verification_documents (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.verification_requests (id) on delete cascade,
  kind text not null check (kind in ('face_photo', 'id_photo', 'brela', 'tin', 'licence', 'directorship', 'authorisation_letter')),
  storage_path text not null,
  delete_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, kind)
);
create trigger set_updated_at before update on public.verification_documents
  for each row execute function private.set_updated_at();

revoke all on public.registration_drafts, public.verification_documents from anon, authenticated;
grant select, insert (step, data), update (step, data) on public.registration_drafts to authenticated;
grant select on public.verification_documents to authenticated;

alter table public.registration_drafts enable row level security;
alter table public.verification_documents enable row level security;

create policy "base rule" on public.registration_drafts as restrictive for all to authenticated
  using ((select access.is_applicant())) with check ((select access.is_applicant()));
create policy "own" on public.registration_drafts for select to authenticated
  using (member_id = (select auth.uid()));
create policy "own, while editable" on public.registration_drafts for insert to authenticated
  with check (member_id = (select auth.uid()) and (select access.registration_editable()));
create policy "own, change while editable" on public.registration_drafts for update to authenticated
  using (member_id = (select auth.uid()) and (select access.registration_editable()))
  with check (member_id = (select auth.uid()));

create policy "base rule" on public.verification_documents as restrictive for all to authenticated
  using ((select access.is_member()) or (select access.is_applicant()) or (select access.is_staff()));
create policy "owner or staff" on public.verification_documents for select to authenticated
  using ((select access.is_staff()) or access.request_owner(request_id) = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('identity-documents', 'identity-documents', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "identity documents: own face and ID photo, while editable" on storage.objects for insert to authenticated
  with check (bucket_id = 'identity-documents'
              and name in ((select auth.uid())::text || '/face', (select auth.uid())::text || '/id')
              and (select access.registration_editable()));
create policy "identity documents: replace own, while editable" on storage.objects for update to authenticated
  using (bucket_id = 'identity-documents'
         and name in ((select auth.uid())::text || '/face', (select auth.uid())::text || '/id')
         and (select access.registration_editable()));
create policy "identity documents: owner or staff" on storage.objects for select to authenticated
  using (bucket_id = 'identity-documents'
         and ((select access.is_staff())
              or ((storage.foldername(name))[1] = (select auth.uid())::text
                  and ((select access.is_applicant()) or (select access.is_member())))));

create function private.guard_test_data_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.key = 'test_data_only' and nullif(current_setting('request.jwt.claims', true), '') is not null then
    raise exception 'test_data_only is set by the environment, not through the API';
  end if;
  return new;
end $$;
create trigger guard_test_data_only before insert or update on public.platform_settings
  for each row execute function private.guard_test_data_only();

create function private.vault_secret(secret_name text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = secret_name;
  if secret is null then
    raise exception 'vault secret % is not set', secret_name;
  end if;
  return secret;
end $$;

create function private.set_identity(member uuid, kind text, number text, expires date default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  normalized text := upper(regexp_replace(coalesce(number, ''), '[\s-]', '', 'g'));
  fingerprint bytea;
  other uuid;
begin
  if not exists (select 1 from public.members where id = member and status = 'pending')
     or exists (select 1 from public.verification_requests
                where member_id = member and level = 1 and status = 'pending') then
    return 'not_editable';
  end if;
  if (select count(*) from private.audit_log
      where action = 'registration.duplicate_id' and target_id = member
        and created_at > now() - interval '1 day') >= 3 then
    return 'too_many';
  end if;
  if kind not in ('nida', 'passport', 'driving_licence', 'voters_id') then
    return 'invalid';
  end if;
  if (kind = 'nida' and normalized !~ '^[0-9]{20}$')
     or (kind <> 'nida' and normalized !~ '^[A-Z0-9]{5,20}$') then
    return 'invalid';
  end if;

  fingerprint := extensions.hmac(kind || ':' || normalized, private.vault_secret('id_fingerprint_key'), 'sha256');
  select member_id into other from public.member_private
  where id_type = kind and id_fingerprint = fingerprint and member_id <> member;
  if found then
    insert into private.audit_log (actor_member_id, action, target_type, target_id, after)
    values (member, 'registration.duplicate_id', 'members', member, jsonb_build_object('duplicate_of', other, 'id_type', kind));
    return 'duplicate';
  end if;

  begin
    update public.member_private
    set id_type = kind,
        id_encrypted = extensions.pgp_sym_encrypt(normalized, private.vault_secret('id_encryption_key')),
        id_fingerprint = fingerprint,
        id_expires_on = expires
    where member_id = member;
  exception when unique_violation then
    insert into private.audit_log (actor_member_id, action, target_type, target_id, after)
    values (member, 'registration.duplicate_id', 'members', member, jsonb_build_object('id_type', kind));
    return 'duplicate';
  end;
  return 'ok';
end $$;

create function private.submit_registration(member uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  draft jsonb;
  request uuid;
  face_path text := member::text || '/face';
  id_path text := member::text || '/id';
begin
  if not exists (select 1 from public.members where id = member and status = 'pending') then
    return 'not_editable';
  end if;
  if exists (select 1 from public.verification_requests
             where member_id = member and level = 1 and status = 'pending') then
    return 'already_submitted';
  end if;
  select data into draft from public.registration_drafts where member_id = member for update;
  if draft is null then
    return 'no_draft';
  end if;
  if coalesce(trim(draft ->> 'fullName'), '') = ''
     or coalesce(trim(draft ->> 'address'), '') = ''
     or coalesce(draft ->> 'category', '') not in ('professional', 'businessperson', 'entrepreneur', 'other')
     or coalesce(draft ->> 'districtId', '') !~ '^[0-9a-f-]{36}$'
     or coalesce(draft ->> 'regionId', '') !~ '^[0-9a-f-]{36}$'
     or not exists (select 1 from public.districts
                    where id = (draft ->> 'districtId')::uuid and region_id = (draft ->> 'regionId')::uuid) then
    return 'incomplete';
  end if;
  if not exists (select 1 from public.member_private where member_id = member and id_fingerprint is not null) then
    return 'missing_identity';
  end if;
  if (select count(*) from storage.objects
      where bucket_id = 'identity-documents' and name in (face_path, id_path)) < 2 then
    return 'missing_photos';
  end if;
  if not coalesce((draft ->> 'acceptTerms')::boolean, false)
     or not coalesce((draft ->> 'acceptPrivacy')::boolean, false) then
    return 'legal_not_accepted';
  end if;

  update public.members set category = draft ->> 'category' where id = member;
  update public.member_private set address = draft ->> 'address' where member_id = member;
  insert into public.profiles (member_id, full_name, region_id, district_id, profession, certifications,
                               study_institution, study_course, study_year, category_details)
  values (member, draft ->> 'fullName', (draft ->> 'regionId')::uuid, (draft ->> 'districtId')::uuid,
          draft #>> '{categoryDetails,profession}', draft #>> '{categoryDetails,certifications}',
          draft #>> '{study,institution}', draft #>> '{study,course}', (draft #>> '{study,year}')::int,
          coalesce(draft -> 'categoryDetails', '{}'))
  on conflict (member_id) do update set
    full_name = excluded.full_name, region_id = excluded.region_id, district_id = excluded.district_id,
    profession = excluded.profession, certifications = excluded.certifications,
    study_institution = excluded.study_institution, study_course = excluded.study_course,
    study_year = excluded.study_year, category_details = excluded.category_details;

  insert into public.verification_requests (member_id, level, duplicate_suspected_of)
  values (member, 1, (select (after ->> 'duplicate_of')::uuid from private.audit_log
                      where action = 'registration.duplicate_id' and target_id = member and after ? 'duplicate_of'
                      order by created_at desc limit 1))
  returning id into request;
  insert into public.verification_documents (request_id, kind, storage_path) values
    (request, 'face_photo', face_path), (request, 'id_photo', id_path);

  insert into public.legal_acceptances (member_id, legal_text_id, context_type, context_id)
  select member, access.current_legal_text_id(k), 'registration', request
  from unnest(array['terms', 'privacy']) k
  where access.current_legal_text_id(k) is not null;

  update public.registration_drafts set submitted_at = now() where member_id = member;
  perform private.notify(member, 'A1', '{}');
  return 'ok';
end $$;

revoke all on function private.vault_secret(text), private.set_identity(uuid, text, text, date),
  private.submit_registration(uuid) from public, anon, authenticated;
