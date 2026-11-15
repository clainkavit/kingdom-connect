-- O17 (decided 14 Nov 2026, PRD section 10, OPP-8): work references. A rating opens only after work both sides
-- confirm: the poster marks a shortlisted response Hired and the worker says yes. Each side then rates the other once
-- within 14 days; neither rating shows until both have rated or the 14 days end. A profile shows references only from
-- 3 revealed ratings. A private note to staff is kept apart and is never readable by the person rated.

alter table public.responses drop constraint responses_status_check;
alter table public.responses add constraint responses_status_check
  check (status in ('new', 'shortlisted', 'declined', 'withdrawn', 'hired'));

create table public.engagements (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references public.opportunities (id),
  plan_id uuid unique references public.milestone_plans (id),
  response_id uuid unique references public.responses (id),
  poster_member_id uuid not null references public.members (id),
  worker_member_id uuid not null references public.members (id),
  marked_at timestamptz not null default now(),
  confirmed_at timestamptz,
  denied_at timestamptz,
  rating_closes_at timestamptz,
  created_at timestamptz not null default now(),
  check (num_nonnulls(opportunity_id, plan_id) = 1),
  check (poster_member_id <> worker_member_id),
  check (confirmed_at is null or denied_at is null)
);
create index engagements_poster on public.engagements (poster_member_id);
create index engagements_worker on public.engagements (worker_member_id);

create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements (id) on delete cascade,
  rater_id uuid not null references public.members (id),
  ratee_id uuid not null references public.members (id),
  on_time int not null check (on_time between 1 and 5),
  quality int not null check (quality between 1 and 5),
  communication int not null check (communication between 1 and 5),
  honesty int not null check (honesty between 1 and 5),
  again boolean not null,
  comment text not null default '' check (char_length(comment) <= 500),
  reply text check (char_length(reply) <= 300),
  revealed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (engagement_id, rater_id)
);
create index ratings_ratee on public.ratings (ratee_id) where revealed_at is not null;

create table public.rating_notes (
  rating_id uuid primary key references public.ratings (id) on delete cascade,
  note text not null check (char_length(note) between 1 and 500),
  created_at timestamptz not null default now()
);

alter table public.engagements enable row level security;
alter table public.ratings enable row level security;
alter table public.rating_notes enable row level security;
revoke all on public.engagements, public.ratings, public.rating_notes from anon, authenticated;
grant select on public.engagements, public.ratings, public.rating_notes to authenticated;

create policy "base rule" on public.engagements as restrictive for all to authenticated
  using ((select access.is_member()) or (select access.is_staff()));
create policy "the two sides and staff" on public.engagements for select to authenticated
  using (poster_member_id = (select auth.uid()) or worker_member_id = (select auth.uid())
         or (select access.is_staff()));
create policy "base rule" on public.ratings as restrictive for all to authenticated
  using ((select access.is_member()) or (select access.is_staff()));
create policy "own ratings, revealed ratings about me, staff" on public.ratings for select to authenticated
  using (rater_id = (select auth.uid()) or (ratee_id = (select auth.uid()) and revealed_at is not null)
         or (select access.is_staff()));
create policy "base rule" on public.rating_notes as restrictive for all to authenticated
  using ((select access.is_staff()));
create policy "staff only" on public.rating_notes for select to authenticated
  using ((select access.is_staff()));

