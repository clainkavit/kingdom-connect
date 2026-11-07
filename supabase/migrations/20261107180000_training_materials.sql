-- T02: learning materials. A training's poster (and staff) add PDFs and links; only members registered for
-- that training, the poster and staff can see them or open the files.

create table public.training_materials (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references public.trainings (id) on delete cascade,
  kind text not null check (kind in ('file', 'link')),
  title text not null check (char_length(btrim(title)) between 2 and 120),
  storage_path text unique,
  size int check (size between 1 and 20971520),
  url text check (url ~ '^https://[^[:space:]]+$' and char_length(url) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'file') = (storage_path is not null and size is not null and url is null)),
  check ((kind = 'link') = (url is not null and storage_path is null))
);
create index training_materials_training on public.training_materials (training_id, created_at);

create trigger set_updated_at before update on public.training_materials
  for each row execute function private.set_updated_at();
alter table public.training_materials enable row level security;
revoke all on public.training_materials from anon, authenticated;
create policy "base rule" on public.training_materials as restrictive for all to authenticated
  using ((select access.is_member()) or (select access.is_staff()))
  with check ((select access.is_member()) or (select access.is_staff()));
create trigger audit after insert or update or delete on public.training_materials
  for each row execute function private.log_change();

-- Who may open a training's materials: members registered for it (or marked attended), its poster, staff.
create function access.can_open_training(training uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select access.is_staff())
      or ((select access.is_member())
          and (exists (select 1 from public.trainings tr where tr.id = training and tr.poster_member_id = auth.uid())
               or exists (select 1 from public.registrations r
                          where r.training_id = training and r.member_id = auth.uid()
                            and r.status in ('registered', 'attended'))));
$$;

-- Who may add or remove a training's materials: its poster (posting not paused) and staff.
create function access.can_manage_training(training uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select access.is_staff())
      or ((select access.can_post_training())
          and exists (select 1 from public.trainings tr where tr.id = training and tr.poster_member_id = auth.uid()));
$$;

grant select (id, training_id, kind, title, storage_path, size, url, created_at, updated_at)
  on public.training_materials to authenticated;
create policy "registered members, the poster and staff" on public.training_materials for select to authenticated
  using ((select access.can_open_training(training_id)));

create function access.add_training_material(training uuid, kind text, title text, storage_path text, size int,
                                             url text)
returns table (result text, material_id uuid)
language plpgsql volatile security definer set search_path = '' as $$
declare
  clean_title text := btrim(coalesce(title, ''));
  clean_url text := nullif(btrim(coalesce(url, '')), '');
  saved uuid;
begin
  if training is null or not access.can_manage_training(training) then
    return query select 'not_allowed'::text, null::uuid; return;
  end if;
  if kind is null or kind not in ('file', 'link') then
    return query select 'invalid_kind'::text, null::uuid; return;
  end if;
  if char_length(clean_title) not between 2 and 120 then
    return query select 'invalid_title'::text, null::uuid; return;
  end if;
  if private.holds_contact_details(jsonb_build_object('title', clean_title)) then
    return query select 'contact_details'::text, null::uuid; return;
  end if;
  if kind = 'link' then
    if clean_url is null or clean_url !~ '^https://[^[:space:]]+$' or char_length(clean_url) > 500 then
      return query select 'invalid_url'::text, null::uuid; return;
    end if;
    insert into public.training_materials (training_id, kind, title, url)
    values (training, 'link', clean_title, clean_url) returning id into saved;
    return query select 'ok'::text, saved; return;
  end if;

  -- A file: a PDF already uploaded under the training's own folder.
  if storage_path is null or split_part(storage_path, '/', 1) <> training::text
     or storage_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$' then
    return query select 'invalid_file'::text, null::uuid; return;
  end if;
  if size is null or size not between 1 and 20971520 then
    return query select 'file_too_big'::text, null::uuid; return;
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'learning-materials' and o.name = storage_path) then
    return query select 'invalid_file'::text, null::uuid; return;
  end if;
  insert into public.training_materials (training_id, kind, title, storage_path, size)
  values (training, 'file', clean_title, storage_path, size) returning id into saved;
  return query select 'ok'::text, saved;
end;
$$;

create function access.remove_training_material(material uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  found_material public.training_materials;
begin
  select * into found_material from public.training_materials m where m.id = material;
  if not found or not access.can_manage_training(found_material.training_id) then
    return 'not_found';
  end if;
  delete from public.training_materials where id = material;
  return 'ok';
end;
$$;

revoke all on function access.can_open_training(uuid), access.can_manage_training(uuid),
  access.add_training_material(uuid, text, text, text, int, text), access.remove_training_material(uuid)
  from public, anon;
grant execute on function access.can_open_training(uuid), access.can_manage_training(uuid),
  access.add_training_material(uuid, text, text, text, int, text), access.remove_training_material(uuid)
  to authenticated;

create function public.can_manage_training(training uuid) returns boolean
language sql stable security invoker set search_path = '' as $$ select access.can_manage_training(training); $$;
create function public.add_training_material(training uuid, kind text, title text, storage_path text, size int,
                                             url text)
returns table (result text, material_id uuid)
language sql volatile security invoker set search_path = '' as $$
  select * from access.add_training_material(training, kind, title, storage_path, size, url);
$$;
create function public.remove_training_material(material uuid) returns text
language sql volatile security invoker set search_path = '' as $$ select access.remove_training_material(material); $$;
revoke all on function public.can_manage_training(uuid), public.add_training_material(uuid, text, text, text, int, text),
  public.remove_training_material(uuid) from public, anon;
grant execute on function public.can_manage_training(uuid), public.add_training_material(uuid, text, text, text, int, text),
  public.remove_training_material(uuid) to authenticated;

-- Files: PDFs up to 20 MB, at <training id>/<file id>.pdf.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('learning-materials', 'learning-materials', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

create function access.training_file_writable(path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f-]{36}\.pdf$'
    then access.can_manage_training(split_part(path, '/', 1)::uuid)
    else false
  end;
$$;

-- A file opens only while its material row exists and the caller may open that training.
create function access.training_file_readable(path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.training_materials m
                 where m.storage_path = path and access.can_open_training(m.training_id))
      or access.training_file_writable(path);
$$;
revoke all on function access.training_file_writable(text), access.training_file_readable(text) from public, anon;
grant execute on function access.training_file_writable(text), access.training_file_readable(text) to authenticated;

create policy "learning materials: the poster and staff upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'learning-materials' and access.training_file_writable(name));
create policy "learning materials: registered members, the poster and staff open" on storage.objects
  for select to authenticated
  using (bucket_id = 'learning-materials' and access.training_file_readable(name));
create policy "learning materials: the poster and staff remove" on storage.objects for delete to authenticated
  using (bucket_id = 'learning-materials' and access.training_file_writable(name));
