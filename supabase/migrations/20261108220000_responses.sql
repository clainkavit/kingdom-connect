-- O03: responses. A member applies to a job or expresses interest in any other type; both are one record in
-- responses (decided 19 Oct). A member responds once to a post. The poster sees each response as New,
-- Shortlisted or Declined and the member sees the same status; the member can withdraw while it is New. A tender
-- takes Level 2 and up. Responding opens a message thread between the two, open to send while the response is New
-- or Shortlisted. The poster reads the responder's profile for as long as that is so, even when it is hidden from
-- the directory. Contact details never travel: notes are screened like a post.

create table public.responses (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities (id),
  member_id uuid not null references public.members (id),
  kind text not null check (kind in ('application', 'interest')),
  note text not null default '' check (char_length(note) <= 2000),
  attachment_path text unique,
  status text not null default 'new' check (status in ('new', 'shortlisted', 'declined', 'withdrawn')),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id, member_id)
);
create index responses_member on public.responses (member_id);
create trigger set_updated_at before update on public.responses
  for each row execute function private.set_updated_at();
create trigger audit after insert or update or delete on public.responses
  for each row execute function private.log_change();
alter table public.responses enable row level security;
revoke all on public.responses from anon, authenticated;
create policy "base rule" on public.responses as restrictive for all to authenticated
  using ((select access.is_member()) or (select access.is_staff()))
  with check ((select access.is_member()) or (select access.is_staff()));

-- Whether the caller runs a post: its member poster, or staff for a post an admin made.
create function access.runs_opportunity(post uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.opportunities o
                 where o.id = post
                   and ((select access.is_member()) and o.poster_member_id = auth.uid()
                        or (select access.is_staff()) and o.poster_staff_id is not null));
$$;

grant select (id, opportunity_id, member_id, kind, note, attachment_path, status, decided_at, created_at, updated_at)
  on public.responses to authenticated;
create policy "the member and the poster" on public.responses for select to authenticated
  using (member_id = (select auth.uid()) or access.runs_opportunity(opportunity_id));

-- Whether two members are a poster and a responder whose response is still open (New or Shortlisted).
create function access.response_partners(a uuid, b uuid, post uuid default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.responses r join public.opportunities o on o.id = r.opportunity_id
    where r.status in ('new', 'shortlisted') and (post is null or r.opportunity_id = post)
      and ((o.poster_member_id = a and r.member_id = b) or (o.poster_member_id = b and r.member_id = a)));
$$;

drop policy "owner, staff, or visible to members" on public.profiles;
create policy "owner, staff, or visible to members" on public.profiles for select to authenticated
  using (
    member_id = (select auth.uid())
    or (select access.is_staff())
    or (
      (select access.is_member())
      and access.member_level(member_id) >= 1
      and not access.is_blocked(member_id, (select auth.uid()))
      and (not hidden_from_directory
           or access.is_connected(member_id, (select auth.uid()))
           or access.has_open_request(member_id, (select auth.uid()))
           or access.idea_partners(member_id, (select auth.uid()))
           or access.response_partners(member_id, (select auth.uid())))
    )
  );

-- A thread about an opportunity is open to send while the poster and the responder have an open response.
create or replace function access.can_send(thread uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.message_threads t
                 where t.id = thread and t.status <> 'closed'
                   and (select access.is_member())
                   and auth.uid() in (t.member_a, t.member_b)
                   and (access.is_connected(t.member_a, t.member_b)
                        or (t.idea_id is not null and access.idea_partners(t.member_a, t.member_b, t.idea_id))
                        or (t.opportunity_id is not null
                            and access.response_partners(t.member_a, t.member_b, t.opportunity_id)))
                   and not access.is_blocked(t.member_a, t.member_b));
$$;

