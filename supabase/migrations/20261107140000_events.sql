-- T03: Level 2 and up members and staff post events; members register, with a waitlist at capacity,
-- and get reminders 1 day and 1 hour before. A member's event waits for staff review; a staff event
-- publishes at once.

create table public.events (
  id uuid primary key default gen_random_uuid(),
  poster_member_id uuid references public.members (id),
  poster_staff_id uuid references public.staff (id),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  details text check (char_length(details) <= 2000),
  starts_at timestamptz not null,
  venue text check (char_length(btrim(venue)) between 3 and 200),
  link text check (link ~ '^https://[^[:space:]]+$' and char_length(link) <= 500),
  capacity int not null check (capacity between 1 and 5000),
  image_path text check (image_path is null or image_path like 'events/%'),
  status text not null default 'draft'
    check (status in ('draft', 'pending_review', 'published', 'closed', 'hidden', 'removed')),
  review_reason text check (char_length(review_reason) <= 600),
  submitted_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(poster_member_id, poster_staff_id) = 1),
  check (venue is not null or link is not null)
);
create index events_status_starts on public.events (status, starts_at);
create index events_poster on public.events (poster_member_id);

-- One table for training (T01) and event registrations; T01 adds training_id.
create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  event_id uuid references public.events (id) on delete cascade,
  status text not null check (status in ('registered', 'waitlisted', 'cancelled', 'attended')),
  waitlist_position int check (waitlist_position > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'waitlisted') = (waitlist_position is not null)),
  unique (member_id, event_id)
);
create index registrations_event on public.registrations (event_id, status);

create table private.event_reminders (
  registration_id uuid not null references public.registrations (id) on delete cascade,
  reminder text not null check (reminder in ('T1', 'T2')),
  starts_at timestamptz not null,
  sent_at timestamptz not null default now(),
  primary key (registration_id, reminder, starts_at)
);
revoke all on private.event_reminders from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['events', 'registrations'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format($p$create policy "base rule" on public.%I as restrictive for all to authenticated
      using ((select access.is_member()) or (select access.is_staff()))
      with check ((select access.is_member()) or (select access.is_staff()))$p$, t);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function private.log_change()', t);
  end loop;
end $$;

-- Writes go through the functions below only, so every rule is checked in one place.
grant select (id, poster_member_id, poster_staff_id, title, details, starts_at, venue, link, capacity, image_path,
              status, review_reason, submitted_at, published_at, created_at, updated_at)
  on public.events to authenticated;
grant select (id, member_id, event_id, status, waitlist_position, created_at, updated_at)
  on public.registrations to authenticated;

create policy "published to members, own to the poster, all to staff" on public.events
  for select to authenticated
  using ((status = 'published' and (select access.is_member()))
         or poster_member_id = (select auth.uid())
         or (select access.is_staff()));
create policy "own registrations, all to staff" on public.registrations
  for select to authenticated
  using (member_id = (select auth.uid()) or (select access.is_staff()));

-- A member who may post an event right now: Level 2 and up, and posting not paused.
create function access.can_post_event() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select access.is_member())
     and access.member_level((select auth.uid())) >= 2
     and not exists (select 1 from public.members m
                     where m.id = (select auth.uid())
                       and m.posting_suspended_until is not null and m.posting_suspended_until > now());
$$;

create function access.save_event(
  event uuid, title text, details text, starts_at timestamptz, venue text, link text, capacity int, submit boolean
) returns table (result text, event_id uuid)
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  staff_post boolean := (select access.is_staff());
  existing public.events;
  clean_title text := btrim(coalesce(title, ''));
  clean_details text := nullif(btrim(coalesce(details, '')), '');
  clean_venue text := nullif(btrim(coalesce(venue, '')), '');
  clean_link text := nullif(btrim(coalesce(link, '')), '');
  next_status text;
  saved uuid;
