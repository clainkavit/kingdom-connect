-- I05: the idea details page (S26) and its files. Only the owner, staff and requesters past the NDA (not
-- revoked) open them. Every open by someone other than the owner is logged in idea_views. Files are never read
-- straight from storage: the idea-file Edge Function checks access through private.open_idea_file(), logs the
-- download and returns a PDF stamped with the viewer's name and date on every page.

create table public.idea_files (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.ideas (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png')),
  size int not null check (size between 1 and 20971520),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idea_files_idea on public.idea_files (idea_id);
create trigger set_updated_at before update on public.idea_files
  for each row execute function private.set_updated_at();
create trigger audit after insert or update or delete on public.idea_files
  for each row execute function private.log_change();
alter table public.idea_files enable row level security;
revoke all on public.idea_files from anon, authenticated;
create policy "base rule" on public.idea_files as restrictive for all to authenticated
  using ((select access.is_member()) or (select access.is_staff()))
  with check ((select access.is_member()) or (select access.is_staff()));

-- Whether a member owns an idea.
create function access.owns_idea(idea uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select access.is_member())
     and exists (select 1 from public.ideas i where i.id = idea and i.owner_id = auth.uid());
$$;

-- The file list (no storage path) for whoever may read the details.
grant select (id, idea_id, file_name, mime, size, created_at) on public.idea_files to authenticated;
create policy "whoever reads the details" on public.idea_files for select to authenticated
  using (access.owns_idea(idea_id) or access.has_idea_access(idea_id) or (select access.is_staff()));

-- Files: PDF, JPEG or PNG at <idea id>/<file id>.<ext>, 20 MB in all per idea. The owner uploads and removes;
-- nobody reads from the bucket directly.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('idea-files', 'idea-files', false, 20971520, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create function access.idea_file_writable(path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f-]{36}\.(pdf|jpg|png)$'
    then exists (select 1 from public.ideas i
                 where i.id = split_part(path, '/', 1)::uuid and i.owner_id = auth.uid()
                   and i.status in ('draft', 'pending_moderation', 'published')
                   and (select access.is_member()))
    else false
  end;
$$;
revoke all on function access.owns_idea(uuid), access.idea_file_writable(text) from public, anon;
grant execute on function access.owns_idea(uuid), access.idea_file_writable(text) to authenticated;

create policy "idea files: the owner uploads" on storage.objects for insert to authenticated
  with check (bucket_id = 'idea-files' and access.idea_file_writable(name));
create policy "idea files: the owner removes" on storage.objects for delete to authenticated
  using (bucket_id = 'idea-files' and access.idea_file_writable(name));

-- The owner records an uploaded file. The 20 MB counts every file of the idea.
create function access.add_idea_file(idea uuid, file_name text, storage_path text, size int)
returns table (result text, file_id uuid)
language plpgsql volatile security definer set search_path = '' as $$
declare
  clean_name text := btrim(coalesce(file_name, ''));
  kind text := case substring(coalesce(storage_path, '') from '\.([a-z]+)$')
                 when 'pdf' then 'application/pdf' when 'jpg' then 'image/jpeg' when 'png' then 'image/png' end;
  saved uuid;
begin
  if idea is null or not access.idea_file_writable(storage_path) or split_part(storage_path, '/', 1) <> idea::text then
    return query select 'not_allowed'::text, null::uuid; return;
  end if;
  if char_length(clean_name) not between 1 and 200 then
    return query select 'invalid_name'::text, null::uuid; return;
  end if;
  if size is null or size < 1 then
    return query select 'invalid_file'::text, null::uuid; return;
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'idea-files' and o.name = storage_path) then
    return query select 'invalid_file'::text, null::uuid; return;
  end if;
  if (select coalesce(sum(f.size), 0) from public.idea_files f where f.idea_id = idea) + size > 20971520 then
    return query select 'too_large'::text, null::uuid; return;
  end if;
  insert into public.idea_files (idea_id, storage_path, file_name, mime, size)
  values (idea, storage_path, clean_name, kind, size) returning id into saved;
  return query select 'ok'::text, saved;
end;
$$;

-- The owner removes a file. Returns its storage path so the app removes the object too.
create function access.remove_idea_file(file uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  found_file public.idea_files;
begin
  select * into found_file from public.idea_files f where f.id = file;
  if not found or not access.owns_idea(found_file.idea_id) then
    return null;
  end if;
  delete from public.idea_files where id = file;
  return found_file.storage_path;
end;
$$;

-- The name stamped on what a viewer opens: their profile name, a staff name, or their username.
create function private.viewer_name(viewer uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select nullif(btrim(p.full_name), '') from public.profiles p where p.member_id = viewer),
                  (select s.full_name from public.staff s where s.id = viewer),
                  (select m.username from public.members m where m.id = viewer),
                  'Kingdom Connect');
$$;

-- S26: the details for the owner, staff or a requester past the NDA, with what to stamp on them. Anyone else
-- gets no row. Opening is logged for everyone but the owner.
create function access.open_idea_details(idea uuid)
returns table (title text, description text, business_model text, market text, financials text, team text,
               is_owner boolean, viewer_name text, opened_at timestamptz)
language plpgsql volatile security definer set search_path = '' as $$
declare
  mine boolean := access.owns_idea(idea);
begin
  if not (mine or access.has_idea_access(idea) or (select access.is_staff())) then
    return;
  end if;
  if not mine then
    insert into public.idea_views (idea_id, viewer_id, kind) values (idea, auth.uid(), 'detail');
  end if;
  return query
    select i.title, d.description, d.business_model, d.market, d.financials, d.team, mine,
           private.viewer_name(auth.uid()), now()
    from public.ideas i join public.idea_details d on d.idea_id = i.id
    where i.id = idea;
end;
$$;

-- Used by the idea-file Edge Function only, with the caller's verified id. Checks the same rule as the details,
-- logs the download (not the owner's) and returns what the function needs to stamp the file.
create function private.open_idea_file(viewer uuid, file uuid)
returns table (storage_path text, mime text, file_name text, viewer_name text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  found_file public.idea_files;
  owner uuid;
  member_ok boolean;
begin
  select * into found_file from public.idea_files f where f.id = file;
  if not found then
    return;
  end if;
  select i.owner_id into owner from public.ideas i where i.id = found_file.idea_id;
  member_ok := exists (select 1 from public.members m where m.id = viewer and m.status = 'approved');
  if not ((member_ok and owner = viewer)
          or (member_ok and exists (select 1 from public.idea_access_requests r
                                    where r.idea_id = found_file.idea_id and r.requester_id = viewer
                                      and r.status = 'nda_accepted')
              and not access.is_blocked(owner, viewer))
          or exists (select 1 from public.staff s where s.id = viewer and s.active)) then
    return;
  end if;
  if owner <> viewer then
    insert into public.idea_views (idea_id, viewer_id, kind) values (found_file.idea_id, viewer, 'download');
  end if;
  return query select found_file.storage_path, found_file.mime, found_file.file_name, private.viewer_name(viewer);
end;
$$;
revoke all on function private.open_idea_file(uuid, uuid), private.viewer_name(uuid) from public, anon, authenticated;

-- investor_view_count() counts distinct investors, so a detail open or a download never counts one twice.
revoke all on function access.add_idea_file(uuid, text, text, int), access.remove_idea_file(uuid),
  access.open_idea_details(uuid) from public, anon;
grant execute on function access.add_idea_file(uuid, text, text, int), access.remove_idea_file(uuid),
  access.open_idea_details(uuid) to authenticated;

create function public.add_idea_file(idea uuid, file_name text, storage_path text, size int)
returns table (result text, file_id uuid)
language sql volatile security invoker set search_path = '' as $$
  select * from access.add_idea_file(idea, file_name, storage_path, size);
$$;
create function public.remove_idea_file(file uuid) returns text
language sql volatile security invoker set search_path = '' as $$ select access.remove_idea_file(file); $$;
create function public.open_idea_details(idea uuid)
returns table (title text, description text, business_model text, market text, financials text, team text,
               is_owner boolean, viewer_name text, opened_at timestamptz)
language sql volatile security invoker set search_path = '' as $$ select * from access.open_idea_details(idea); $$;
revoke all on function public.add_idea_file(uuid, text, text, int), public.remove_idea_file(uuid),
  public.open_idea_details(uuid) from public, anon;
grant execute on function public.add_idea_file(uuid, text, text, int), public.remove_idea_file(uuid),
  public.open_idea_details(uuid) to authenticated;
