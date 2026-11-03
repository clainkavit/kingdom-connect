create table public.connection_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null default auth.uid() references public.members (id),
  receiver_id uuid not null references public.members (id),
  note text check (char_length(note) <= 300),
  status text not null default 'sent' check (status in ('sent', 'accepted', 'declined', 'withdrawn')),
  responded_at timestamptz,
  expires_at timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> receiver_id)
);
create index connection_requests_receiver on public.connection_requests (receiver_id, status);
create index connection_requests_requester on public.connection_requests (requester_id, created_at);
create trigger set_updated_at before update on public.connection_requests
  for each row execute function private.set_updated_at();

alter table public.connection_requests enable row level security;
create policy "base rule" on public.connection_requests as restrictive for all to authenticated
  using ((select access.is_member()) or (select access.is_staff()))
  with check ((select access.is_member()) or (select access.is_staff()));

create function access.requests_sent_today() returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.connection_requests r
  where r.requester_id = auth.uid()
    and r.created_at >= ((now() at time zone 'Africa/Dar_es_Salaam')::date::timestamp
                         at time zone 'Africa/Dar_es_Salaam');
$$;

create function access.has_open_request(requester uuid, receiver uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.connection_requests r
                 where r.requester_id = requester and r.receiver_id = receiver
                   and r.status = 'sent' and r.expires_at > now());
$$;

create function access.has_live_request(requester uuid, receiver uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.connection_requests r
                 where r.requester_id = requester and r.receiver_id = receiver
                   and r.status in ('sent', 'declined') and r.expires_at > now());
$$;

create function access.connection_state(other uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when access.is_connected(auth.uid(), other) then 'connected'
    when access.has_live_request(auth.uid(), other) then 'sent'
    when access.has_open_request(other, auth.uid()) then 'received'
    else 'none'
  end;
$$;

revoke all on function access.requests_sent_today(), access.has_open_request(uuid, uuid),
  access.has_live_request(uuid, uuid), access.connection_state(uuid) from public, anon;
grant execute on function access.requests_sent_today(), access.has_open_request(uuid, uuid),
  access.has_live_request(uuid, uuid), access.connection_state(uuid) to authenticated;

revoke all on public.connection_requests from anon, authenticated;
grant select (id, requester_id, receiver_id, note, expires_at, created_at), insert (receiver_id, note),
  update (status) on public.connection_requests to authenticated;

create policy "the two members" on public.connection_requests for select to authenticated
  using ((select auth.uid()) in (requester_id, receiver_id));
create policy "members send, 30 a day" on public.connection_requests for insert to authenticated
  with check (requester_id = (select auth.uid()) and (select access.is_member())
              and (select access.requests_sent_today()) < 30);
create policy "the two members answer or withdraw" on public.connection_requests for update to authenticated
  using ((select auth.uid()) in (requester_id, receiver_id))
  with check ((select auth.uid()) in (requester_id, receiver_id));

create function private.check_connection_request() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('connection_requests:' || new.requester_id::text));
  perform pg_advisory_xact_lock(hashtext('connection_pair:' || least(new.requester_id, new.receiver_id)::text
                                         || greatest(new.requester_id, new.receiver_id)::text));
  if (select access.requests_sent_today()) >= 30 then
    raise exception 'daily_limit';
  end if;
  if not exists (select 1 from public.members m where m.id = new.receiver_id and m.status = 'approved') then
    raise exception 'not_available';
  end if;
  if access.is_blocked(new.requester_id, new.receiver_id) then
    raise exception 'not_available';
  end if;
  if access.is_connected(new.requester_id, new.receiver_id) then
    raise exception 'already_connected';
  end if;
  if access.has_live_request(new.requester_id, new.receiver_id) then
    raise exception 'already_sent';
  end if;
  if access.has_open_request(new.receiver_id, new.requester_id) then
    raise exception 'they_asked_you';
  end if;
  if access.has_live_request(new.receiver_id, new.requester_id) then
    update public.connection_requests set status = 'accepted', responded_at = now()
    where requester_id = new.receiver_id and receiver_id = new.requester_id
      and status = 'declined' and expires_at > now();
    return null;
  end if;
  new.note := nullif(btrim(new.note), '');
  new.status := 'sent';
  new.responded_at := null;
  new.expires_at := now() + interval '30 days';
  return new;
