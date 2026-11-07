-- T01: any verified member and staff post training; a member's post waits for staff review. Members register,
-- with a waitlist at capacity; the poster sees registrants by name only. Materials arrive with T02.

create table public.trainings (
  id uuid primary key default gen_random_uuid(),
  poster_member_id uuid references public.members (id),
  poster_staff_id uuid references public.staff (id),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  provider text not null check (char_length(btrim(provider)) between 2 and 120),
  format text not null check (format in ('in_person', 'online')),
  details text check (char_length(details) <= 2000),
  venue text check (char_length(btrim(venue)) between 3 and 200),
  starts_at timestamptz,
  seats int not null check (seats between 1 and 5000),
  downloads_allowed boolean not null default false,
  status text not null default 'draft'
    check (status in ('draft', 'pending_review', 'published', 'closed', 'hidden', 'removed')),
  review_reason text check (char_length(review_reason) <= 600),
  submitted_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(poster_member_id, poster_staff_id) = 1),
  check (format = 'online' or venue is not null)
);
create index trainings_status_starts on public.trainings (status, starts_at);
create index trainings_poster on public.trainings (poster_member_id);

create trigger set_updated_at before update on public.trainings
  for each row execute function private.set_updated_at();
alter table public.trainings enable row level security;
revoke all on public.trainings from anon, authenticated;
create policy "base rule" on public.trainings as restrictive for all to authenticated
  using ((select access.is_member()) or (select access.is_staff()))
  with check ((select access.is_member()) or (select access.is_staff()));
create trigger audit after insert or update or delete on public.trainings
  for each row execute function private.log_change();

-- Writes go through the functions below only.
grant select (id, poster_member_id, poster_staff_id, title, provider, format, details, venue, starts_at, seats,
              downloads_allowed, status, review_reason, submitted_at, published_at, created_at, updated_at)
  on public.trainings to authenticated;
create policy "published to members, own to the poster, all to staff" on public.trainings
  for select to authenticated
  using ((status = 'published' and (select access.is_member()))
         or poster_member_id = (select auth.uid())
         or (select access.is_staff()));

-- One registrations table for training and events.
alter table public.registrations add column training_id uuid references public.trainings (id) on delete cascade;
alter table public.registrations add constraint registrations_one_target check (num_nonnulls(training_id, event_id) = 1);
alter table public.registrations add constraint registrations_member_training unique (member_id, training_id);
create index registrations_training on public.registrations (training_id, status);
grant select (training_id) on public.registrations to authenticated;

-- Any approved member may post training while their posting is not paused.
create function access.can_post_training() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select access.is_member())
     and not exists (select 1 from public.members m
                     where m.id = (select auth.uid())
                       and m.posting_suspended_until is not null and m.posting_suspended_until > now());
$$;

create function access.save_training(
  training uuid, title text, provider text, format text, details text, venue text, starts_at timestamptz,
  seats int, downloads_allowed boolean, submit boolean
) returns table (result text, training_id uuid)
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  staff_post boolean := (select access.is_staff());
  existing public.trainings;
  clean_title text := btrim(coalesce(title, ''));
  clean_provider text := btrim(coalesce(provider, ''));
  clean_details text := nullif(btrim(coalesce(details, '')), '');
  clean_venue text := nullif(btrim(coalesce(venue, '')), '');
  next_status text;
  saved uuid;
begin
  if not staff_post and not (select access.can_post_training()) then
    return query select 'not_allowed'::text, null::uuid;
    return;
  end if;

  if training is not null then
    select * into existing from public.trainings tr where tr.id = training for update;
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
  if char_length(clean_provider) not between 2 and 120 then
    return query select 'invalid_provider'::text, null::uuid; return;
  end if;
  if format is null or format not in ('in_person', 'online') then
    return query select 'invalid_format'::text, null::uuid; return;
  end if;
  if char_length(coalesce(clean_details, '')) > 2000 then
    return query select 'invalid_details'::text, null::uuid; return;
  end if;
  if format = 'in_person' and (clean_venue is null or char_length(clean_venue) not between 3 and 200) then
    return query select 'invalid_venue'::text, null::uuid; return;
  end if;
  if starts_at is not null and (starts_at < now() + interval '2 hours' or starts_at > now() + interval '365 days') then
    return query select 'invalid_start'::text, null::uuid; return;
  end if;
  if seats is null or seats not between 1 and 5000 then
    return query select 'invalid_seats'::text, null::uuid; return;
  end if;
  if private.holds_contact_details(jsonb_build_object('title', clean_title, 'provider', clean_provider,
                                                     'details', coalesce(clean_details, ''),
                                                     'venue', coalesce(clean_venue, ''))) then
    return query select 'contact_details'::text, null::uuid; return;
  end if;

  next_status := case
    when not coalesce(submit, false) then 'draft'
    when staff_post then 'published'
    else 'pending_review'
  end;

  if training is null then
    insert into public.trainings (poster_member_id, poster_staff_id, title, provider, format, details, venue,
                                  starts_at, seats, downloads_allowed, status, submitted_at, published_at)
    values (case when staff_post then null else me end, case when staff_post then me end,
            clean_title, clean_provider, format, clean_details,
            case when format = 'in_person' then clean_venue end, starts_at, seats,
            coalesce(downloads_allowed, false), next_status,
            case when next_status <> 'draft' then now() end,
            case when next_status = 'published' then now() end)
    returning id into saved;
  else
    update public.trainings tr
    set title = clean_title, provider = clean_provider, format = save_training.format, details = clean_details,
        venue = case when save_training.format = 'in_person' then clean_venue end,
        starts_at = save_training.starts_at, seats = save_training.seats,
        downloads_allowed = coalesce(save_training.downloads_allowed, false), status = next_status,
        review_reason = case when next_status = 'draft' then tr.review_reason end,
        submitted_at = case when next_status <> 'draft' then now() end,
        published_at = case when next_status = 'published' then now() end
    where tr.id = training;
    saved := training;
  end if;

  return query select next_status, saved;
