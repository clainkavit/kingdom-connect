-- P01: milestone plans. Two members connected through an idea (the owner and a requester past the NDA) agree
-- the stages of their partnership. Either proposes 1 to 10 milestones, stage 1 always "Agreed in principle";
-- each side accepts the hand-off disclaimer (legal text 'handoff', version and time stored). A proposal waits
-- 14 days with a day-7 reminder, then lapses; either member can start it again. Plans from opportunities
-- arrive with O03 (the opportunity_id column is ready). Nothing is ever deleted.

create table public.milestone_plans (
  id uuid primary key default gen_random_uuid(),
  member_a uuid not null references public.members (id),
  member_b uuid not null references public.members (id),
  idea_id uuid references public.ideas (id),
  opportunity_id uuid,
  started_by uuid not null references public.members (id),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'completed', 'lapsed', 'withdrawn', 'ended')),
  a_acceptance_id uuid references public.legal_acceptances (id),
  b_acceptance_id uuid references public.legal_acceptances (id),
  stage1_agreed_at timestamptz,
  expires_at timestamptz not null default now() + interval '14 days',
  reminded_at timestamptz,
  withdrawn_by uuid references public.members (id),
  withdrawn_at timestamptz,
  ended_by uuid references public.members (id),
  ended_reason text check (ended_reason is null or char_length(ended_reason) between 3 and 600),
  ended_at timestamptz,
  completed_at timestamptz,
  restarted_from uuid references public.milestone_plans (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (member_a < member_b),
  check (started_by in (member_a, member_b)),
  check ((idea_id is null) <> (opportunity_id is null))
);
create index milestone_plans_member_a on public.milestone_plans (member_a);
create index milestone_plans_member_b on public.milestone_plans (member_b);
-- One live plan per pair and item at a time.
create unique index milestone_plans_one_live on public.milestone_plans
  (member_a, member_b, coalesce(idea_id, opportunity_id)) where status in ('pending', 'active');

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.milestone_plans (id),
  position int not null check (position between 1 and 10),
  title text not null check (char_length(title) between 2 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  target_date date,
  responsible_member_id uuid not null references public.members (id),
  status text not null default 'open' check (status in ('open', 'done', 'confirmed')),
  done_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, position)
);

do $$
declare t text;
begin
  foreach t in array array['milestone_plans', 'milestones'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', t);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function private.log_change()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format($p$create policy "base rule" on public.%I as restrictive for all to authenticated
      using ((select access.is_member()) or (select access.is_staff()))
      with check ((select access.is_member()) or (select access.is_staff()))$p$, t);
  end loop;
end $$;

-- A plan record is never deleted, and a confirmed milestone is never changed or removed.
create function private.plans_are_kept() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'a % row is never deleted', tg_table_name;
  end if;
  if tg_table_name = 'milestones' and old.status = 'confirmed' then
    raise exception 'a confirmed milestone is never changed';
  end if;
  return new;
end $$;
create trigger plans_are_kept before update or delete on public.milestones
  for each row execute function private.plans_are_kept();
create trigger plans_are_kept before delete on public.milestone_plans
  for each row execute function private.plans_are_kept();

-- The two members read their plans; staff read them too (names, item, statuses, dates and notes, nothing else
-- exists on these tables). Writes go through the functions below.
create function access.in_plan(plan uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select access.is_member())
     and exists (select 1 from public.milestone_plans p where p.id = plan and auth.uid() in (p.member_a, p.member_b));
$$;
grant select on public.milestone_plans, public.milestones to authenticated;
create policy "the two members and staff" on public.milestone_plans for select to authenticated
  using (((select access.is_member()) and (select auth.uid()) in (member_a, member_b)) or (select access.is_staff()));
create policy "the two members and staff" on public.milestones for select to authenticated
  using (access.in_plan(plan_id) or (select access.is_staff()));

-- Whether two members may share a plan about an idea: owner and requester past the NDA, not blocked.
create function access.can_plan_idea(a uuid, b uuid, idea uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select a <> b and access.idea_partners(a, b, idea) and not access.is_blocked(a, b)
     and exists (select 1 from public.members m where m.id = a and m.status = 'approved')
     and exists (select 1 from public.members m where m.id = b and m.status = 'approved');
$$;

-- The idea's title, for messages and screens.
create function private.plan_item(plan public.milestone_plans) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select i.title from public.ideas i where i.id = plan.idea_id), '');
$$;

