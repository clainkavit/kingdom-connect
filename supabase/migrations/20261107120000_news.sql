-- T04: staff write news; approved members read what is published, pinned items first.

create table public.news_items (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id) default auth.uid(),
  title text not null check (char_length(btrim(title)) between 3 and 140),
  body text not null check (char_length(btrim(body)) between 1 and 10000),
  image_path text check (image_path is null or image_path like 'news/%'),
  pinned boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'published') = (published_at is not null))
);
create index news_items_feed on public.news_items (status, pinned desc, published_at desc);

create trigger set_updated_at before update on public.news_items
  for each row execute function private.set_updated_at();
alter table public.news_items enable row level security;
revoke all on public.news_items from anon, authenticated;
create policy "base rule" on public.news_items as restrictive for all to authenticated
  using ((select access.is_member()) or (select access.is_staff()))
  with check ((select access.is_member()) or (select access.is_staff()));

grant select (id, staff_id, title, body, image_path, pinned, status, published_at, created_at, updated_at),
  insert (title, body, image_path, pinned, status, published_at),
  update (title, body, image_path, pinned, status, published_at),
  delete on public.news_items to authenticated;

create policy "published to members, everything to staff" on public.news_items for select to authenticated
  using ((status = 'published' and (select access.is_member())) or (select access.is_staff()));
create policy "staff write news" on public.news_items for insert to authenticated
  with check ((select access.is_staff()) and staff_id = (select auth.uid()));
create policy "staff edit news" on public.news_items for update to authenticated
  using ((select access.is_staff())) with check ((select access.is_staff()));
create policy "staff delete news" on public.news_items for delete to authenticated
  using ((select access.is_staff()));

create trigger audit after insert or update or delete on public.news_items
  for each row execute function private.log_change();

-- Shared images (news now; tender documents and event images later): staff upload, signed-in members read.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('public-media', 'public-media', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "public media: staff upload news images" on storage.objects for insert to authenticated
  with check (bucket_id = 'public-media' and name like 'news/%' and (select access.is_staff()));
create policy "public media: staff replace news images" on storage.objects for update to authenticated
  using (bucket_id = 'public-media' and name like 'news/%' and (select access.is_staff()));
create policy "public media: staff remove news images" on storage.objects for delete to authenticated
  using (bucket_id = 'public-media' and name like 'news/%' and (select access.is_staff()));
create policy "public media: members and staff read" on storage.objects for select to authenticated
  using (bucket_id = 'public-media' and ((select access.is_member()) or (select access.is_staff())));
