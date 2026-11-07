-- I04: after the owner approves, the requester accepts the NDA and the IP terms (S25). The acceptance is stored
-- with its time, IP and text version (legal_acceptances, context idea_access) and is never changed, even when a
-- new version is published. On acceptance both sides see each other, a message thread labelled with the idea
-- title opens between them, and the requester may read the details. Contact details still need a connection.

-- Whether a member may read an idea's details as a requester: their request is past the NDA and not revoked.
create function access.has_idea_access(idea uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select access.is_member()) and exists (
    select 1 from public.idea_access_requests r
    where r.idea_id = idea and r.requester_id = auth.uid() and r.status = 'nda_accepted');
$$;

-- Whether two members are an idea owner and a requester past the NDA, for that idea or any.
create function access.idea_partners(a uuid, b uuid, idea uuid default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.idea_access_requests r join public.ideas i on i.id = r.idea_id
    where r.status = 'nda_accepted' and (idea is null or r.idea_id = idea)
      and ((i.owner_id = a and r.requester_id = b) or (i.owner_id = b and r.requester_id = a)));
$$;

create policy "requesters past the NDA" on public.idea_details for select to authenticated
  using (access.has_idea_access(idea_id));

-- Identities are shown to each other once the NDA is accepted, even when a profile is hidden from the directory.
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
           or access.idea_partners(member_id, (select auth.uid())))
    )
  );

-- A thread about an idea is open to send while the two are idea partners for it, as well as when connected.
create or replace function access.can_send(thread uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.message_threads t
                 where t.id = thread and t.status <> 'closed'
                   and (select access.is_member())
                   and auth.uid() in (t.member_a, t.member_b)
                   and (access.is_connected(t.member_a, t.member_b)
                        or (t.idea_id is not null and access.idea_partners(t.member_a, t.member_b, t.idea_id)))
                   and not access.is_blocked(t.member_a, t.member_b));
$$;

