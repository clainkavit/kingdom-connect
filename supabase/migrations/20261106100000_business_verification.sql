create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null unique references public.members (id),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  sector_id uuid not null references public.sectors (id),
  size text not null check (size in ('micro', 'small', 'medium', 'large')),
  description text check (char_length(description) <= 1000),
  logo_path text,
  level int check (level in (2, 3)),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.businesses
  for each row execute function private.set_updated_at();
create trigger audit after insert or update on public.businesses
  for each row execute function private.log_change();

create table public.business_private (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  brela_no text not null check (char_length(brela_no) between 3 and 40),
  tin text not null check (tin ~ '^[0-9]{3}-[0-9]{3}-[0-9]{3}$'),
  licence_no text not null check (char_length(licence_no) between 3 and 40),
  licence_expires_on date not null,
  address text check (char_length(address) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.business_private
  for each row execute function private.set_updated_at();

alter table public.verification_requests add column business_id uuid references public.businesses (id);
create index verification_requests_business on public.verification_requests (business_id) where business_id is not null;

alter table public.rejection_reasons
  add column for_identity boolean not null default true,
  add column for_business boolean not null default false;
update public.rejection_reasons set for_business = true where code = 'other';
insert into public.rejection_reasons (code, label_en, label_sw, sort, needs_note, for_identity, for_business) values
  ('business_documents_unclear', 'A document is not clear enough to read', 'Hati moja haisomeki vizuri', 11, false, false, true),
  ('business_name_mismatch', 'The business name does not match the documents', 'Jina la biashara halilingani na hati', 12, false, false, true),
  ('brela_mismatch', 'The BRELA number does not match the certificate', 'Namba ya BRELA haifanani na cheti', 13, false, false, true),
  ('tin_mismatch', 'The TIN does not match the TRA certificate', 'TIN haifanani na cheti cha TRA', 14, false, false, true),
  ('licence_expired', 'The business licence has expired', 'Leseni ya biashara imeisha muda wake', 15, false, false, true),
  ('licence_mismatch', 'The licence does not match the business', 'Leseni haifanani na biashara', 16, false, false, true);

alter table public.businesses enable row level security;
alter table public.business_private enable row level security;
revoke all on public.businesses, public.business_private from anon, authenticated;
grant select on public.businesses, public.business_private to authenticated;
create policy "base rule" on public.businesses as restrictive for all to authenticated
  using ((select access.is_member()) or (select access.is_staff()))
  with check ((select access.is_member()) or (select access.is_staff()));
create policy "base rule" on public.business_private as restrictive for all to authenticated
  using ((select access.is_member()) or (select access.is_staff()))
  with check ((select access.is_member()) or (select access.is_staff()));
create policy "owner, staff, or an approved business" on public.businesses for select to authenticated
  using (member_id = (select auth.uid()) or (select access.is_staff()) or (status = 'approved' and level >= 2));
create policy "owner or staff" on public.business_private for select to authenticated
  using ((select access.is_staff())
         or exists (select 1 from public.businesses b where b.id = business_id and b.member_id = (select auth.uid())));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-documents', 'business-documents', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create function access.business_file_writable(path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select access.is_member()) and split_part(path, '/', 1) = auth.uid()::text
     and split_part(path, '/', 2) <> '' and split_part(path, '/', 3) = '';
$$;
create function access.business_file_removable(path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select access.is_member()) and split_part(path, '/', 1) = auth.uid()::text
     and not exists (select 1 from public.verification_documents d where d.storage_path = path);
$$;
revoke all on function access.business_file_writable(text), access.business_file_removable(text) from public, anon;
grant execute on function access.business_file_writable(text), access.business_file_removable(text) to authenticated;

create policy "business files: a member uploads into their own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'business-documents' and access.business_file_writable(name));
create policy "business files: the owner or staff read" on storage.objects for select to authenticated
  using (bucket_id = 'business-documents'
         and ((select access.is_staff()) or (storage.foldername(name))[1] = (select auth.uid())::text));
create policy "business files: the owner removes an unsent file" on storage.objects for delete to authenticated
  using (bucket_id = 'business-documents' and access.business_file_removable(name));

create function access.submit_business_verification(
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
  if exists (select 1 from unnest(paths) p where p is null or split_part(p, '/', 1) <> me::text)
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

create function access.my_business()
returns table (business_id uuid, name text, sector_id uuid, size text, description text, brela_no text, tin text,
               licence_no text, licence_expires_on date, level int, business_status text, request_status text,
               reason text, submitted_at timestamptz, decided_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.id, b.name, b.sector_id, b.size, b.description, p.brela_no, p.tin, p.licence_no, p.licence_expires_on,
         b.level, b.status, v.status, v.reason, v.submitted_at, v.decided_at
  from public.businesses b
  join public.business_private p on p.business_id = b.id
  left join lateral (select r.status, r.reason, r.submitted_at, r.decided_at from public.verification_requests r
                     where r.business_id = b.id and r.level = 2 order by r.submitted_at desc limit 1) v on true
  where b.member_id = auth.uid() and (select access.is_member());
$$;

create function access.decide_business_verification(request uuid, approve boolean, reason_code text, note text)
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

revoke all on function access.submit_business_verification(text, uuid, text, text, text, text, text, date, text, text, text),
  access.my_business(), access.decide_business_verification(uuid, boolean, text, text) from public, anon;
grant execute on function access.submit_business_verification(text, uuid, text, text, text, text, text, date, text, text, text),
  access.my_business(), access.decide_business_verification(uuid, boolean, text, text) to authenticated;

create function public.submit_business_verification(
  business_name text, sector uuid, size text, description text, brela_no text, tin text, licence_no text,
  licence_expires_on date, brela_path text, tin_path text, licence_path text
) returns text
language sql volatile security invoker set search_path = '' as $$
  select access.submit_business_verification(business_name, sector, size, description, brela_no, tin, licence_no,
                                             licence_expires_on, brela_path, tin_path, licence_path);
$$;
create function public.my_business()
returns table (business_id uuid, name text, sector_id uuid, size text, description text, brela_no text, tin text,
               licence_no text, licence_expires_on date, level int, business_status text, request_status text,
               reason text, submitted_at timestamptz, decided_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select * from access.my_business();
$$;
create function public.decide_business_verification(request uuid, approve boolean, reason_code text default null,
                                                    note text default null) returns text
language sql volatile security invoker set search_path = '' as $$
  select access.decide_business_verification(request, approve, reason_code, note);
$$;
revoke all on function public.submit_business_verification(text, uuid, text, text, text, text, text, date, text, text, text),
  public.my_business(), public.decide_business_verification(uuid, boolean, text, text) from public, anon;
grant execute on function public.submit_business_verification(text, uuid, text, text, text, text, text, date, text, text, text),
  public.my_business(), public.decide_business_verification(uuid, boolean, text, text) to authenticated;