end;
$$;

-- Staff decide a training waiting for review. A rejected one goes back to Draft with the reason.
create function access.decide_training(training uuid, approve boolean, reason text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  post public.trainings;
  clean_reason text := nullif(btrim(coalesce(reason, '')), '');
begin
  if not (select access.is_staff()) then
    raise exception 'not_allowed';
  end if;
  select * into post from public.trainings tr where tr.id = training for update;
  if not found then
    return 'not_found';
  end if;
  if post.status <> 'pending_review' then
    return 'already_decided';
  end if;
  if approve then
    update public.trainings set status = 'published', published_at = now(), review_reason = null where id = training;
    perform private.notify(post.poster_member_id, 'O5',
                           jsonb_build_object('title', post.title, 'training_id', post.id::text));
    return 'ok';
  end if;
  if clean_reason is null or char_length(clean_reason) > 600 then
    return 'reason_required';
  end if;
  if private.holds_contact_details(jsonb_build_object('reason', clean_reason)) then
    return 'reason_has_contact_details';
  end if;
  update public.trainings set status = 'draft', review_reason = clean_reason, submitted_at = null where id = training;
  perform private.notify(post.poster_member_id, 'O6',
                         jsonb_build_object('title', post.title, 'reason', clean_reason, 'training_id', post.id::text));
  return 'ok';
end;
$$;

-- Register for a published training. A scheduled one must not have started; a self-paced one is always open.
create function access.register_for_training(training uuid)
returns table (result text, waitlist_position int)
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  post public.trainings;
  mine public.registrations;
  taken int;
  next_position int;
begin
  if not (select access.is_member()) then
    raise exception 'not_allowed';
  end if;
  select * into post from public.trainings tr where tr.id = training for update;
  if not found or post.status <> 'published' then
    return query select 'not_found'::text, null::int; return;
  end if;
  if post.starts_at is not null and post.starts_at <= now() then
    return query select 'started'::text, null::int; return;
  end if;
  select * into mine from public.registrations r where r.training_id = training and r.member_id = me;
  if found and mine.status in ('registered', 'waitlisted') then
    return query select mine.status, mine.waitlist_position; return;
  end if;

  select count(*) into taken from public.registrations r where r.training_id = training and r.status = 'registered';
  if taken < post.seats then
    insert into public.registrations (member_id, training_id, status) values (me, training, 'registered')
    on conflict (member_id, training_id) do update set status = 'registered', waitlist_position = null;
    return query select 'registered'::text, null::int; return;
  end if;

  select coalesce(max(r.waitlist_position), 0) + 1 into next_position
  from public.registrations r where r.training_id = training and r.status = 'waitlisted';
  insert into public.registrations (member_id, training_id, status, waitlist_position)
  values (me, training, 'waitlisted', next_position)
  on conflict (member_id, training_id) do update set status = 'waitlisted', waitlist_position = next_position;
  return query select 'waitlisted'::text, next_position;
end;
$$;

-- Cancel a place or leave the waitlist. A freed place goes to the first member waiting (W1).
create function access.cancel_training_registration(training uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  post public.trainings;
  mine public.registrations;
  first_waiting public.registrations;
begin
  if not (select access.is_member()) then
    raise exception 'not_allowed';
  end if;
  select * into post from public.trainings tr where tr.id = training for update;
  if not found then
    return 'not_found';
  end if;
  select * into mine from public.registrations r
  where r.training_id = training and r.member_id = me and r.status in ('registered', 'waitlisted');
  if not found then
    return 'not_registered';
  end if;
  update public.registrations set status = 'cancelled', waitlist_position = null where id = mine.id;

  if mine.status = 'registered' and post.status = 'published' and (post.starts_at is null or post.starts_at > now()) then
    select * into first_waiting from public.registrations r
    where r.training_id = training and r.status = 'waitlisted' order by r.waitlist_position limit 1;
    if found then
      update public.registrations set status = 'registered', waitlist_position = null where id = first_waiting.id;
      perform private.notify(first_waiting.member_id, 'W1',
                             jsonb_build_object('title', post.title, 'training_id', post.id::text));
    end if;
  end if;
  return 'ok';
end;
$$;

-- Published training that is self-paced or not long started, with seats taken and the caller's registration;
-- and the poster's own drafts and training waiting for review.
create function access.trainings_feed()
returns table (training_id uuid, title text, provider text, format text, details text, venue text,
               starts_at timestamptz, seats int, registered int, downloads_allowed boolean, status text,
               review_reason text, is_mine boolean, my_status text, my_waitlist_position int)
language sql stable security definer set search_path = '' as $$
  select tr.id, tr.title, tr.provider, tr.format, tr.details, tr.venue, tr.starts_at, tr.seats,
         (select count(*)::int from public.registrations r where r.training_id = tr.id and r.status = 'registered'),
         tr.downloads_allowed, tr.status, case when tr.poster_member_id = auth.uid() then tr.review_reason end,
         tr.poster_member_id = auth.uid(), mine.status, mine.waitlist_position
  from public.trainings tr
  left join public.registrations mine
    on mine.training_id = tr.id and mine.member_id = auth.uid() and mine.status in ('registered', 'waitlisted')
  where (select access.is_member())
    and ((tr.status = 'published' and (tr.starts_at is null or tr.starts_at > now() - interval '3 hours'))
         or (tr.poster_member_id = auth.uid() and tr.status in ('draft', 'pending_review')))
  order by tr.starts_at nulls last, tr.published_at desc;
$$;

-- The poster's registrant list: names and profiles only, never contact details.
create function access.training_registrants(training uuid)
returns table (member_id uuid, full_name text, headline text, photo_path text, status text, waitlist_position int)
language sql stable security definer set search_path = '' as $$
  select r.member_id, p.full_name, p.headline, p.photo_path, r.status, r.waitlist_position
  from public.registrations r
  join public.trainings tr on tr.id = r.training_id
  left join public.profiles p on p.member_id = r.member_id
  where r.training_id = training and r.status in ('registered', 'waitlisted', 'attended')
    and ((tr.poster_member_id = auth.uid() and (select access.is_member())) or (select access.is_staff()))
  order by r.status, r.waitlist_position nulls first, p.full_name;
$$;

create function access.training_review_queue()
returns table (training_id uuid, title text, provider text, format text, details text, venue text,
               starts_at timestamptz, seats int, poster_username text, submitted_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select tr.id, tr.title, tr.provider, tr.format, tr.details, tr.venue, tr.starts_at, tr.seats, m.username::text,
         tr.submitted_at
  from public.trainings tr
  left join public.members m on m.id = tr.poster_member_id
  where tr.status = 'pending_review' and (select access.is_staff())
  order by tr.submitted_at;
$$;

-- The dashboard's "My activity": the caller's upcoming or self-paced training and upcoming events.
create function access.my_registrations()
returns table (kind text, item_id uuid, title text, starts_at timestamptz, status text, waitlist_position int)
language sql stable security definer set search_path = '' as $$
  select 'training', tr.id, tr.title, tr.starts_at, r.status, r.waitlist_position
  from public.registrations r join public.trainings tr on tr.id = r.training_id
  where r.member_id = auth.uid() and r.status in ('registered', 'waitlisted') and tr.status = 'published'
    and (tr.starts_at is null or tr.starts_at > now()) and (select access.is_member())
  union all
  select 'event', e.id, e.title, e.starts_at, r.status, r.waitlist_position
  from public.registrations r join public.events e on e.id = r.event_id
  where r.member_id = auth.uid() and r.status in ('registered', 'waitlisted') and e.status = 'published'
    and e.starts_at > now() and (select access.is_member())
  order by 4 nulls last, 3;
$$;

-- Reminders: scheduled training gets T1 and T2 too, through the same job and log as events.
create or replace function private.send_event_reminders() returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  due record;
  sent int := 0;
begin
  for due in
    select r.id as registration_id, r.member_id, x.item_key, x.item_id, x.title, x.starts_at,
           case when x.starts_at <= now() + interval '1 hour' then 'T2' else 'T1' end as reminder
    from public.registrations r
    join lateral (
      select 'event_id' as item_key, e.id as item_id, e.title, e.starts_at, e.status
      from public.events e where e.id = r.event_id
      union all
      select 'training_id', tr.id, tr.title, tr.starts_at, tr.status
      from public.trainings tr where tr.id = r.training_id
    ) x on true
    join public.members m on m.id = r.member_id
    where r.status = 'registered' and x.status = 'published' and m.status = 'approved'
      and x.starts_at > now() and x.starts_at <= now() + interval '24 hours'
  loop
    insert into private.event_reminders (registration_id, reminder, starts_at)
    values (due.registration_id, due.reminder, due.starts_at)
    on conflict do nothing;
    if found then
      perform private.notify(due.member_id, due.reminder,
        jsonb_build_object('title', due.title, due.item_key, due.item_id::text,
                           'time', to_char(due.starts_at at time zone 'Africa/Dar_es_Salaam', 'HH24:MI')));
      sent := sent + 1;
    end if;
  end loop;
  return sent;
end;
$$;
revoke all on function private.send_event_reminders() from public, anon, authenticated;

revoke all on function access.can_post_training(),
  access.save_training(uuid, text, text, text, text, text, timestamptz, int, boolean, boolean),
  access.decide_training(uuid, boolean, text), access.register_for_training(uuid),
  access.cancel_training_registration(uuid), access.trainings_feed(), access.training_registrants(uuid),
  access.training_review_queue(), access.my_registrations()
  from public, anon;
grant execute on function access.can_post_training(),
  access.save_training(uuid, text, text, text, text, text, timestamptz, int, boolean, boolean),
  access.decide_training(uuid, boolean, text), access.register_for_training(uuid),
  access.cancel_training_registration(uuid), access.trainings_feed(), access.training_registrants(uuid),
  access.training_review_queue(), access.my_registrations()
  to authenticated;

create function public.can_post_training() returns boolean
language sql stable security invoker set search_path = '' as $$ select access.can_post_training(); $$;
create function public.save_training(
  training uuid, title text, provider text, format text, details text, venue text, starts_at timestamptz,
  seats int, downloads_allowed boolean, submit boolean
) returns table (result text, training_id uuid)
language sql volatile security invoker set search_path = '' as $$
  select * from access.save_training(training, title, provider, format, details, venue, starts_at, seats,
                                     downloads_allowed, submit);
$$;
create function public.decide_training(training uuid, approve boolean, reason text) returns text
language sql volatile security invoker set search_path = '' as $$
  select access.decide_training(training, approve, reason);
$$;
create function public.register_for_training(training uuid) returns table (result text, waitlist_position int)
language sql volatile security invoker set search_path = '' as $$
  select * from access.register_for_training(training);
$$;
create function public.cancel_training_registration(training uuid) returns text
language sql volatile security invoker set search_path = '' as $$
  select access.cancel_training_registration(training);
$$;
create function public.trainings_feed()
returns table (training_id uuid, title text, provider text, format text, details text, venue text,
               starts_at timestamptz, seats int, registered int, downloads_allowed boolean, status text,
               review_reason text, is_mine boolean, my_status text, my_waitlist_position int)
language sql stable security invoker set search_path = '' as $$ select * from access.trainings_feed(); $$;
create function public.training_registrants(training uuid)
returns table (member_id uuid, full_name text, headline text, photo_path text, status text, waitlist_position int)
language sql stable security invoker set search_path = '' as $$
  select * from access.training_registrants(training);
$$;
create function public.training_review_queue()
returns table (training_id uuid, title text, provider text, format text, details text, venue text,
               starts_at timestamptz, seats int, poster_username text, submitted_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from access.training_review_queue(); $$;
create function public.my_registrations()
returns table (kind text, item_id uuid, title text, starts_at timestamptz, status text, waitlist_position int)
language sql stable security invoker set search_path = '' as $$ select * from access.my_registrations(); $$;

revoke all on function public.can_post_training(),
  public.save_training(uuid, text, text, text, text, text, timestamptz, int, boolean, boolean),
  public.decide_training(uuid, boolean, text), public.register_for_training(uuid),
  public.cancel_training_registration(uuid), public.trainings_feed(), public.training_registrants(uuid),
  public.training_review_queue(), public.my_registrations()
  from public, anon;
grant execute on function public.can_post_training(),
  public.save_training(uuid, text, text, text, text, text, timestamptz, int, boolean, boolean),
  public.decide_training(uuid, boolean, text), public.register_for_training(uuid),
  public.cancel_training_registration(uuid), public.trainings_feed(), public.training_registrants(uuid),
  public.training_review_queue(), public.my_registrations()
  to authenticated;
