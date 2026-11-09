-- Idea details are reachable only through open_idea_details() and the idea-file function, so every open is
-- logged. Blocks and idea status apply to details and files alike. Staff opens and member opens are both
-- written to the audit log, which outlives a deleted member. The file size is the stored object's.

-- A requester no longer reads idea_details directly. Only the owner and staff keep the table policy.
drop policy "requesters past the NDA" on public.idea_details;

-- A requester past the NDA, not revoked, not blocked by the owner, on a published idea.
create or replace function access.has_idea_access(idea uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select access.is_member()) and exists (
    select 1 from public.idea_access_requests r join public.ideas i on i.id = r.idea_id
    where r.idea_id = idea and r.requester_id = auth.uid() and r.status = 'nda_accepted'
      and i.status = 'published' and not access.is_blocked(i.owner_id, auth.uid()));
$$;

-- The name stamped on what a viewer opens: their profile name, a staff name, their username, or the platform name.
create or replace function private.viewer_name(viewer uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select nullif(btrim(p.full_name), '') from public.profiles p where p.member_id = viewer),
                  (select s.full_name from public.staff s where s.id = viewer),
                  (select m.username from public.members m where m.id = viewer),
                  (select s.value #>> '{}' from public.platform_settings s where s.key = 'platform_name'));
$$;

-- Records one open of an idea's details or files. A member's open goes to idea_views (which the investor count
-- reads) and to the audit log; a staff open goes to the audit log only. The audit log keeps both.
create function private.log_idea_open(idea uuid, viewer uuid, view_kind text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  is_staff_viewer boolean := exists (select 1 from public.staff s where s.id = viewer);
begin
  if not is_staff_viewer then
    insert into public.idea_views (idea_id, viewer_id, kind) values (idea, viewer, view_kind);
  end if;
  insert into private.audit_log (actor_member_id, actor_staff_id, action, target_type, target_id, after, ip_address)
  values (case when not is_staff_viewer then viewer end, case when is_staff_viewer then viewer end,
          'idea_views.' || view_kind, 'ideas', idea, jsonb_build_object('kind', view_kind), private.request_ip());
end;
$$;
revoke all on function private.log_idea_open(uuid, uuid, text) from public, anon, authenticated;

-- S26: the details for the owner, staff or a requester past the NDA. Staff may open an idea that is not
-- published; nobody else may. The open is logged for everyone but the owner.
create or replace function access.open_idea_details(idea uuid)
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
    perform private.log_idea_open(idea, auth.uid(), 'detail');
  end if;
  return query
    select i.title, d.description, d.business_model, d.market, d.financials, d.team, mine,
           private.viewer_name(auth.uid()), now()
    from public.ideas i join public.idea_details d on d.idea_id = i.id
    where i.id = idea;
end;
$$;

-- The same rule for a file, used by the idea-file Edge Function with the caller's verified id.
create or replace function private.open_idea_file(viewer uuid, file uuid)
returns table (storage_path text, mime text, file_name text, viewer_name text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  found_file public.idea_files;
  post public.ideas;
  member_ok boolean;
  staff_ok boolean;
begin
  select * into found_file from public.idea_files f where f.id = file;
  if not found then
    return;
  end if;
  select * into post from public.ideas i where i.id = found_file.idea_id;
  member_ok := exists (select 1 from public.members m where m.id = viewer and m.status = 'approved');
  staff_ok := exists (select 1 from public.staff s where s.id = viewer and s.active);
  if not ((member_ok and post.owner_id = viewer)
          or (member_ok and post.status = 'published'
              and exists (select 1 from public.idea_access_requests r
                          where r.idea_id = post.id and r.requester_id = viewer and r.status = 'nda_accepted')
              and not access.is_blocked(post.owner_id, viewer))
          or staff_ok) then
    return;
  end if;
  if post.owner_id <> viewer then
    perform private.log_idea_open(post.id, viewer, 'download');
  end if;
  return query select found_file.storage_path, found_file.mime, found_file.file_name, private.viewer_name(viewer);
end;
$$;

-- The owner records an uploaded file. The size is the stored object's, never the one the app reports, so the
-- 20 MB total per idea holds. The size argument is ignored.
create or replace function access.add_idea_file(idea uuid, file_name text, storage_path text, size int)
returns table (result text, file_id uuid)
language plpgsql volatile security definer set search_path = '' as $$
declare
  clean_name text := btrim(coalesce(file_name, ''));
  kind text := case substring(coalesce(storage_path, '') from '\.([a-z]+)$')
                 when 'pdf' then 'application/pdf' when 'jpg' then 'image/jpeg' when 'png' then 'image/png' end;
  stored_size bigint;
  saved uuid;
begin
  if idea is null or not access.idea_file_writable(storage_path) or split_part(storage_path, '/', 1) <> idea::text then
    return query select 'not_allowed'::text, null::uuid; return;
  end if;
  if char_length(clean_name) not between 1 and 200 then
    return query select 'invalid_name'::text, null::uuid; return;
  end if;
  select nullif(o.metadata ->> 'size', '')::bigint into stored_size
  from storage.objects o where o.bucket_id = 'idea-files' and o.name = storage_path;
  if stored_size is null or stored_size < 1 then
    return query select 'invalid_file'::text, null::uuid; return;
  end if;
  if stored_size > 20971520
     or (select coalesce(sum(f.size), 0) from public.idea_files f where f.idea_id = idea) + stored_size > 20971520 then
    return query select 'too_large'::text, null::uuid; return;
  end if;
  insert into public.idea_files (idea_id, storage_path, file_name, mime, size)
  values (idea, storage_path, clean_name, kind, stored_size) returning id into saved;
  return query select 'ok'::text, saved;
end;
$$;
