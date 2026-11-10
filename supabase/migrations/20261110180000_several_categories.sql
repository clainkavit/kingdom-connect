-- R19: a member ticks every category that applies at registration (decided 10 Nov 2026, #161): Professional,
-- Businessperson and Other. Entrepreneur is no longer offered; a member who registered with it keeps it. Each
-- category unlocks its own badge only after its own proof, as before. members.category stays, holding the first
-- category, for the screens that still read one; it follows categories and goes when every screen reads the list.

alter table public.members add column categories text[] not null default '{}'
  check (categories <@ array['professional', 'businessperson', 'entrepreneur', 'other']);
update public.members set categories = array[category] where category is not null;

create function private.sync_member_category() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' and cardinality(new.categories) = 0 and new.category is not null then
    new.categories := array[new.category];
  end if;
  if new.status = 'deleted' then
    new.categories := '{}';
  end if;
  new.category := new.categories[1];
  return new;
end $$;
create trigger sync_member_category before insert or update of categories, status on public.members
  for each row execute function private.sync_member_category();
revoke all on function private.sync_member_category() from public, anon, authenticated;

-- The categories a registration draft ticks: its list, or the one category of a draft saved before 10 Nov 2026.
create function private.draft_categories(draft jsonb) returns text[]
language sql immutable set search_path = '' as $$
  select case
    when jsonb_typeof(draft -> 'categories') = 'array' and jsonb_array_length(draft -> 'categories') > 0
      then (select array_agg(distinct c order by c) from jsonb_array_elements_text(draft -> 'categories') c)
    when coalesce(draft ->> 'category', '') <> '' then array[draft ->> 'category']
    else '{}'::text[] end;
$$;
revoke all on function private.draft_categories(jsonb) from public, anon, authenticated;

create or replace function private.submit_registration(member uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  draft jsonb;
  chosen text[];
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

  update public.registration_drafts set submitted_at = now() where member_id = member;
  perform private.notify(member, 'A1', '{}');
  return 'ok';
end $$;