-- Attachments: PDF up to 5 MB at <member id>/<file id>.pdf, kept for the member and the poster of the post
-- they were sent to.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('response-files', 'response-files', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

create function access.response_file_readable(path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select split_part(path, '/', 1) = auth.uid()::text
      or exists (select 1 from public.responses r
                 where r.attachment_path = path and access.runs_opportunity(r.opportunity_id));
$$;
create policy "response files: a member uploads into their own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'response-files' and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'
              and split_part(name, '/', 1) = auth.uid()::text and (select access.is_member()));
create policy "response files: the member or the poster read" on storage.objects for select to authenticated
  using (bucket_id = 'response-files' and access.response_file_readable(name));
create policy "response files: the member removes an unsent file" on storage.objects for delete to authenticated
  using (bucket_id = 'response-files' and split_part(name, '/', 1) = auth.uid()::text
         and not exists (select 1 from public.responses r where r.attachment_path = name));

-- S18: apply or express interest. A job takes an application, every other type an expression of interest.
create function access.respond_to_opportunity(opportunity uuid, note text, attachment_path text)
returns table (result text, response_id uuid)
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  post private.opportunity_cards;
  poster uuid;
  clean_note text := btrim(coalesce(note, ''));
  stored_size bigint;
  saved uuid;
  response_kind text;
begin
  if not (select access.is_member()) then
    raise exception 'not_allowed';
  end if;
  select * into post from private.opportunity_cards c where c.id = opportunity;
  if not found or post.status <> 'published' or post.closing_at < private.tanzania_today() or not post.listable then
    return query select 'not_open'::text, null::uuid; return;
  end if;
  select o.poster_member_id into poster from public.opportunities o where o.id = opportunity;
  if poster = me then
    return query select 'own_post'::text, null::uuid; return;
  end if;
  if post.type = 'tender' and access.member_level(me) < 2 then
    return query select 'level2_required'::text, null::uuid; return;
  end if;
  if exists (select 1 from public.responses r where r.opportunity_id = opportunity and r.member_id = me) then
    return query select 'already_responded'::text, null::uuid; return;
  end if;
  if char_length(clean_note) > 2000 then
    return query select 'invalid_note'::text, null::uuid; return;
  end if;
  if private.holds_contact_details(jsonb_build_object('note', clean_note)) then
    return query select 'contact_details'::text, null::uuid; return;
  end if;
  if attachment_path is not null then
    select nullif(o.metadata ->> 'size', '')::bigint into stored_size
    from storage.objects o where o.bucket_id = 'response-files' and o.name = attachment_path;
    if attachment_path !~ ('^' || me::text || '/[0-9a-f-]{36}\.pdf$') or stored_size is null
       or stored_size not between 1 and 5242880 then
      return query select 'invalid_attachment'::text, null::uuid; return;
    end if;
  end if;
  response_kind := case when post.type = 'job' then 'application' else 'interest' end;
  insert into public.responses (opportunity_id, member_id, kind, note, attachment_path)
  values (opportunity, me, response_kind, clean_note, attachment_path) returning id into saved;
  if poster is not null then
    insert into public.message_threads (member_a, member_b, opportunity_id)
    values (least(me, poster), greatest(me, poster), opportunity)
    on conflict do nothing;
    perform private.notify(poster, case when response_kind = 'application' then 'O1' else 'O2' end,
      jsonb_build_object('name', private.viewer_name(me), 'title', post.title, 'opportunity_id', opportunity::text,
                         'response_id', saved::text));
  end if;
  return query select 'ok'::text, saved;
end;
$$;

-- S21: the poster shortlists or declines a response that is still New or Shortlisted. O3 or O4 tells the member.
create function access.set_response_status(response uuid, next_status text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  found_response public.responses;
  post public.opportunities;
begin
  select * into found_response from public.responses r where r.id = response for update;
  if not found or not access.runs_opportunity(found_response.opportunity_id) then
    return 'not_found';
  end if;
  if next_status is null or next_status not in ('shortlisted', 'declined') then
    return 'invalid_status';
  end if;
  if found_response.status not in ('new', 'shortlisted') or found_response.status = next_status then
    return 'not_allowed';
  end if;
  select * into post from public.opportunities o where o.id = found_response.opportunity_id;
  update public.responses set status = next_status, decided_at = now() where id = response;
  perform private.notify(found_response.member_id, case when next_status = 'shortlisted' then 'O3' else 'O4' end,
    jsonb_build_object('title', post.title, 'opportunity_id', post.id::text));
  return 'ok';
end;
$$;

-- S19: the member withdraws a response while it is New.
create function access.withdraw_response(response uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  found_response public.responses;
begin
  select * into found_response from public.responses r where r.id = response and r.member_id = auth.uid() for update;
  if not found or not (select access.is_member()) then
    return 'not_found';
  end if;
  if found_response.status <> 'new' then
    return 'not_allowed';
  end if;
  update public.responses set status = 'withdrawn', decided_at = now() where id = response;
  return 'ok';
end;
$$;

-- S19: my responses, newest first, with the post and its state.
create function access.my_responses()
returns table (response_id uuid, opportunity_id uuid, kind text, status text, title text, type text,
               opportunity_status text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.opportunity_id, r.kind, r.status, o.title, o.type, o.status, r.created_at
  from public.responses r join public.opportunities o on o.id = r.opportunity_id
  where r.member_id = auth.uid() and (select access.is_member())
  order by r.created_at desc;
$$;

-- S21: the responses to one of my posts, newest first.
create function access.responses_for_post(opportunity uuid)
returns table (response_id uuid, member_id uuid, member_name text, kind text, note text, attachment_path text,
               status text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.member_id, private.viewer_name(r.member_id), r.kind, r.note, r.attachment_path, r.status, r.created_at
  from public.responses r
  where r.opportunity_id = responses_for_post.opportunity and access.runs_opportunity(r.opportunity_id)
  order by r.created_at desc;
$$;

-- The caller's response to a post, for the button on S17: nothing when they have not responded.
create function access.my_response(opportunity uuid)
returns table (response_id uuid, status text)
language sql stable security definer set search_path = '' as $$
  select r.id, r.status from public.responses r
  where r.opportunity_id = my_response.opportunity and r.member_id = auth.uid() and (select access.is_member());
$$;

-- The thread between the caller and the other side about a post. A responder leaves out the other member.
create function access.opportunity_thread(opportunity uuid, other uuid default null) returns uuid
language sql stable security definer set search_path = '' as $$
  select t.id from public.message_threads t
  cross join lateral (select coalesce(other, (select o.poster_member_id from public.opportunities o
                                              where o.id = opportunity)) as who) w
  where t.opportunity_id = opportunity and t.idea_id is null
    and t.member_a = least(auth.uid(), w.who) and t.member_b = greatest(auth.uid(), w.who)
    and (select access.is_member());
$$;

revoke all on function access.runs_opportunity(uuid), access.response_partners(uuid, uuid, uuid),
  access.response_file_readable(text), access.respond_to_opportunity(uuid, text, text),
  access.set_response_status(uuid, text), access.withdraw_response(uuid), access.my_responses(),
  access.responses_for_post(uuid), access.my_response(uuid), access.opportunity_thread(uuid, uuid) from public, anon;
grant execute on function access.runs_opportunity(uuid), access.response_partners(uuid, uuid, uuid),
  access.response_file_readable(text), access.respond_to_opportunity(uuid, text, text),
  access.set_response_status(uuid, text), access.withdraw_response(uuid), access.my_responses(),
  access.responses_for_post(uuid), access.my_response(uuid), access.opportunity_thread(uuid, uuid) to authenticated;

create function public.respond_to_opportunity(opportunity uuid, note text default null, attachment_path text default null)
returns table (result text, response_id uuid)
language sql volatile security invoker set search_path = '' as $$
  select * from access.respond_to_opportunity(opportunity, note, attachment_path);
$$;
create function public.set_response_status(response uuid, next_status text) returns text
language sql volatile security invoker set search_path = '' as $$ select access.set_response_status(response, next_status); $$;
create function public.withdraw_response(response uuid) returns text
language sql volatile security invoker set search_path = '' as $$ select access.withdraw_response(response); $$;
create function public.my_responses()
returns table (response_id uuid, opportunity_id uuid, kind text, status text, title text, type text,
               opportunity_status text, created_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from access.my_responses(); $$;
create function public.responses_for_post(opportunity uuid)
returns table (response_id uuid, member_id uuid, member_name text, kind text, note text, attachment_path text,
               status text, created_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from access.responses_for_post(opportunity); $$;
create function public.my_response(opportunity uuid) returns table (response_id uuid, status text)
language sql stable security invoker set search_path = '' as $$ select * from access.my_response(opportunity); $$;
create function public.opportunity_thread(opportunity uuid, other uuid default null) returns uuid
language sql stable security invoker set search_path = '' as $$ select access.opportunity_thread(opportunity, other); $$;

revoke all on function public.respond_to_opportunity(uuid, text, text), public.set_response_status(uuid, text),
  public.withdraw_response(uuid), public.my_responses(), public.responses_for_post(uuid), public.my_response(uuid),
  public.opportunity_thread(uuid, uuid) from public, anon;
grant execute on function public.respond_to_opportunity(uuid, text, text), public.set_response_status(uuid, text),
  public.withdraw_response(uuid), public.my_responses(), public.responses_for_post(uuid), public.my_response(uuid),
  public.opportunity_thread(uuid, uuid) to authenticated;
