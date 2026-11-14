-- R28 (decided 14 Nov 2026, PRD section 6, REG-8): Verify your identity in the profile. The terms of use and the
-- privacy notice are accepted when the account is made (S01a, or S07 for the email route), so sending the steps checks
-- the member's acceptances. An account with no phone yet (Google) gives one in About you. A8 reminds an account once,
-- 3 days after it got in, while it has sent nothing.

create or replace function private.submit_registration(member uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  draft jsonb;
  chosen text[];
  request uuid;
  face_path text := member::text || '/face';
  id_path text := member::text || '/id';
  typed text;
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
  if (select p.phone from public.member_private p where p.member_id = member) is null then
    typed := regexp_replace(coalesce(draft ->> 'phone', ''), '[\s()-]', '', 'g');
    if typed ~ '^0[67][0-9]{8}$' then typed := '+255' || substr(typed, 2);
    elsif typed ~ '^\+?255[0-9]{9}$' then typed := '+255' || right(typed, 9);
    end if;
    if typed !~ '^\+255[0-9]{9}$' then
      return 'missing_phone';
    end if;
    update public.member_private set phone = typed where member_id = member;
  end if;
  if not exists (select 1 from public.member_private where member_id = member and id_fingerprint is not null) then
    return 'missing_identity';
  end if;
  if (select count(*) from storage.objects
      where bucket_id = 'identity-documents' and name in (face_path, id_path)) < 2 then
    return 'missing_photos';
  end if;
  if exists (select 1 from unnest(array['terms', 'privacy']) k
             where access.current_legal_text_id(k) is not null
               and not exists (select 1 from public.legal_acceptances a
                               where a.member_id = member and a.legal_text_id = access.current_legal_text_id(k))) then
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

  update public.members set status = 'pending' where id = member and status = 'signed_in';
  update public.registration_drafts set submitted_at = now() where member_id = member;
  perform private.notify(member, 'A1', '{}');
  return 'ok';
end $$;

create function private.remind_unfinished_verification(run_at timestamptz default now()) returns int
language plpgsql security definer set search_path = '' as $$
declare
  reminded int := 0;
  who uuid;
begin
  for who in
    select m.id from public.members m
    where m.status in ('signed_in', 'pending')
      and m.created_at <= run_at - interval '3 days'
      and m.created_at > run_at - interval '7 days'
      and not exists (select 1 from public.verification_requests r where r.member_id = m.id and r.level = 1)
      and not exists (select 1 from public.notifications n where n.member_id = m.id and n.kind = 'A8')
  loop
    perform private.notify(who, 'A8', '{}');
    reminded := reminded + 1;
  end loop;
  return reminded;
end $$;
revoke all on function private.remind_unfinished_verification(timestamptz) from public, anon, authenticated;

select cron.schedule('remind-unfinished-verification', '0 6 * * *',
  $job$ select private.remind_unfinished_verification() $job$);

create function access.my_phone_missing() returns boolean
language sql stable security definer set search_path = '' as $$
  select access.otp_verified()
     and exists (select 1 from public.member_private p where p.member_id = auth.uid() and p.phone is null);
$$;
revoke all on function access.my_phone_missing() from public, anon;
grant execute on function access.my_phone_missing() to authenticated;
create function public.my_phone_missing() returns boolean
language sql stable security invoker set search_path = '' as $$ select access.my_phone_missing(); $$;
revoke all on function public.my_phone_missing() from public, anon;
grant execute on function public.my_phone_missing() to authenticated;
