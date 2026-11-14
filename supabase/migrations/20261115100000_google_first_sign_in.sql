-- R26 (decided 14 Nov 2026, PRD section 6, REG-7): get in with Google. The provider is the second step, so a Google
-- session counts as verified for a member or someone new; a staff account always needs the email code. Someone new has no account until S01a, where they choose a username and accept the
-- terms of use and the privacy notice; that makes a signed-in account that looks but does not act (R27). The phone
-- number is collected later, in the verification steps, so it may be empty until then.

alter table public.member_private alter column phone drop not null;

create or replace function private.custom_access_token_hook(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  claims jsonb := event -> 'claims';
  uid uuid := (event ->> 'user_id')::uuid;
  sid uuid := nullif(claims ->> 'session_id', '')::uuid;
  status text := private.account_status(uid);
  oauth boolean := status not in ('staff', 'inactive_staff')
    and exists (select 1 from jsonb_array_elements(coalesce(claims -> 'amr', '[]'::jsonb)) a
                where a ->> 'method' = 'oauth');
begin
  claims := claims
    || jsonb_build_object(
      'otp_verified', oauth or exists (select 1 from private.mfa_sessions v where v.session_id = sid),
      'user_status', status
    );
  return jsonb_set(event, '{claims}', claims);
end $$;

create function access.suggest_username() returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  base text;
  candidate text;
  n int := 1;
begin
  select left(regexp_replace(lower(split_part(u.email, '@', 1)), '[^a-z0-9._]', '', 'g'), 26) into base
  from auth.users u where u.id = auth.uid();
  base := regexp_replace(coalesce(base, ''), '^[^a-z0-9]+', '');
  if char_length(base) < 3 then base := 'member'; end if;
  candidate := base;
  while exists (select 1 from public.members m where m.username = candidate::extensions.citext) loop
    candidate := base || n;
    n := n + 1;
  end loop;
  return candidate;
end $$;

create function access.complete_first_sign_in(username text, accepted uuid[]) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  clean text := lower(btrim(coalesce(username, '')));
  mail text;
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

  select u.email into mail from auth.users u where u.id = me;
  insert into public.members (id, username, status) values (me, clean, 'signed_in');
  insert into public.member_private (member_id, email) values (me, coalesce(mail, ''));
  insert into public.legal_acceptances (member_id, legal_text_id, context_type)
  select me, access.current_legal_text_id(k), 'registration'
  from unnest(array['terms', 'privacy']) k
  where access.current_legal_text_id(k) is not null;
  return 'ok';
exception when unique_violation then
  get stacked diagnostics clash = constraint_name;
  return case when clash = 'member_private_email_unique' then 'email_taken' else 'username_taken' end;
end $$;

revoke all on function access.suggest_username(), access.complete_first_sign_in(text, uuid[]) from public, anon;
grant execute on function access.suggest_username(), access.complete_first_sign_in(text, uuid[]) to authenticated;

create function public.suggest_username() returns text
language sql stable security invoker set search_path = '' as $$ select access.suggest_username(); $$;
create function public.complete_first_sign_in(username text, accepted uuid[]) returns text
language sql volatile security invoker set search_path = '' as $$ select access.complete_first_sign_in(username, accepted); $$;
revoke all on function public.suggest_username(), public.complete_first_sign_in(text, uuid[]) from public, anon;
grant execute on function public.suggest_username(), public.complete_first_sign_in(text, uuid[]) to authenticated;

-- A signed-in account writes the verification steps like an applicant; sending them makes it pending.
create or replace function access.is_applicant() returns boolean
language sql stable security definer set search_path = '' as $$
  select access.otp_verified()
     and exists (select 1 from public.members m where m.id = auth.uid() and m.status in ('pending', 'signed_in'));
$$;

create or replace function private.application_status(member uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  account public.members;
  latest public.verification_requests;
begin
  select * into account from public.members where id = member;
  if not found or account.status not in ('signed_in', 'pending', 'rejected', 'approved') then
    return null;
  end if;
  if account.status = 'signed_in' then
    return jsonb_build_object('state', 'drafting');
  end if;
  if account.status = 'approved' then
    return jsonb_build_object('state', 'approved');
  end if;

  select * into latest from public.verification_requests
  where member_id = member and level = 1
  order by submitted_at desc limit 1;

  if account.status = 'rejected' then
    return jsonb_build_object(
      'state', case when account.resubmissions_used > 0 then 'rejected_final' else 'rejected' end,
      'reason', latest.reason);
  end if;
  if latest.status is distinct from 'pending' then
    return jsonb_build_object('state', 'drafting');
  end if;
  return jsonb_build_object('state', 'under_review');
end $$;

create or replace function private.submit_registration(member uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  draft jsonb;
  chosen text[];
  request uuid;
  face_path text := member::text || '/face';
  id_path text := member::text || '/id';
begin
  if not exists (select 1 from public.members where id = member and status in ('pending', 'signed_in')) then
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
  chosen := private.draft_categories(draft);
  if coalesce(trim(draft ->> 'fullName'), '') = ''
     or coalesce(trim(draft ->> 'address'), '') = ''
     or cardinality(chosen) = 0
     or not chosen <@ array['professional', 'businessperson', 'other']
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

  update public.members set categories = chosen where id = member;
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

  update public.members set status = 'pending' where id = member and status = 'signed_in';
  update public.registration_drafts set submitted_at = now() where member_id = member;
  perform private.notify(member, 'A1', '{}');
  return 'ok';
end $$;

create or replace function private.set_identity(member uuid, kind text, number text, expires date default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  normalized text := upper(regexp_replace(coalesce(number, ''), '[\s-]', '', 'g'));
  fingerprint bytea;
  other uuid;
begin
  if not exists (select 1 from public.members where id = member and status in ('pending', 'signed_in'))
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
