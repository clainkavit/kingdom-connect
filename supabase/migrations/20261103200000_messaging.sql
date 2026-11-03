create table public.message_threads (
  id uuid primary key default gen_random_uuid(),
  member_a uuid not null references public.members (id),
  member_b uuid not null references public.members (id),
  idea_id uuid,
  opportunity_id uuid,
  status text not null default 'active' check (status in ('active', 'reported', 'closed')),
  reported_at timestamptz,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (member_a < member_b),
  unique nulls not distinct (member_a, member_b, idea_id, opportunity_id)
);
create index message_threads_member_b on public.message_threads (member_b);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads (id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.members (id),
  body text not null default '' check (char_length(body) <= 4000),
  deleted_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default now()
);
create index messages_thread on public.messages (thread_id, created_at);

create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size int not null check (size between 1 and 10485760),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index message_attachments_message on public.message_attachments (message_id);

create table public.thread_reads (
  thread_id uuid not null references public.message_threads (id) on delete cascade,
  member_id uuid not null default auth.uid() references public.members (id),
  last_read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (thread_id, member_id)
);

do $$
declare t text;
begin
  foreach t in array array['message_threads', 'messages', 'message_attachments', 'thread_reads'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format($p$create policy "base rule" on public.%I as restrictive for all to authenticated
      using ((select access.is_member()) or (select access.is_staff()))
      with check ((select access.is_member()) or (select access.is_staff()))$p$, t);
  end loop;
end $$;

create function access.can_read_thread(thread uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.message_threads t
                 where t.id = thread
                   and (((select access.is_member()) and auth.uid() in (t.member_a, t.member_b))
                        or ((select access.is_staff()) and t.status = 'reported')));
$$;

create function access.can_send(thread uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.message_threads t
                 where t.id = thread and t.status <> 'closed'
                   and (select access.is_member())
                   and auth.uid() in (t.member_a, t.member_b)
                   and access.is_connected(t.member_a, t.member_b)
                   and not access.is_blocked(t.member_a, t.member_b));
$$;

create function access.thread_file_readable(path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when split_part(path, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then access.can_read_thread(split_part(path, '/', 1)::uuid)
         and exists (select 1 from public.message_attachments a where a.storage_path = path)
    else false
  end;
$$;

create function access.thread_file_writable(path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when split_part(path, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and split_part(path, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then exists (select 1 from public.messages m
                 where m.id = split_part(path, '/', 2)::uuid
                   and m.thread_id = split_part(path, '/', 1)::uuid
                   and m.sender_id = auth.uid() and m.deleted_at is null
                   and access.can_send(m.thread_id))
    else false
  end;
$$;

create function access.thread_file_removable(path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when split_part(path, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then exists (select 1 from public.messages m
                 join public.message_threads t on t.id = m.thread_id
                 where m.id = split_part(path, '/', 2)::uuid and m.thread_id::text = split_part(path, '/', 1)
                   and m.sender_id = auth.uid() and t.status <> 'reported' and (select access.is_member()))
    else false
  end;
$$;

create function access.my_threads()
returns table (thread_id uuid, other_id uuid, full_name text, photo_path text, last_body text,
               last_deleted boolean, last_message_at timestamptz, unread boolean)
language sql stable security definer set search_path = '' as $$
  select t.id, o.other, p.full_name, p.photo_path, last.body, last.deleted_at is not null,
         t.last_message_at,
         exists (select 1 from public.messages m
                 where m.thread_id = t.id and m.sender_id <> auth.uid() and m.deleted_at is null
                   and m.created_at > coalesce((select r.last_read_at from public.thread_reads r
                                                where r.thread_id = t.id and r.member_id = auth.uid()),
                                               '-infinity'))
  from public.message_threads t
  cross join lateral (select case when t.member_a = auth.uid() then t.member_b else t.member_a end as other) o
  left join public.profiles p on p.member_id = o.other
    and not access.is_blocked(o.other, auth.uid())
    and (not p.hidden_from_directory or access.is_connected(o.other, auth.uid()))
  cross join lateral (select m.body, m.deleted_at from public.messages m
                      where m.thread_id = t.id order by m.created_at desc limit 1) last
  where (select access.is_member()) and auth.uid() in (t.member_a, t.member_b)
  order by t.last_message_at desc;
$$;

revoke all on function access.can_read_thread(uuid), access.can_send(uuid), access.thread_file_readable(text),
  access.thread_file_writable(text), access.thread_file_removable(text), access.my_threads() from public, anon;
grant execute on function access.can_read_thread(uuid), access.can_send(uuid), access.thread_file_readable(text),
  access.thread_file_writable(text), access.thread_file_removable(text), access.my_threads() to authenticated;

grant select (id, member_a, member_b, idea_id, opportunity_id, status, reported_at, last_message_at, created_at),
  insert (member_a, member_b) on public.message_threads to authenticated;
grant select (id, thread_id, sender_id, body, deleted_at, created_at), insert (thread_id, body),
  update (deleted_at) on public.messages to authenticated;
grant select (id, message_id, storage_path, file_name, mime, size, created_at),
  insert (message_id, storage_path, file_name, mime, size) on public.message_attachments to authenticated;
grant select (thread_id, member_id, last_read_at), insert (thread_id), update (last_read_at)
  on public.thread_reads to authenticated;

create policy "the two members, or staff once reported" on public.message_threads for select to authenticated
  using (((select access.is_member()) and (select auth.uid()) in (member_a, member_b))
         or ((select access.is_staff()) and status = 'reported'));
create policy "a member opens a thread with a connection" on public.message_threads for insert to authenticated
  with check ((select auth.uid()) in (member_a, member_b) and (select access.is_member())
              and access.is_connected(member_a, member_b) and not access.is_blocked(member_a, member_b));

create policy "whoever can read the thread" on public.messages for select to authenticated
  using (access.can_read_thread(thread_id));
create policy "the sender, while connected and not blocked" on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and access.can_send(thread_id));
create policy "the sender deletes" on public.messages for update to authenticated
  using (sender_id = (select auth.uid())) with check (sender_id = (select auth.uid()));

create policy "whoever can read the thread" on public.message_attachments for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id and access.can_read_thread(m.thread_id)));
create policy "the sender attaches" on public.message_attachments for insert to authenticated
  with check (exists (select 1 from public.messages m
                      where m.id = message_id and m.sender_id = (select auth.uid()) and m.deleted_at is null
                        and access.can_send(m.thread_id)
                        and storage_path like m.thread_id::text || '/' || m.id::text || '/%'));

create policy "your own" on public.thread_reads for select to authenticated
  using (member_id = (select auth.uid()));
create policy "you mark your own" on public.thread_reads for insert to authenticated
  with check (member_id = (select auth.uid()) and access.can_read_thread(thread_id));
create policy "you update your own" on public.thread_reads for update to authenticated
  using (member_id = (select auth.uid())) with check (member_id = (select auth.uid()));

create function private.stamp_read() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.last_read_at := clock_timestamp();
  return new;
end;
$$;
create trigger stamp_read before insert or update on public.thread_reads
  for each row execute function private.stamp_read();

create function private.after_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  thread public.message_threads;
  receiver uuid;
begin
  update public.message_threads set last_message_at = new.created_at where id = new.thread_id
    returning * into thread;
  receiver := case when thread.member_a = new.sender_id then thread.member_b else thread.member_a end;
  if not exists (select 1 from public.notifications n
                 where n.member_id = receiver and n.kind = 'C3'
                   and n.payload ->> 'thread_id' = new.thread_id::text
                   and n.created_at > coalesce((select r.last_read_at from public.thread_reads r
                                                where r.thread_id = new.thread_id and r.member_id = receiver),
                                               '-infinity')) then
    perform private.notify(receiver, 'C3', jsonb_build_object(
      'name', coalesce((select p.full_name from public.profiles p where p.member_id = new.sender_id), ''),
      'thread_id', new.thread_id::text));
  end if;
  return null;
end;
$$;
create trigger after_message after insert on public.messages
  for each row execute function private.after_message();

create function private.check_message_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.deleted_at is not null or new.deleted_at is null then
    raise exception 'already_deleted';
  end if;
  if exists (select 1 from public.message_threads t where t.id = old.thread_id and t.status = 'reported') then
    raise exception 'thread_reported';
  end if;
  new.deleted_at := now();
  new.body := '';
  return new;
end;
$$;
create trigger check_message_delete before update of deleted_at on public.messages
  for each row execute function private.check_message_delete();

create function private.drop_deleted_attachments() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.message_attachments where message_id = new.id;
  return null;
end;
$$;
create trigger drop_deleted_attachments after update of deleted_at on public.messages
  for each row execute function private.drop_deleted_attachments();

create function private.announce_attachment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.messages set updated_at = now() where id = new.message_id;
  return null;
end;
$$;
create trigger announce_attachment after insert on public.message_attachments
  for each row execute function private.announce_attachment();

create function public.my_threads()
returns table (thread_id uuid, other_id uuid, full_name text, photo_path text, last_body text,
               last_deleted boolean, last_message_at timestamptz, unread boolean)
language sql stable security invoker set search_path = '' as $$
  select * from access.my_threads();
$$;
revoke all on function public.my_threads() from public, anon;
grant execute on function public.my_threads() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('message-files', 'message-files', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "message files: the sender, while they can send" on storage.objects for insert to authenticated
  with check (bucket_id = 'message-files' and access.thread_file_writable(name));
create policy "message files: whoever can read the thread" on storage.objects for select to authenticated
  using (bucket_id = 'message-files' and access.thread_file_readable(name));
create policy "message files: the sender removes before deleting" on storage.objects for delete to authenticated
  using (bucket_id = 'message-files' and access.thread_file_removable(name));

alter publication supabase_realtime add table public.messages;