begin
  if not staff_post and not (select access.can_post_event()) then
    return query select 'not_allowed'::text, null::uuid;
    return;
  end if;

  if event is not null then
    select * into existing from public.events e where e.id = event for update;
    if not found
       or (not staff_post and existing.poster_member_id is distinct from me)
       or (staff_post and existing.poster_staff_id is null) then
      return query select 'not_found'::text, null::uuid;
      return;
    end if;
    if existing.status <> 'draft' then
      return query select 'not_editable'::text, existing.id;
      return;
    end if;
  end if;

  if char_length(clean_title) not between 3 and 120 then
    return query select 'invalid_title'::text, null::uuid; return;
  end if;
  if char_length(coalesce(clean_details, '')) > 2000 then
    return query select 'invalid_details'::text, null::uuid; return;
  end if;
  if starts_at is null or starts_at < now() + interval '2 hours' or starts_at > now() + interval '365 days' then
    return query select 'invalid_start'::text, null::uuid; return;
  end if;
  if clean_venue is null and clean_link is null then
    return query select 'venue_or_link_required'::text, null::uuid; return;
  end if;
  if clean_venue is not null and char_length(clean_venue) not between 3 and 200 then
    return query select 'invalid_venue'::text, null::uuid; return;
  end if;
  if clean_link is not null and (clean_link !~ '^https://[^[:space:]]+$' or char_length(clean_link) > 500) then
    return query select 'invalid_link'::text, null::uuid; return;
  end if;
  if capacity is null or capacity not between 1 and 5000 then
    return query select 'invalid_capacity'::text, null::uuid; return;
  end if;
  if private.holds_contact_details(jsonb_build_object('title', clean_title, 'details', coalesce(clean_details, ''),
                                                     'venue', coalesce(clean_venue, ''))) then
    return query select 'contact_details'::text, null::uuid; return;
  end if;

  next_status := case
    when not coalesce(submit, false) then 'draft'
    when staff_post then 'published'
    else 'pending_review'
  end;

  if event is null then
    insert into public.events (poster_member_id, poster_staff_id, title, details, starts_at, venue, link, capacity,
                               status, submitted_at, published_at)
    values (case when staff_post then null else me end, case when staff_post then me end,
            clean_title, clean_details, starts_at, clean_venue, clean_link, capacity, next_status,
            case when next_status <> 'draft' then now() end,
            case when next_status = 'published' then now() end)
    returning id into saved;
  else
    update public.events e
    set title = clean_title, details = clean_details, starts_at = save_event.starts_at, venue = clean_venue,
        link = clean_link, capacity = save_event.capacity, status = next_status,
        review_reason = case when next_status = 'draft' then e.review_reason end,
        submitted_at = case when next_status <> 'draft' then now() end,
        published_at = case when next_status = 'published' then now() end
    where e.id = event;
    saved := event;
  end if;

  return query select next_status, saved;
end;
$$;