end;
$$;
create trigger check_connection_request before insert on public.connection_requests
  for each row execute function private.check_connection_request();

create function private.announce_connection_request() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.notify(new.receiver_id, 'C1', jsonb_build_object(
    'name', coalesce((select p.full_name from public.profiles p where p.member_id = new.requester_id), ''),
    'request_id', new.id::text));
  return null;
end;
$$;
create trigger announce_connection_request after insert on public.connection_requests
  for each row execute function private.announce_connection_request();

create function private.check_request_answer() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if old.expires_at <= now() then
    raise exception 'request_closed';
  end if;
  if new.status in ('accepted', 'declined') then
    if auth.uid() <> old.receiver_id or old.status <> 'sent' then
      raise exception 'request_closed';
    end if;
  elsif new.status = 'withdrawn' then
    if auth.uid() <> old.requester_id or old.status not in ('sent', 'declined') then
      raise exception 'request_closed';
    end if;
  else
    raise exception 'request_closed';
  end if;
  new.responded_at := now();
  return new;
end;
$$;
create trigger check_request_answer before update of status on public.connection_requests
  for each row execute function private.check_request_answer();

create function private.complete_connection() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'accepted' and old.status <> 'accepted' then
    insert into public.connections (member_a, member_b)
    values (least(new.requester_id, new.receiver_id), greatest(new.requester_id, new.receiver_id))
    on conflict (member_a, member_b) do nothing;
    update public.connection_requests set status = 'withdrawn', responded_at = now()
    where id <> new.id and status in ('sent', 'declined') and expires_at > now()
      and least(requester_id, receiver_id) = least(new.requester_id, new.receiver_id)
      and greatest(requester_id, receiver_id) = greatest(new.requester_id, new.receiver_id);
    perform private.notify(new.requester_id, 'C2', jsonb_build_object(
      'name', coalesce((select p.full_name from public.profiles p where p.member_id = new.receiver_id), '')));
  end if;
  return null;
end;
$$;
create trigger complete_connection after update of status on public.connection_requests
  for each row execute function private.complete_connection();

create function private.end_on_block() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.connections
  where member_a = least(new.blocker_id, new.blocked_id) and member_b = greatest(new.blocker_id, new.blocked_id);
  update public.connection_requests set status = 'withdrawn', responded_at = now()
  where status in ('sent', 'declined') and expires_at > now()
    and ((requester_id = new.blocker_id and receiver_id = new.blocked_id)
         or (requester_id = new.blocked_id and receiver_id = new.blocker_id));
  return null;
end;
$$;
create trigger end_on_block after insert on public.blocks
  for each row execute function private.end_on_block();