-- Accepts the current hand-off disclaimer for a plan and returns the acceptance, or null when the text shown
-- is no longer the current one.
create function private.accept_handoff(member uuid, plan uuid, text_id uuid) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  saved uuid;
begin
  if text_id is null or text_id is distinct from access.current_legal_text_id('handoff') then
    return null;
  end if;
  insert into public.legal_acceptances (member_id, legal_text_id, context_type, context_id)
  values (member, text_id, 'plan', plan) returning id into saved;
  return saved;
end;
$$;

-- S31 and S32: the current hand-off disclaimer.
create function access.handoff_text()
returns table (id uuid, kind text, version text, body_en text, body_sw text, approved_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select t.id, t.kind, t.version, t.body_en, t.body_sw, t.approved_at
  from public.legal_texts t
  where t.id = access.current_legal_text_id('handoff') and (select access.is_member());
$$;

-- S31: propose a plan about an idea to the other member. `steps` is a JSON array of the stages after stage 1,
-- each {title, description, target_date (YYYY-MM-DD), responsible ('me' or 'other')}.
create function access.propose_plan(idea uuid, other uuid, steps jsonb, handoff uuid, restart uuid default null)
returns table (result text, plan_id uuid)
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  saved uuid;
  acceptance uuid;
  step jsonb;
  n int := 1;
  step_title text;
  step_description text;
  step_date date;
begin
  if not (select access.is_member()) or idea is null or other is null or not access.can_plan_idea(me, other, idea) then
    return query select 'not_allowed'::text, null::uuid; return;
  end if;
  if steps is null or jsonb_typeof(steps) <> 'array' or jsonb_array_length(steps) > 9 then
    return query select 'invalid_steps'::text, null::uuid; return;
  end if;
  if exists (select 1 from public.milestone_plans p
             where p.member_a = least(me, other) and p.member_b = greatest(me, other) and p.idea_id = idea
               and p.status in ('pending', 'active')) then
    return query select 'already_planned'::text, null::uuid; return;
  end if;
  for step in select * from jsonb_array_elements(steps) loop
    step_title := btrim(coalesce(step ->> 'title', ''));
    step_description := btrim(coalesce(step ->> 'description', ''));
    if char_length(step_title) not between 2 and 120 or char_length(step_description) > 1000 then
      return query select 'invalid_step'::text, null::uuid; return;
    end if;
    if coalesce(step ->> 'responsible', '') not in ('me', 'other') then
      return query select 'invalid_step'::text, null::uuid; return;
    end if;
    begin
      step_date := nullif(step ->> 'target_date', '')::date;
    exception when others then
      return query select 'invalid_date'::text, null::uuid; return;
    end;
    if step_date is null or step_date < private.tanzania_today() then
      return query select 'invalid_date'::text, null::uuid; return;
    end if;
    if private.holds_contact_details(jsonb_build_object('title', step_title, 'description', step_description)) then
      return query select 'contact_details'::text, null::uuid; return;
    end if;
  end loop;

  insert into public.milestone_plans (member_a, member_b, idea_id, started_by, restarted_from)
  values (least(me, other), greatest(me, other), idea, me, restart) returning id into saved;
  acceptance := private.accept_handoff(me, saved, handoff);
  if acceptance is null then
    raise exception 'handoff_changed' using errcode = 'P0001';
  end if;
  update public.milestone_plans
  set a_acceptance_id = case when member_a = me then acceptance end,
      b_acceptance_id = case when member_b = me then acceptance end
  where id = saved;

  insert into public.milestones (plan_id, position, title, target_date, responsible_member_id)
  values (saved, 1, 'Agreed in principle', private.tanzania_today(), me);
  for step in select * from jsonb_array_elements(steps) loop
    n := n + 1;
    insert into public.milestones (plan_id, position, title, description, target_date, responsible_member_id)
    values (saved, n, btrim(step ->> 'title'), btrim(coalesce(step ->> 'description', '')),
            (step ->> 'target_date')::date, case when step ->> 'responsible' = 'me' then me else other end);
  end loop;

  perform private.notify(other, 'P1', jsonb_build_object('name', private.viewer_name(me),
    'item', (select i.title from public.ideas i where i.id = idea), 'plan_id', saved::text));
  return query select 'ok'::text, saved;
exception when raise_exception then
  if sqlerrm = 'handoff_changed' then
    return query select 'handoff_changed'::text, null::uuid; return;
  end if;
  raise;
end;
$$;

-- S32: start a lapsed or withdrawn plan again with the same stages, from either member.
create function access.restart_plan(plan uuid, handoff uuid) returns table (result text, plan_id uuid)
language plpgsql volatile security definer set search_path = '' as $$
declare
  old_plan public.milestone_plans;
  me uuid := auth.uid();
  other uuid;
begin
  select * into old_plan from public.milestone_plans p where p.id = plan;
  if not found or not access.in_plan(plan) or old_plan.status not in ('lapsed', 'withdrawn') then
    return query select 'not_allowed'::text, null::uuid; return;
  end if;
  other := case when old_plan.member_a = me then old_plan.member_b else old_plan.member_a end;
  return query select * from access.propose_plan(old_plan.idea_id, other,
    (select coalesce(jsonb_agg(jsonb_build_object(
       'title', m.title, 'description', m.description,
       'target_date', greatest(m.target_date, private.tanzania_today())::text,
       'responsible', case when m.responsible_member_id = me then 'me' else 'other' end) order by m.position),
       '[]'::jsonb)
     from public.milestones m where m.plan_id = plan and m.position > 1),
    handoff, plan);
end;
$$;

-- S32: the other member accepts. Stage 1 is then agreed and the one-hour withdrawal window starts. P3.
create function access.accept_plan(plan uuid, handoff uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  found_plan public.milestone_plans;
  me uuid := auth.uid();
  acceptance uuid;
begin
  select * into found_plan from public.milestone_plans p where p.id = plan for update;
  if not found or not access.in_plan(plan) then
    return 'not_found';
  end if;
  if found_plan.started_by = me then
    return 'own_plan';
  end if;
  if found_plan.status <> 'pending' or found_plan.expires_at <= now() then
    return 'not_pending';
  end if;
  if access.is_blocked(found_plan.member_a, found_plan.member_b) then
    return 'not_found';
  end if;
  acceptance := private.accept_handoff(me, plan, handoff);
  if acceptance is null then
    return 'handoff_changed';
  end if;
  update public.milestone_plans
  set status = 'active', stage1_agreed_at = now(),
      a_acceptance_id = case when member_a = me then acceptance else a_acceptance_id end,
      b_acceptance_id = case when member_b = me then acceptance else b_acceptance_id end
  where id = plan;
  update public.milestones set status = 'confirmed', done_at = now(), confirmed_at = now()
  where plan_id = plan and position = 1;
  perform private.notify(found_plan.started_by, 'P3', jsonb_build_object('name', private.viewer_name(me),
    'item', private.plan_item(found_plan), 'plan_id', plan::text));
  return 'ok';
end;
$$;

-- While pending, the member who proposed may withdraw. P9 to both. (The first-hour withdrawal is P02.)
create function access.withdraw_plan(plan uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  found_plan public.milestone_plans;
  me uuid := auth.uid();
begin
  select * into found_plan from public.milestone_plans p where p.id = plan for update;
  if not found or not access.in_plan(plan) then
    return 'not_found';
  end if;
  if found_plan.status <> 'pending' or found_plan.started_by <> me then
    return 'not_allowed';
  end if;
  update public.milestone_plans set status = 'withdrawn', withdrawn_by = me, withdrawn_at = now() where id = plan;
  perform private.notify(m, 'P9', jsonb_build_object('name', private.viewer_name(me),
    'item', private.plan_item(found_plan), 'plan_id', plan::text))
  from unnest(array[found_plan.member_a, found_plan.member_b]) m;
  return 'ok';
end;
$$;

-- S30: the caller's plans, newest first, with the other member and the item.
create function access.my_plans()
returns table (plan_id uuid, status text, other_id uuid, other_name text, item_title text, idea_id uuid,
               started_by_me boolean, milestones int, confirmed int, expires_at timestamptz,
               stage1_agreed_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.status, o.other, private.viewer_name(o.other), private.plan_item(p), p.idea_id,
         p.started_by = auth.uid(),
         (select count(*)::int from public.milestones m where m.plan_id = p.id),
         (select count(*)::int from public.milestones m where m.plan_id = p.id and m.status = 'confirmed'),
         p.expires_at, p.stage1_agreed_at, p.created_at
  from public.milestone_plans p
  cross join lateral (select case when p.member_a = auth.uid() then p.member_b else p.member_a end as other) o
  where (select access.is_member()) and auth.uid() in (p.member_a, p.member_b)
  order by p.created_at desc;
$$;

-- S31: the idea partners the caller could plan with (owner ↔ requesters past the NDA).
create function access.plan_partners()
returns table (idea_id uuid, idea_title text, other_id uuid, other_name text)
language sql stable security definer set search_path = '' as $$
  select i.id, i.title, o.other, private.viewer_name(o.other)
  from public.idea_access_requests r
  join public.ideas i on i.id = r.idea_id
  cross join lateral (select case when i.owner_id = auth.uid() then r.requester_id else i.owner_id end as other) o
  where (select access.is_member()) and r.status = 'nda_accepted'
    and auth.uid() in (i.owner_id, r.requester_id)
    and access.can_plan_idea(auth.uid(), o.other, i.id)
  order by i.title, 4;
$$;

-- The day-7 reminder (P2) and the 14-day lapse (P8), every 15 minutes.
create function private.run_plan_deadlines() returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  due public.milestone_plans;
begin
  for due in select * from public.milestone_plans p
             where p.status = 'pending' and p.reminded_at is null and p.expires_at - interval '7 days' <= now()
               and p.expires_at > now()
             for update skip locked loop
    update public.milestone_plans set reminded_at = now() where id = due.id;
    perform private.notify(case when due.started_by = due.member_a then due.member_b else due.member_a end, 'P2',
      jsonb_build_object('name', private.viewer_name(due.started_by), 'item', private.plan_item(due),
                         'plan_id', due.id::text));
  end loop;
  for due in select * from public.milestone_plans p where p.status = 'pending' and p.expires_at <= now()
             for update skip locked loop
    update public.milestone_plans set status = 'lapsed' where id = due.id;
    perform private.notify(due.started_by, 'P8', jsonb_build_object(
      'name', private.viewer_name(case when due.started_by = due.member_a then due.member_b else due.member_a end),
      'item', private.plan_item(due), 'plan_id', due.id::text));
  end loop;
end;
$$;
revoke all on function private.run_plan_deadlines(), private.accept_handoff(uuid, uuid, uuid),
  private.plan_item(public.milestone_plans), private.plans_are_kept() from public, anon, authenticated;
select cron.schedule('milestone-plan-deadlines', '*/15 * * * *', $job$ select private.run_plan_deadlines() $job$);

revoke all on function access.in_plan(uuid), access.can_plan_idea(uuid, uuid, uuid), access.handoff_text(),
  access.propose_plan(uuid, uuid, jsonb, uuid, uuid), access.restart_plan(uuid, uuid), access.accept_plan(uuid, uuid),
  access.withdraw_plan(uuid), access.my_plans(), access.plan_partners() from public, anon;
grant execute on function access.in_plan(uuid), access.can_plan_idea(uuid, uuid, uuid), access.handoff_text(),
  access.propose_plan(uuid, uuid, jsonb, uuid, uuid), access.restart_plan(uuid, uuid), access.accept_plan(uuid, uuid),
  access.withdraw_plan(uuid), access.my_plans(), access.plan_partners() to authenticated;

create function public.handoff_text()
returns table (id uuid, kind text, version text, body_en text, body_sw text, approved_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from access.handoff_text(); $$;
create function public.propose_plan(idea uuid, other uuid, steps jsonb, handoff uuid)
returns table (result text, plan_id uuid)
language sql volatile security invoker set search_path = '' as $$
  select * from access.propose_plan(idea, other, steps, handoff, null);
$$;
create function public.restart_plan(plan uuid, handoff uuid) returns table (result text, plan_id uuid)
language sql volatile security invoker set search_path = '' as $$ select * from access.restart_plan(plan, handoff); $$;
create function public.accept_plan(plan uuid, handoff uuid) returns text
language sql volatile security invoker set search_path = '' as $$ select access.accept_plan(plan, handoff); $$;
create function public.withdraw_plan(plan uuid) returns text
language sql volatile security invoker set search_path = '' as $$ select access.withdraw_plan(plan); $$;
create function public.my_plans()
returns table (plan_id uuid, status text, other_id uuid, other_name text, item_title text, idea_id uuid,
               started_by_me boolean, milestones int, confirmed int, expires_at timestamptz,
               stage1_agreed_at timestamptz, created_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from access.my_plans(); $$;
create function public.plan_partners()
returns table (idea_id uuid, idea_title text, other_id uuid, other_name text)
language sql stable security invoker set search_path = '' as $$ select * from access.plan_partners(); $$;

revoke all on function public.handoff_text(), public.propose_plan(uuid, uuid, jsonb, uuid),
  public.restart_plan(uuid, uuid), public.accept_plan(uuid, uuid), public.withdraw_plan(uuid), public.my_plans(),
  public.plan_partners() from public, anon;
grant execute on function public.handoff_text(), public.propose_plan(uuid, uuid, jsonb, uuid),
  public.restart_plan(uuid, uuid), public.accept_plan(uuid, uuid), public.withdraw_plan(uuid), public.my_plans(),
  public.plan_partners() to authenticated;