-- Staff decide an event waiting for review. A rejected event goes back to Draft with the reason.
create function access.decide_event(event uuid, approve boolean, reason text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  post public.events;
  clean_reason text := nullif(btrim(coalesce(reason, '')), '');
begin
  if not (select access.is_staff()) then
    raise exception 'not_allowed';
  end if;
  select * into post from public.events e where e.id = event for update;
  if not found then
    return 'not_found';
  end if;
  if post.status <> 'pending_review' then
    return 'already_decided';
  end if;
  if approve then
    update public.events set status = 'published', published_at = now(), review_reason = null where id = event;
    perform private.notify(post.poster_member_id, 'O5',
                           jsonb_build_object('title', post.title, 'event_id', post.id::text));
    return 'ok';
  end if;
  if clean_reason is null or char_length(clean_reason) > 600 then
    return 'reason_required';
  end if;
  if private.holds_contact_details(jsonb_build_object('reason', clean_reason)) then
    return 'reason_has_contact_details';
  end if;
  update public.events set status = 'draft', review_reason = clean_reason, submitted_at = null where id = event;
  perform private.notify(post.poster_member_id, 'O6',
                         jsonb_build_object('title', post.title, 'reason', clean_reason, 'event_id', post.id::text));
  return 'ok';
end;
$$;

-- Register for a published event that has not started. At capacity the member joins the waitlist.
create function access.register_for_event(event uuid)
returns table (result text, waitlist_position int)
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  post public.events;
  mine public.registrations;
  taken int;
  next_position int;
begin
  if not (select access.is_member()) then
    raise exception 'not_allowed';
  end if;
  select * into post from public.events e where e.id = event for update;
  if not found or post.status <> 'published' then
    return query select 'not_found'::text, null::int; return;
  end if;
  if post.starts_at <= now() then
    return query select 'started'::text, null::int; return;
  end if;
  select * into mine from public.registrations r where r.event_id = event and r.member_id = me;
  if found and mine.status in ('registered', 'waitlisted') then
    return query select mine.status, mine.waitlist_position; return;
  end if;

  select count(*) into taken from public.registrations r where r.event_id = event and r.status = 'registered';
  if taken < post.capacity then
    insert into public.registrations (member_id, event_id, status) values (me, event, 'registered')
    on conflict (member_id, event_id) do update set status = 'registered', waitlist_position = null;
    return query select 'registered'::text, null::int; return;
  end if;

  select coalesce(max(r.waitlist_position), 0) + 1 into next_position
  from public.registrations r where r.event_id = event and r.status = 'waitlisted';
  insert into public.registrations (member_id, event_id, status, waitlist_position)
  values (me, event, 'waitlisted', next_position)
  on conflict (member_id, event_id) do update set status = 'waitlisted', waitlist_position = next_position;
  return query select 'waitlisted'::text, next_position;
end;
$$;

-- Cancel a place or leave the waitlist. A freed place goes to the first member waiting (W1).
create function access.cancel_event_registration(event uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  post public.events;
  mine public.registrations;
  first_waiting public.registrations;
begin
  if not (select access.is_member()) then
    raise exception 'not_allowed';
  end if;
  select * into post from public.events e where e.id = event for update;
  if not found then
    return 'not_found';
  end if;
  select * into mine from public.registrations r
  where r.event_id = event and r.member_id = me and r.status in ('registered', 'waitlisted');
  if not found then
    return 'not_registered';
  end if;
  update public.registrations set status = 'cancelled', waitlist_position = null where id = mine.id;

  if mine.status = 'registered' and post.status = 'published' and post.starts_at > now() then
    select * into first_waiting from public.registrations r
    where r.event_id = event and r.status = 'waitlisted' order by r.waitlist_position limit 1;
    if found then
      update public.registrations set status = 'registered', waitlist_position = null where id = first_waiting.id;
      perform private.notify(first_waiting.member_id, 'W1',
                             jsonb_build_object('title', post.title, 'event_id', post.id::text));
    end if;
  end if;
  return 'ok';
end;
$$;

-- Upcoming published events, with places left and the caller's own registration; and the poster's own events.
create function access.events_feed()
returns table (event_id uuid, title text, details text, starts_at timestamptz, venue text, link text, capacity int,
               registered int, status text, review_reason text, is_mine boolean, my_status text,
               my_waitlist_position int)
language sql stable security definer set search_path = '' as $$
  select e.id, e.title, e.details, e.starts_at, e.venue, e.link, e.capacity,
         (select count(*)::int from public.registrations r where r.event_id = e.id and r.status = 'registered'),
         e.status, case when e.poster_member_id = auth.uid() then e.review_reason end,
         e.poster_member_id = auth.uid(), mine.status, mine.waitlist_position
  from public.events e
  left join public.registrations mine
    on mine.event_id = e.id and mine.member_id = auth.uid() and mine.status in ('registered', 'waitlisted')
  where (select access.is_member())
    and ((e.status = 'published' and e.starts_at > now() - interval '3 hours')
         or (e.poster_member_id = auth.uid() and e.status in ('draft', 'pending_review')))
  order by e.starts_at;
$$;

-- The poster's registrant list: names and profiles only, never contact details.
create function access.event_registrants(event uuid)
returns table (member_id uuid, full_name text, headline text, photo_path text, status text, waitlist_position int)
language sql stable security definer set search_path = '' as $$
  select r.member_id, p.full_name, p.headline, p.photo_path, r.status, r.waitlist_position
  from public.registrations r
  join public.events e on e.id = r.event_id
  left join public.profiles p on p.member_id = r.member_id
  where r.event_id = event and r.status in ('registered', 'waitlisted', 'attended')
    and ((e.poster_member_id = auth.uid() and (select access.is_member())) or (select access.is_staff()))
  order by r.status, r.waitlist_position nulls first, p.full_name;
$$;

-- Events waiting for staff review, oldest first.
create function access.event_review_queue()
returns table (event_id uuid, title text, details text, starts_at timestamptz, venue text, link text, capacity int,
               poster_username text, submitted_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select e.id, e.title, e.details, e.starts_at, e.venue, e.link, e.capacity, m.username::text, e.submitted_at
  from public.events e
  left join public.members m on m.id = e.poster_member_id
  where e.status = 'pending_review' and (select access.is_staff())
  order by e.submitted_at;
$$;

-- Every 5 minutes: T1 a day before and T2 an hour before, once each, to registered members. Safe to run twice.
create function private.send_event_reminders() returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  due record;
  sent int := 0;
begin
  for due in
    select r.id as registration_id, r.member_id, e.id as event_id, e.title, e.starts_at,
           case when e.starts_at <= now() + interval '1 hour' then 'T2' else 'T1' end as reminder
    from public.registrations r
    join public.events e on e.id = r.event_id
    join public.members m on m.id = r.member_id
    where r.status = 'registered' and e.status = 'published' and m.status = 'approved'
      and e.starts_at > now() and e.starts_at <= now() + interval '24 hours'
  loop
    insert into private.event_reminders (registration_id, reminder, starts_at)
    values (due.registration_id, due.reminder, due.starts_at)
    on conflict do nothing;
    if found then
      perform private.notify(due.member_id, due.reminder,
        jsonb_build_object('title', due.title, 'event_id', due.event_id::text,
                           'time', to_char(due.starts_at at time zone 'Africa/Dar_es_Salaam', 'HH24:MI')));
      sent := sent + 1;
    end if;
  end loop;
  return sent;
end;
$$;
revoke all on function private.send_event_reminders() from public, anon, authenticated;
select cron.schedule('send-event-reminders', '*/5 * * * *', $job$ select private.send_event_reminders() $job$);

revoke all on function access.can_post_event(),
  access.save_event(uuid, text, text, timestamptz, text, text, int, boolean),
  access.decide_event(uuid, boolean, text), access.register_for_event(uuid), access.cancel_event_registration(uuid),
  access.events_feed(), access.event_registrants(uuid), access.event_review_queue()
  from public, anon;
grant execute on function access.can_post_event(),
  access.save_event(uuid, text, text, timestamptz, text, text, int, boolean),
  access.decide_event(uuid, boolean, text), access.register_for_event(uuid), access.cancel_event_registration(uuid),
  access.events_feed(), access.event_registrants(uuid), access.event_review_queue()
  to authenticated;

create function public.can_post_event() returns boolean
language sql stable security invoker set search_path = '' as $$ select access.can_post_event(); $$;
create function public.save_event(
  event uuid, title text, details text, starts_at timestamptz, venue text, link text, capacity int, submit boolean
) returns table (result text, event_id uuid)
language sql volatile security invoker set search_path = '' as $$
  select * from access.save_event(event, title, details, starts_at, venue, link, capacity, submit);
$$;
create function public.decide_event(event uuid, approve boolean, reason text) returns text
language sql volatile security invoker set search_path = '' as $$ select access.decide_event(event, approve, reason); $$;
create function public.register_for_event(event uuid) returns table (result text, waitlist_position int)
language sql volatile security invoker set search_path = '' as $$ select * from access.register_for_event(event); $$;
create function public.cancel_event_registration(event uuid) returns text
language sql volatile security invoker set search_path = '' as $$ select access.cancel_event_registration(event); $$;
create function public.events_feed()
returns table (event_id uuid, title text, details text, starts_at timestamptz, venue text, link text, capacity int,
               registered int, status text, review_reason text, is_mine boolean, my_status text,
               my_waitlist_position int)
language sql stable security invoker set search_path = '' as $$ select * from access.events_feed(); $$;
create function public.event_registrants(event uuid)
returns table (member_id uuid, full_name text, headline text, photo_path text, status text, waitlist_position int)
language sql stable security invoker set search_path = '' as $$ select * from access.event_registrants(event); $$;
create function public.event_review_queue()
returns table (event_id uuid, title text, details text, starts_at timestamptz, venue text, link text, capacity int,
               poster_username text, submitted_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from access.event_review_queue(); $$;

revoke all on function public.can_post_event(),
  public.save_event(uuid, text, text, timestamptz, text, text, int, boolean),
  public.decide_event(uuid, boolean, text), public.register_for_event(uuid), public.cancel_event_registration(uuid),
  public.events_feed(), public.event_registrants(uuid), public.event_review_queue()
  from public, anon;
grant execute on function public.can_post_event(),
  public.save_event(uuid, text, text, timestamptz, text, text, int, boolean),
  public.decide_event(uuid, boolean, text), public.register_for_event(uuid), public.cancel_event_registration(uuid),
  public.events_feed(), public.event_registrants(uuid), public.event_review_queue()
  to authenticated;