create function access.my_sent_requests()
returns table (request_id uuid, receiver_id uuid, full_name text, headline text, photo_path text, sent_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.receiver_id, p.full_name, p.headline, p.photo_path, r.created_at
  from public.connection_requests r
  left join public.profiles p on p.member_id = r.receiver_id
  where r.requester_id = auth.uid() and (select access.is_member())
    and r.status in ('sent', 'declined') and r.expires_at > now()
    and not access.is_blocked(auth.uid(), r.receiver_id)
  order by r.created_at desc;
$$;

create function access.my_received_requests()
returns table (request_id uuid, requester_id uuid, full_name text, headline text, photo_path text, note text,
               sent_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.requester_id, p.full_name, p.headline, p.photo_path, r.note, r.created_at
  from public.connection_requests r
  left join public.profiles p on p.member_id = r.requester_id
  where r.receiver_id = auth.uid() and (select access.is_member())
    and r.status = 'sent' and r.expires_at > now()
  order by r.created_at desc;
$$;

create function access.my_blocks() returns table (member_id uuid, full_name text)
language sql stable security definer set search_path = '' as $$
  select b.blocked_id, p.full_name
  from public.blocks b
  left join public.profiles p on p.member_id = b.blocked_id
  where b.blocker_id = auth.uid() and (select access.is_member())
  order by p.full_name;
$$;

revoke all on function access.my_sent_requests(), access.my_received_requests(), access.my_blocks()
  from public, anon;
grant execute on function access.my_sent_requests(), access.my_received_requests(), access.my_blocks()
  to authenticated;

create function public.my_sent_requests()
returns table (request_id uuid, receiver_id uuid, full_name text, headline text, photo_path text, sent_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select * from access.my_sent_requests();
$$;
create function public.my_received_requests()
returns table (request_id uuid, requester_id uuid, full_name text, headline text, photo_path text, note text,
               sent_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select * from access.my_received_requests();
$$;
create function public.my_blocks() returns table (member_id uuid, full_name text)
language sql stable security invoker set search_path = '' as $$
  select * from access.my_blocks();
$$;
create function public.connection_state(member_id uuid) returns text
language sql stable security invoker set search_path = '' as $$
  select access.connection_state(member_id);
$$;
revoke all on function public.my_sent_requests(), public.my_received_requests(), public.my_blocks(),
  public.connection_state(uuid) from public, anon;
grant execute on function public.my_sent_requests(), public.my_received_requests(), public.my_blocks(),
  public.connection_state(uuid) to authenticated;

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
           or access.has_open_request(member_id, (select auth.uid())))
    )
  );

drop function public.search_directory(text, text, text, uuid, uuid, uuid, boolean, int, int);
create function public.search_directory(
  q text default null,
  profession text default null,
  skill text default null,
  sector uuid default null,
  region uuid default null,
  district uuid default null,
  studying boolean default null,
  page int default 0,
  page_size int default 20
) returns table (
  member_id uuid,
  full_name text,
  headline text,
  region_en text,
  region_sw text,
  district_en text,
  district_sw text,
  top_skills text[],
  verified_business boolean,
  photo_path text,
  relation text
)
language sql stable security invoker set search_path = '' as $$
  with params as (
    select nullif(lower(btrim(q)), '') as q,
           nullif(lower(btrim(profession)), '') as profession,
           (select coalesce(
              (select y.skill_id from public.skill_synonyms y
               where y.from_name = lower(btrim(skill))::extensions.citext),
              (select s.id from public.skills s where s.name = lower(btrim(skill))::extensions.citext)))
             as skill_id,
           nullif(btrim(coalesce(skill, '')), '') is not null as skill_given,
           (now() at time zone 'Africa/Dar_es_Salaam')::date::text as today
  ),
  matches as materialized (
    select dm.member_id, dm.rank from params, access.directory_matches(params.q) dm
  ),
  listed as (
    select p.*, coalesce(m.rank, 0) as rank,
      md5(p.member_id::text || params.today) as shuffle
    from public.profiles p
    cross join params
    left join matches m on m.member_id = p.member_id
    where (params.q is null or m.member_id is not null)
      and not p.hidden_from_directory
      and p.member_id <> (select auth.uid())
      and (params.profession is null or p.profession ilike access.like_pattern(params.profession))
      and (not params.skill_given
           or exists (select 1 from public.profile_skills ps
                      where ps.member_id = p.member_id and ps.skill_id = params.skill_id))
      and (sector is null or p.category_details ->> 'sectorId' = sector::text)
      and (region is null or p.region_id = region)
      and (district is null or p.district_id = district)
      and (studying is null or (p.study_institution is not null) = studying)
  ),
  page_rows as (
    select l.* from listed l
    order by l.rank desc, l.shuffle
    limit least(greatest(page_size, 1), 50) + 1
    offset greatest(page, 0) * least(greatest(page_size, 1), 50)
  )
  select l.member_id, l.full_name, l.headline,
         r.name_en, r.name_sw, d.name_en, d.name_sw,
         array(select s.name::text from public.profile_skills ps join public.skills s on s.id = ps.skill_id
               where ps.member_id = l.member_id
               order by (s.id = (select skill_id from params)) desc,
                        ((select q from params) is not null
                         and s.name::text ilike access.like_pattern((select q from params))) desc,
                        s.name
               limit 3),
         access.member_level(l.member_id) >= 2,
         l.photo_path,
         access.connection_state(l.member_id)
  from page_rows l
  left join public.regions r on r.id = l.region_id
  left join public.districts d on d.id = l.district_id
  order by l.rank desc, l.shuffle;
$$;
revoke all on function public.search_directory(text, text, text, uuid, uuid, uuid, boolean, int, int) from public, anon;
grant execute on function public.search_directory(text, text, text, uuid, uuid, uuid, boolean, int, int) to authenticated;