create function access.mark_hired(response uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  found_response public.responses;
  post public.opportunities;
begin
  select * into found_response from public.responses r where r.id = response for update;
  if not found then return 'not_found'; end if;
  select * into post from public.opportunities o where o.id = found_response.opportunity_id;
  if not (select access.is_member()) or post.poster_member_id is distinct from auth.uid() then
    return 'not_found';
  end if;
  if found_response.status <> 'shortlisted' then return 'not_allowed'; end if;
  update public.responses set status = 'hired', decided_at = now() where id = response;
  insert into public.engagements (opportunity_id, response_id, poster_member_id, worker_member_id)
  values (post.id, response, post.poster_member_id, found_response.member_id);
  perform private.notify(found_response.member_id, 'O11', jsonb_build_object(
    'title', post.title, 'name', coalesce((select p.full_name from public.profiles p where p.member_id = auth.uid()), ''),
    'opportunity_id', post.id::text));
  return 'ok';
end $$;

create function access.confirm_work(engagement uuid, yes boolean) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  e public.engagements;
  title text;
begin
  select * into e from public.engagements g where g.id = engagement for update;
  if not found or not (select access.is_member()) or e.worker_member_id <> auth.uid() then return 'not_found'; end if;
  if e.confirmed_at is not null or e.denied_at is not null then return 'already_answered'; end if;
  if not coalesce(yes, false) then
    update public.engagements set denied_at = now() where id = engagement;
    return 'ok';
  end if;
  update public.engagements set confirmed_at = now(), rating_closes_at = now() + interval '14 days'
  where id = engagement;
  select o.title into title from public.opportunities o where o.id = e.opportunity_id;
  perform private.notify(e.poster_member_id, 'O12', jsonb_build_object('title', coalesce(title, ''), 'days', 14,
    'name', coalesce((select p.full_name from public.profiles p where p.member_id = e.worker_member_id), '')));
  perform private.notify(e.worker_member_id, 'O12', jsonb_build_object('title', coalesce(title, ''), 'days', 14,
    'name', coalesce((select p.full_name from public.profiles p where p.member_id = e.poster_member_id), '')));
  return 'ok';
end $$;

create function access.rate_work(engagement uuid, on_time int, quality int, communication int, honesty int,
                                  again boolean, comment text, note text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  e public.engagements;
  me uuid := auth.uid();
  other uuid;
  rating uuid;
  clean_comment text := btrim(coalesce(comment, ''));
  clean_note text := btrim(coalesce(note, ''));
begin
  select * into e from public.engagements g where g.id = engagement for update;
  if not found or not (select access.is_member()) or me not in (e.poster_member_id, e.worker_member_id) then
    return 'not_found';
  end if;
  if e.confirmed_at is null then return 'not_confirmed'; end if;
  if e.rating_closes_at <= now() then return 'closed'; end if;
  if exists (select 1 from public.ratings r where r.engagement_id = engagement and r.rater_id = me) then
    return 'already_rated';
  end if;
  if private.holds_contact_details(jsonb_build_object('comment', clean_comment, 'note', clean_note)) then
    return 'contact_details';
  end if;
  other := case when me = e.poster_member_id then e.worker_member_id else e.poster_member_id end;
  insert into public.ratings (engagement_id, rater_id, ratee_id, on_time, quality, communication, honesty, again,
                              comment)
  values (engagement, me, other, on_time, quality, communication, honesty, again, left(clean_comment, 500))
  returning id into rating;
  if clean_note <> '' then
    insert into public.rating_notes (rating_id, note) values (rating, left(clean_note, 500));
  end if;
  if (select count(*) from public.ratings r where r.engagement_id = engagement) = 2 then
    update public.ratings set revealed_at = now() where engagement_id = engagement;
    perform private.notify(r.ratee_id, 'O14', jsonb_build_object('title', coalesce(o.title, '')))
    from public.ratings r left join public.opportunities o on o.id = e.opportunity_id
    where r.engagement_id = engagement;
  end if;
  return 'ok';
exception when check_violation then
  return 'invalid';
end $$;

create function access.reply_to_rating(rating uuid, reply text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  r public.ratings;
  clean text := btrim(coalesce(reply, ''));
begin
  select * into r from public.ratings x where x.id = rating for update;
  if not found or not (select access.is_member()) or r.ratee_id <> auth.uid() or r.revealed_at is null then
    return 'not_found';
  end if;
  if r.reply is not null then return 'already_replied'; end if;
  if clean = '' or char_length(clean) > 300 then return 'invalid'; end if;
  if private.holds_contact_details(jsonb_build_object('reply', clean)) then return 'contact_details'; end if;
  update public.ratings set reply = clean where id = rating;
  return 'ok';
end $$;

create function access.work_references(member uuid)
returns table (rating_id uuid, rater_name text, work_title text, rated_at timestamptz, comment text, reply text,
               total int, again_count int, on_time numeric, quality numeric, communication numeric, honesty numeric)
language sql stable security definer set search_path = '' as $$
  with shown as (
    select r.* from public.ratings r
    where r.ratee_id = work_references.member and r.revealed_at is not null
  ), summary as (
    select count(*)::int as total, count(*) filter (where again)::int as again_count,
           round(avg(on_time), 1) as on_time, round(avg(quality), 1) as quality,
           round(avg(communication), 1) as communication, round(avg(honesty), 1) as honesty
    from shown
  )
  select s.id, coalesce(p.full_name, m.username::text), coalesce(o.title, i.title), s.created_at, s.comment, s.reply,
         summary.total, summary.again_count, summary.on_time, summary.quality, summary.communication, summary.honesty
  from shown s
  cross join summary
  join public.members m on m.id = s.rater_id
  left join public.profiles p on p.member_id = s.rater_id
  join public.engagements e on e.id = s.engagement_id
  left join public.opportunities o on o.id = e.opportunity_id
  left join public.milestone_plans mp on mp.id = e.plan_id
  left join public.ideas i on i.id = mp.idea_id
  where (select access.is_member()) and summary.total >= 3
  order by s.created_at desc;
$$;

create function access.my_engagements()
returns table (engagement_id uuid, role text, other_name text, work_title text, marked_at timestamptz,
               confirmed_at timestamptz, denied_at timestamptz, rating_closes_at timestamptz, i_rated boolean)
language sql stable security definer set search_path = '' as $$
  select e.id, case when e.poster_member_id = auth.uid() then 'poster' else 'worker' end,
         coalesce(p.full_name, m.username::text), coalesce(o.title, i.title), e.marked_at, e.confirmed_at,
         e.denied_at,
         e.rating_closes_at,
         exists (select 1 from public.ratings r where r.engagement_id = e.id and r.rater_id = auth.uid())
  from public.engagements e
  join public.members m
    on m.id = case when e.poster_member_id = auth.uid() then e.worker_member_id else e.poster_member_id end
  left join public.profiles p on p.member_id = m.id
  left join public.opportunities o on o.id = e.opportunity_id
  left join public.milestone_plans mp on mp.id = e.plan_id
  left join public.ideas i on i.id = mp.idea_id
  where (select access.is_member()) and auth.uid() in (e.poster_member_id, e.worker_member_id)
  order by e.marked_at desc;
$$;

create function private.plan_finished_engagement() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  title text;
begin
  insert into public.engagements (plan_id, poster_member_id, worker_member_id, confirmed_at, rating_closes_at)
  values (new.id, new.started_by, case when new.started_by = new.member_a then new.member_b else new.member_a end,
          now(), now() + interval '14 days')
  on conflict (plan_id) do nothing;
  select coalesce(i.title, o.title, '') into title
  from (select 1) x
  left join public.ideas i on i.id = new.idea_id
  left join public.opportunities o on o.id = new.opportunity_id;
  perform private.notify(side.who, 'O12', jsonb_build_object('title', title, 'days', 14,
    'name', coalesce((select p.full_name from public.profiles p where p.member_id = side.other), '')))
  from (values (new.member_a, new.member_b), (new.member_b, new.member_a)) side(who, other);
  return new;
end $$;
create trigger finished_plan_engagement after update of status on public.milestone_plans
  for each row when (new.status = 'completed' and old.status is distinct from 'completed')
  execute function private.plan_finished_engagement();

create function private.reveal_due_ratings(run_at timestamptz default now()) returns int
language plpgsql security definer set search_path = '' as $$
declare
  revealed int;
  due record;
begin
  with done as (
    update public.ratings r set revealed_at = run_at
    from public.engagements e
    where e.id = r.engagement_id and r.revealed_at is null and e.rating_closes_at <= run_at
    returning r.ratee_id, e.opportunity_id
  ), told as (
    select private.notify(done.ratee_id, 'O14', jsonb_build_object('title', coalesce(o.title, '')))
    from done left join public.opportunities o on o.id = done.opportunity_id
  )
  select count(*) into revealed from told;

  for due in
    select e.id, side.who, o.title,
           coalesce(p.full_name, m.username::text) as other_name
    from public.engagements e
    cross join lateral (values (e.poster_member_id, e.worker_member_id), (e.worker_member_id, e.poster_member_id))
      side(who, other)
    join public.members m on m.id = side.other
    left join public.profiles p on p.member_id = side.other
    left join public.opportunities o on o.id = e.opportunity_id
    where e.confirmed_at is not null
      and e.rating_closes_at > run_at and e.rating_closes_at <= run_at + interval '3 days'
      and not exists (select 1 from public.ratings r where r.engagement_id = e.id and r.rater_id = side.who)
      and not exists (select 1 from public.notifications n
                      where n.member_id = side.who and n.kind = 'O13' and n.payload ->> 'engagement_id' = e.id::text)
  loop
    perform private.notify(due.who, 'O13', jsonb_build_object('title', coalesce(due.title, ''), 'days', 3,
      'name', due.other_name, 'engagement_id', due.id::text));
  end loop;
  return revealed;
end $$;
revoke all on function private.reveal_due_ratings(timestamptz) from public, anon, authenticated;
select cron.schedule('reveal-due-ratings', '15 6 * * *', $job$ select private.reveal_due_ratings() $job$);

revoke all on function access.mark_hired(uuid), access.confirm_work(uuid, boolean),
  access.rate_work(uuid, int, int, int, int, boolean, text, text), access.reply_to_rating(uuid, text),
  access.work_references(uuid), access.my_engagements() from public, anon;
grant execute on function access.mark_hired(uuid), access.confirm_work(uuid, boolean),
  access.rate_work(uuid, int, int, int, int, boolean, text, text), access.reply_to_rating(uuid, text),
  access.work_references(uuid), access.my_engagements() to authenticated;

create function public.mark_hired(response uuid) returns text
language sql volatile security invoker set search_path = '' as $$ select access.mark_hired(response); $$;
create function public.confirm_work(engagement uuid, yes boolean) returns text
language sql volatile security invoker set search_path = '' as $$ select access.confirm_work(engagement, yes); $$;
create function public.rate_work(engagement uuid, on_time int, quality int, communication int, honesty int,
                                 again boolean, comment text, note text) returns text
language sql volatile security invoker set search_path = '' as $$
  select access.rate_work(engagement, on_time, quality, communication, honesty, again, comment, note);
$$;
create function public.reply_to_rating(rating uuid, reply text) returns text
language sql volatile security invoker set search_path = '' as $$ select access.reply_to_rating(rating, reply); $$;
create function public.work_references(member uuid)
returns table (rating_id uuid, rater_name text, work_title text, rated_at timestamptz, comment text, reply text,
               total int, again_count int, on_time numeric, quality numeric, communication numeric, honesty numeric)
language sql stable security invoker set search_path = '' as $$ select * from access.work_references(member); $$;
create function public.my_engagements()
returns table (engagement_id uuid, role text, other_name text, work_title text, marked_at timestamptz,
               confirmed_at timestamptz, denied_at timestamptz, rating_closes_at timestamptz, i_rated boolean)
language sql stable security invoker set search_path = '' as $$ select * from access.my_engagements(); $$;
revoke all on function public.mark_hired(uuid), public.confirm_work(uuid, boolean),
  public.rate_work(uuid, int, int, int, int, boolean, text, text), public.reply_to_rating(uuid, text),
  public.work_references(uuid), public.my_engagements() from public, anon;
grant execute on function public.mark_hired(uuid), public.confirm_work(uuid, boolean),
  public.rate_work(uuid, int, int, int, int, boolean, text, text), public.reply_to_rating(uuid, text),
  public.work_references(uuid), public.my_engagements() to authenticated;
