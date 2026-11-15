-- O15 (OPP-7, decided 14 Nov 2026; answer period and ranking decided 15 Nov 2026, ticket #289): Let Kingdom
-- Connect pick. A Poster-level member asks staff to pick 5, 10, 15 or 20 people. Staff see rule-based suggestions
-- (no AI, nothing sent outside), pick people with a note each, and ask them. Each picked member has 3 days to say
-- yes; only those who say yes reach the poster, once staff send the list. Beta and free; no payment of any kind.

alter table public.opportunities add column find_mode text not null default 'open'
  check (find_mode in ('open', 'pick'));

create table public.pick_requests (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null unique references public.opportunities (id),
  wanted int not null check (wanted in (5, 10, 15, 20)),
  note text not null default '' check (char_length(note) <= 500),
  status text not null default 'waiting' check (status in ('waiting', 'picking', 'asking', 'sent', 'stopped')),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.pick_requests
  for each row execute function private.set_updated_at();

create table public.picks (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.pick_requests (id),
  member_id uuid not null references public.members (id),
  picked_by uuid not null references public.staff (id),
  why text not null check (char_length(why) between 1 and 300),
  rank int not null,
  status text not null default 'asked' check (status in ('asked', 'agreed', 'declined', 'expired', 'replaced')),
  asked_at timestamptz not null default now(),
  answered_by timestamptz not null default now() + interval '3 days',
  answered_at timestamptz,
  poster_view text not null default 'none' check (poster_view in ('none', 'connect', 'not_fit')),
  unique (request_id, member_id)
);
create index picks_member on public.picks (member_id);

alter table public.pick_requests enable row level security;
alter table public.picks enable row level security;
revoke all on public.pick_requests, public.picks from anon, authenticated;
grant select on public.pick_requests, public.picks to authenticated;
create policy "base rule" on public.pick_requests as restrictive for all to authenticated
  using ((select access.is_staff()));
create policy "staff read" on public.pick_requests for select to authenticated using ((select access.is_staff()));
create policy "base rule" on public.picks as restrictive for all to authenticated
  using ((select access.is_staff()));
create policy "staff read" on public.picks for select to authenticated using ((select access.is_staff()));

create trigger audit after insert or update on public.pick_requests
  for each row execute function private.log_change();
create trigger audit after insert or update on public.picks
  for each row execute function private.log_change();

-- A request made on a draft waits until staff approve the post.
create function private.pick_request_on_publish() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.pick_requests set status = 'picking'
  where opportunity_id = new.id and status = 'waiting';
  return new;
end $$;
create trigger pick_request_on_publish after update of status on public.opportunities
  for each row when (new.status = 'published' and old.status is distinct from 'published')
  execute function private.pick_request_on_publish();

-- Poster: ask Kingdom Connect to pick (S20, the last posting step).
create function access.request_pick(opportunity uuid, wanted int, note text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  post public.opportunities;
  clean text := btrim(coalesce(note, ''));
begin
  select * into post from public.opportunities o where o.id = opportunity for update;
  if not found or not (select access.is_member()) or post.poster_member_id is distinct from auth.uid() then
    return 'not_found';
  end if;
  if post.status not in ('draft', 'pending_review', 'published') then return 'not_allowed'; end if;
  if wanted is null or wanted not in (5, 10, 15, 20) or char_length(clean) > 500 then return 'invalid'; end if;
  if private.holds_contact_details(jsonb_build_object('note', clean)) then return 'contact_details'; end if;
  if exists (select 1 from public.pick_requests r where r.opportunity_id = opportunity) then
    return 'already_requested';
  end if;
  update public.opportunities set find_mode = 'pick' where id = opportunity;
  insert into public.pick_requests (opportunity_id, wanted, note, status)
  values (opportunity, wanted, clean, case when post.status = 'published' then 'picking' else 'waiting' end);
  return 'ok';
end $$;

-- Poster: Open to applicants instead (S50). Asks still open lapse.
create function access.stop_pick(opportunity uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  req public.pick_requests;
begin
  select r.* into req from public.pick_requests r join public.opportunities o on o.id = r.opportunity_id
  where r.opportunity_id = opportunity and o.poster_member_id = auth.uid() and (select access.is_member())
  for update of r;
  if not found then return 'not_found'; end if;
  if req.status in ('sent', 'stopped') then return 'not_allowed'; end if;
  update public.pick_requests set status = 'stopped' where id = req.id;
  update public.picks set status = 'expired' where request_id = req.id and status = 'asked';
  update public.opportunities set find_mode = 'open' where id = opportunity;
  return 'ok';
end $$;

-- Poster: the request's progress (S50). Counts of asked or declined people are never shown.
create function access.my_pick_request(opportunity uuid)
returns table (status text, wanted int, note text, agreed int, sent_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.status, r.wanted, r.note,
         case when r.status = 'sent'
              then (select count(*)::int from public.picks p where p.request_id = r.id and p.status = 'agreed') end,
         r.sent_at
  from public.pick_requests r join public.opportunities o on o.id = r.opportunity_id
  where r.opportunity_id = my_pick_request.opportunity and o.poster_member_id = auth.uid()
    and (select access.is_member());
$$;

-- Poster: the list, only people who said yes, in the order staff recommend, once sent (S50).
create function access.pick_list(opportunity uuid)
returns table (pick_id uuid, member_id uuid, full_name text, headline text, region_en text, region_sw text,
               verified_business boolean, why text, poster_view text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.member_id, pr.full_name, pr.headline, rg.name_en, rg.name_sw,
         exists (select 1 from public.businesses b where b.member_id = p.member_id and b.status = 'approved'),
         p.why, p.poster_view
  from public.pick_requests r
  join public.opportunities o on o.id = r.opportunity_id
  join public.picks p on p.request_id = r.id and p.status = 'agreed'
  join public.members m on m.id = p.member_id and m.status = 'approved'
  left join public.profiles pr on pr.member_id = p.member_id
  left join public.regions rg on rg.id = pr.region_id
  where r.opportunity_id = pick_list.opportunity and r.status = 'sent'
    and o.poster_member_id = auth.uid() and (select access.is_member())
  order by p.rank;
$$;

-- Poster: Connect or Not a fit, which the member is not told.
create function access.set_pick_view(pick uuid, view text) returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  if view is null or view not in ('none', 'connect', 'not_fit') then return 'invalid'; end if;
  update public.picks p set poster_view = view
  from public.pick_requests r, public.opportunities o
  where p.id = pick and r.id = p.request_id and o.id = r.opportunity_id and p.status = 'agreed'
    and r.status = 'sent' and o.poster_member_id = auth.uid() and (select access.is_member());
  return case when found then 'ok' else 'not_found' end;
end $$;

-- Member: my invites (S51), without the rank.
create function access.my_pick_invites()
returns table (pick_id uuid, opportunity_id uuid, title text, poster_name text, why text, status text,
               answered_by timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, o.id, o.title, private.viewer_name(o.poster_member_id), p.why, p.status, p.answered_by
  from public.picks p
  join public.pick_requests r on r.id = p.request_id
  join public.opportunities o on o.id = r.opportunity_id
  where p.member_id = auth.uid() and (select access.is_member())
  order by p.asked_at desc;
$$;

-- Member: Yes, share my profile, or No, thanks. A no and a late answer are private.
create function access.answer_pick(pick uuid, yes boolean) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  found_pick public.picks;
begin
  select * into found_pick from public.picks p where p.id = pick for update;
  if not found or not (select access.is_member()) or found_pick.member_id <> auth.uid() then return 'not_found'; end if;
  if found_pick.status <> 'asked' then return 'already_answered'; end if;
  if found_pick.answered_by <= now() then
    update public.picks set status = 'expired' where id = pick;
    return 'expired';
  end if;
  update public.picks set status = case when coalesce(yes, false) then 'agreed' else 'declined' end,
                          answered_at = now()
  where id = pick;
  return 'ok';
end $$;

-- Staff: posts waiting for a pick (A18).
create function access.pick_queue()
returns table (request_id uuid, opportunity_id uuid, title text, poster_name text, wanted int, note text,
               status text, asked int, agreed int, declined int, expired int, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select access.is_staff()) then raise exception 'not_allowed'; end if;
  return query
  select r.id, o.id, o.title,
         coalesce((select p.full_name from public.profiles p where p.member_id = o.poster_member_id), ''),
         r.wanted, r.note, r.status,
         (select count(*)::int from public.picks p where p.request_id = r.id and p.status = 'asked'),
         (select count(*)::int from public.picks p where p.request_id = r.id and p.status = 'agreed'),
         (select count(*)::int from public.picks p where p.request_id = r.id and p.status = 'declined'),
         (select count(*)::int from public.picks p where p.request_id = r.id and p.status = 'expired'),
         r.created_at
  from public.pick_requests r join public.opportunities o on o.id = r.opportunity_id
  where r.status in ('picking', 'asking')
  order by r.created_at;
end $$;

-- Staff: rule-based suggestions (decided 15 Nov 2026). Points: each matching skill 3, same sector 2, same region 1,
-- verified business 2, each finished milestone plan 1, the share who would work with them again x3, each upheld
-- report in the last 12 months -5. Never reads investor_flags, member_private or ID data.
create function access.pick_suggestions(request uuid, max_rows int default 20)
returns table (member_id uuid, full_name text, headline text, skill_matches int, same_sector boolean,
               same_region boolean, verified_business boolean, finished_plans int, ratings_total int,
               ratings_again int, upheld_reports int, score numeric)
language plpgsql stable security definer set search_path = '' as $$
declare
  req public.pick_requests;
  post public.opportunities;
begin
  if not (select access.is_staff()) then raise exception 'not_allowed'; end if;
  select * into req from public.pick_requests r where r.id = request;
  if not found then return; end if;
  select * into post from public.opportunities o where o.id = req.opportunity_id;
  return query
  with candidates as (
    select m.id,
           (select count(*)::int from public.profile_skills ps
            join public.opportunity_skills os on os.skill_id = ps.skill_id and os.opportunity_id = post.id
            where ps.member_id = m.id) as skills,
           exists (select 1 from public.businesses b
                   where b.member_id = m.id and b.status = 'approved' and b.sector_id = post.sector_id) as sector,
           (pr.region_id is not null and pr.region_id = post.region_id) as region,
           exists (select 1 from public.businesses b where b.member_id = m.id and b.status = 'approved') as business,
           (select count(*)::int from public.milestone_plans mp
            where mp.status = 'completed' and m.id in (mp.member_a, mp.member_b)) as plans,
           (select count(*)::int from public.ratings rt where rt.ratee_id = m.id and rt.revealed_at is not null) as total,
           (select count(*)::int from public.ratings rt
            where rt.ratee_id = m.id and rt.revealed_at is not null and rt.again) as again,
           (select count(*)::int from public.reports rp
            where rp.subject_id = m.id and rp.status = 'action_taken'
              and rp.decided_at > now() - interval '12 months') as reports,
           pr.full_name, pr.headline
    from public.members m
    left join public.profiles pr on pr.member_id = m.id
    where m.status = 'approved' and m.id is distinct from post.poster_member_id
      and not exists (select 1 from public.picks p where p.request_id = req.id and p.member_id = m.id)
      and not exists (select 1 from public.blocks bl
                      where (bl.blocker_id = m.id and bl.blocked_id = post.poster_member_id)
                         or (bl.blocker_id = post.poster_member_id and bl.blocked_id = m.id))
  )
  select c.id, coalesce(c.full_name, ''), c.headline, c.skills, c.sector, c.region, c.business, c.plans, c.total,
         c.again, c.reports,
         (c.skills * 3 + case when c.sector then 2 else 0 end + case when c.region then 1 else 0 end
          + case when c.business then 2 else 0 end + c.plans
          + case when c.total > 0 then round(3.0 * c.again / c.total, 2) else 0 end - c.reports * 5)::numeric
  from candidates c
  order by 12 desc, c.full_name
  limit greatest(1, least(coalesce(max_rows, 20), 100));
end $$;

-- Staff: ask the ticked members, each with a "Why we picked them" note. Sends O9.
create function access.ask_picks(request uuid, members uuid[], whys text[]) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  req public.pick_requests;
  post public.opportunities;
  next_rank int;
  asked int := 0;
  i int;
  why text;
begin
  if not (select access.is_staff()) then raise exception 'not_allowed'; end if;
  select * into req from public.pick_requests r where r.id = request for update;
  if not found or req.status not in ('picking', 'asking') then raise exception 'not_open'; end if;
  if coalesce(array_length(members, 1), 0) = 0 or array_length(members, 1) <> coalesce(array_length(whys, 1), 0) then
    raise exception 'invalid';
  end if;
  select * into post from public.opportunities o where o.id = req.opportunity_id;
  select coalesce(max(p.rank), 0) into next_rank from public.picks p where p.request_id = req.id;
  for i in 1 .. array_length(members, 1) loop
    why := btrim(coalesce(whys[i], ''));
    if why = '' or char_length(why) > 300 or private.holds_contact_details(jsonb_build_object('why', why)) then
      raise exception 'invalid_why';
    end if;
    if members[i] = post.poster_member_id
       or not exists (select 1 from public.members m where m.id = members[i] and m.status = 'approved') then
      raise exception 'invalid_member';
    end if;
    next_rank := next_rank + 1;
    insert into public.picks (request_id, member_id, picked_by, why, rank)
    values (req.id, members[i], auth.uid(), why, next_rank)
    on conflict (request_id, member_id) do nothing;
    if found then
      asked := asked + 1;
      perform private.notify(members[i], 'O9', jsonb_build_object('title', post.title, 'pick', 'yes'));
    end if;
  end loop;
  update public.pick_requests set status = 'asking' where id = req.id;
  return asked;
end $$;

-- Staff: send the list of people who said yes. Sends O10.
create function access.send_pick_list(request uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  req public.pick_requests;
  agreed int;
begin
  if not (select access.is_staff()) then raise exception 'not_allowed'; end if;
  select * into req from public.pick_requests r where r.id = request for update;
  if not found or req.status not in ('picking', 'asking') then return 'not_open'; end if;
  select count(*)::int into agreed from public.picks p where p.request_id = req.id and p.status = 'agreed';
  if agreed = 0 then return 'nobody_agreed'; end if;
  update public.pick_requests set status = 'sent', sent_at = now() where id = req.id;
  perform private.notify(o.poster_member_id, 'O10', jsonb_build_object('title', o.title, 'count', agreed))
  from public.opportunities o where o.id = req.opportunity_id;
  return 'ok';
end $$;

-- Daily-ish: asks past their 3 days lapse, privately.
create function private.expire_picks() returns int
language sql security definer set search_path = '' as $$
  with done as (update public.picks set status = 'expired' where status = 'asked' and answered_by <= now() returning 1)
  select count(*)::int from done;
$$;
revoke all on function private.expire_picks() from public, anon, authenticated;
select cron.schedule('expire-picks', '20 * * * *', $job$ select private.expire_picks() $job$);


-- A picked post takes no applications (PRD section 10).
create or replace function access.respond_to_opportunity(opportunity uuid, note text, attachment_path text)
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
  if not found or post.status <> 'published' or not post.open_now or not post.listable then
    return query select 'not_open'::text, null::uuid; return;
  end if;
  select o.poster_member_id into poster from public.opportunities o where o.id = opportunity;
  if poster = me then
    return query select 'own_post'::text, null::uuid; return;
  end if;
  if exists (select 1 from public.opportunities o where o.id = opportunity and o.find_mode = 'pick') then
    return query select 'picked_post'::text, null::uuid; return;
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
  begin
    insert into public.responses (opportunity_id, member_id, kind, note, attachment_path)
    values (opportunity, me, response_kind, clean_note, attachment_path) returning id into saved;
  exception when unique_violation then
    return query select 'already_responded'::text, null::uuid; return;
  end;
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

revoke all on function access.request_pick(uuid, int, text), access.stop_pick(uuid), access.my_pick_request(uuid), access.pick_list(uuid), access.set_pick_view(uuid, text), access.my_pick_invites(), access.answer_pick(uuid, boolean), access.pick_queue(), access.pick_suggestions(uuid, int), access.ask_picks(uuid, uuid[], text[]), access.send_pick_list(uuid) from public, anon;
grant execute on function access.request_pick(uuid, int, text), access.stop_pick(uuid), access.my_pick_request(uuid), access.pick_list(uuid), access.set_pick_view(uuid, text), access.my_pick_invites(), access.answer_pick(uuid, boolean), access.pick_queue(), access.pick_suggestions(uuid, int), access.ask_picks(uuid, uuid[], text[]), access.send_pick_list(uuid) to authenticated;

create function public.request_pick(opportunity uuid, wanted int, note text) returns text
language sql volatile security invoker set search_path = '' as $$ select access.request_pick(opportunity, wanted, note); $$;
create function public.stop_pick(opportunity uuid) returns text
language sql volatile security invoker set search_path = '' as $$ select access.stop_pick(opportunity); $$;
create function public.my_pick_request(opportunity uuid) returns table (status text, wanted int, note text, agreed int, sent_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from access.my_pick_request(opportunity); $$;
create function public.pick_list(opportunity uuid) returns table (pick_id uuid, member_id uuid, full_name text, headline text, region_en text, region_sw text,
               verified_business boolean, why text, poster_view text)
language sql stable security invoker set search_path = '' as $$ select * from access.pick_list(opportunity); $$;
create function public.set_pick_view(pick uuid, view text) returns text
language sql volatile security invoker set search_path = '' as $$ select access.set_pick_view(pick, view); $$;
create function public.my_pick_invites() returns table (pick_id uuid, opportunity_id uuid, title text, poster_name text, why text, status text,
               answered_by timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from access.my_pick_invites(); $$;
create function public.answer_pick(pick uuid, yes boolean) returns text
language sql volatile security invoker set search_path = '' as $$ select access.answer_pick(pick, yes); $$;
create function public.pick_queue() returns table (request_id uuid, opportunity_id uuid, title text, poster_name text, wanted int, note text,
               status text, asked int, agreed int, declined int, expired int, created_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from access.pick_queue(); $$;
create function public.pick_suggestions(request uuid, max_rows int default 20) returns table (member_id uuid, full_name text, headline text, skill_matches int, same_sector boolean,
               same_region boolean, verified_business boolean, finished_plans int, ratings_total int,
               ratings_again int, upheld_reports int, score numeric)
language sql stable security invoker set search_path = '' as $$ select * from access.pick_suggestions(request, max_rows); $$;
create function public.ask_picks(request uuid, members uuid[], whys text[]) returns int
language sql volatile security invoker set search_path = '' as $$ select access.ask_picks(request, members, whys); $$;
create function public.send_pick_list(request uuid) returns text
language sql volatile security invoker set search_path = '' as $$ select access.send_pick_list(request); $$;
revoke all on function public.request_pick(uuid, int, text), public.stop_pick(uuid), public.my_pick_request(uuid), public.pick_list(uuid), public.set_pick_view(uuid, text), public.my_pick_invites(), public.answer_pick(uuid, boolean), public.pick_queue(), public.pick_suggestions(uuid, int), public.ask_picks(uuid, uuid[], text[]), public.send_pick_list(uuid) from public, anon;
grant execute on function public.request_pick(uuid, int, text), public.stop_pick(uuid), public.my_pick_request(uuid), public.pick_list(uuid), public.set_pick_view(uuid, text), public.my_pick_invites(), public.answer_pick(uuid, boolean), public.pick_queue(), public.pick_suggestions(uuid, int), public.ask_picks(uuid, uuid[], text[]), public.send_pick_list(uuid) to authenticated;