-- S25: the current NDA and IP texts, for the requester of an approved request only.
create function access.idea_terms(request uuid)
returns table (id uuid, kind text, version text, body_en text, body_sw text, approved_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select t.id, t.kind, t.version, t.body_en, t.body_sw, t.approved_at
  from public.legal_texts t
  where t.kind in ('nda', 'ip')
    and t.id = access.current_legal_text_id(t.kind)
    and (select access.is_member())
    and exists (select 1 from public.idea_access_requests r
                where r.id = request and r.requester_id = auth.uid() and r.status = 'approved')
  order by t.kind;
$$;

-- The requester accepts the texts they were shown. If either text changed since, nothing is stored and they
-- are shown the new one. I5 tells both sides.
create function access.accept_idea_terms(request uuid, text_ids uuid[]) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  found_request public.idea_access_requests;
  post public.ideas;
  nda_text uuid := access.current_legal_text_id('nda');
  ip_text uuid := access.current_legal_text_id('ip');
  nda_acceptance uuid;
  thread uuid;
begin
  select * into found_request from public.idea_access_requests r
  where r.id = request and r.requester_id = auth.uid() for update;
  if not found or not (select access.is_member()) then
    return 'not_found';
  end if;
  select * into post from public.ideas i where i.id = found_request.idea_id;
  if access.is_blocked(post.owner_id, found_request.requester_id) then
    return 'not_found';
  end if;
  if found_request.status = 'nda_accepted' then
    return 'already_accepted';
  end if;
  if found_request.status <> 'approved' then
    return 'not_approved';
  end if;
  if nda_text is null or ip_text is null then
    return 'texts_missing';
  end if;
  if not (nda_text = any (text_ids) and ip_text = any (text_ids)) then
    return 'texts_changed';
  end if;

  insert into public.legal_acceptances (member_id, legal_text_id, context_type, context_id)
  values (found_request.requester_id, nda_text, 'idea_access', request)
  returning id into nda_acceptance;
  insert into public.legal_acceptances (member_id, legal_text_id, context_type, context_id)
  values (found_request.requester_id, ip_text, 'idea_access', request);

  update public.idea_access_requests set status = 'nda_accepted', nda_acceptance_id = nda_acceptance
  where id = request;

  insert into public.message_threads (member_a, member_b, idea_id)
  values (least(post.owner_id, found_request.requester_id), greatest(post.owner_id, found_request.requester_id),
          post.id)
  on conflict do nothing;
  select t.id into thread from public.message_threads t
  where t.member_a = least(post.owner_id, found_request.requester_id)
    and t.member_b = greatest(post.owner_id, found_request.requester_id)
    and t.idea_id = post.id and t.opportunity_id is null;

  perform private.notify(m, 'I5', jsonb_build_object('idea_title', post.title, 'idea_id', post.id::text,
                                                     'thread_id', thread::text))
  from unnest(array[post.owner_id, found_request.requester_id]) m;
  return 'ok';
end;
$$;

-- The thread between the viewer and an idea partner about this idea, for the "Message" link on both sides.
create function access.idea_thread(idea uuid, other uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select t.id from public.message_threads t
  where t.idea_id = idea and t.opportunity_id is null
    and t.member_a = least(auth.uid(), other) and t.member_b = greatest(auth.uid(), other)
    and (select access.is_member());
$$;

-- One thread's label and whether the viewer can send in it now.
create function access.thread_details(thread uuid)
returns table (can_send boolean, idea_id uuid, idea_title text)
language sql stable security definer set search_path = '' as $$
  select access.can_send(t.id), t.idea_id, i.title
  from public.message_threads t left join public.ideas i on i.id = t.idea_id
  where t.id = thread and (select access.is_member()) and auth.uid() in (t.member_a, t.member_b);
$$;

-- The thread list gains the idea it is about, and names idea partners even when hidden from the directory.
drop function public.my_threads();
drop function access.my_threads();
create function access.my_threads()
returns table (thread_id uuid, other_id uuid, full_name text, photo_path text, last_body text,
               last_deleted boolean, last_message_at timestamptz, unread boolean, idea_id uuid, idea_title text)
language sql stable security definer set search_path = '' as $$
  select t.id, o.other, p.full_name, p.photo_path, last.body, last.deleted_at is not null,
         t.last_message_at,
         exists (select 1 from public.messages m
                 where m.thread_id = t.id and m.sender_id <> auth.uid() and m.deleted_at is null
                   and m.created_at > coalesce((select r.last_read_at from public.thread_reads r
                                                where r.thread_id = t.id and r.member_id = auth.uid()),
                                               '-infinity')),
         t.idea_id, i.title
  from public.message_threads t
  cross join lateral (select case when t.member_a = auth.uid() then t.member_b else t.member_a end as other) o
  left join public.profiles p on p.member_id = o.other
    and not access.is_blocked(o.other, auth.uid())
    and (not p.hidden_from_directory or access.is_connected(o.other, auth.uid())
         or access.idea_partners(o.other, auth.uid()))
  left join public.ideas i on i.id = t.idea_id
  cross join lateral (select m.body, m.deleted_at from public.messages m
                      where m.thread_id = t.id order by m.created_at desc limit 1) last
  where (select access.is_member()) and auth.uid() in (t.member_a, t.member_b)
  order by t.last_message_at desc;
$$;

revoke all on function access.has_idea_access(uuid), access.idea_partners(uuid, uuid, uuid),
  access.idea_terms(uuid), access.accept_idea_terms(uuid, uuid[]), access.idea_thread(uuid, uuid),
  access.thread_details(uuid), access.my_threads() from public, anon;
grant execute on function access.has_idea_access(uuid), access.idea_partners(uuid, uuid, uuid),
  access.idea_terms(uuid), access.accept_idea_terms(uuid, uuid[]), access.idea_thread(uuid, uuid),
  access.thread_details(uuid), access.my_threads() to authenticated;

create function public.my_threads()
returns table (thread_id uuid, other_id uuid, full_name text, photo_path text, last_body text,
               last_deleted boolean, last_message_at timestamptz, unread boolean, idea_id uuid, idea_title text)
language sql stable security invoker set search_path = '' as $$ select * from access.my_threads(); $$;
create function public.idea_terms(request uuid)
returns table (id uuid, kind text, version text, body_en text, body_sw text, approved_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from access.idea_terms(request); $$;
create function public.accept_idea_terms(request uuid, text_ids uuid[]) returns text
language sql volatile security invoker set search_path = '' as $$ select access.accept_idea_terms(request, text_ids); $$;
create function public.idea_thread(idea uuid, other uuid) returns uuid
language sql stable security invoker set search_path = '' as $$ select access.idea_thread(idea, other); $$;
create function public.thread_details(thread uuid)
returns table (can_send boolean, idea_id uuid, idea_title text)
language sql stable security invoker set search_path = '' as $$ select * from access.thread_details(thread); $$;

revoke all on function public.my_threads(), public.idea_terms(uuid), public.accept_idea_terms(uuid, uuid[]),
  public.idea_thread(uuid, uuid), public.thread_details(uuid) from public, anon;
grant execute on function public.my_threads(), public.idea_terms(uuid), public.accept_idea_terms(uuid, uuid[]),
  public.idea_thread(uuid, uuid), public.thread_details(uuid) to authenticated;

-- The requester's own request carries its id too, so S25 can name it.
grant select (nda_acceptance_id) on public.idea_access_requests to authenticated;
