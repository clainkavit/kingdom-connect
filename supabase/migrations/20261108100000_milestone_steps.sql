-- P02: tracking a plan. The member responsible marks a stage done and the other confirms it (P4, P5); a
-- confirmed stage is never changed. Once both have accepted stage 1, either may withdraw for one hour (P9);
-- after that hour the plan can only be ended, with a reason, and stays on record as Ended (P10). Nothing is
-- ever deleted.

-- The responsible member marks an open stage done.
create function access.mark_milestone_done(milestone uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  found_milestone public.milestones;
  found_plan public.milestone_plans;
  me uuid := auth.uid();
begin
  select * into found_milestone from public.milestones m where m.id = milestone for update;
  if not found or not access.in_plan(found_milestone.plan_id) then
    return 'not_found';
  end if;
  select * into found_plan from public.milestone_plans p where p.id = found_milestone.plan_id;
  if found_plan.status <> 'active' then
    return 'not_active';
  end if;
  if found_milestone.responsible_member_id <> me then
    return 'not_responsible';
  end if;
  if found_milestone.status <> 'open' then
    return 'not_open';
  end if;
  update public.milestones set status = 'done', done_at = now() where id = milestone;
  perform private.notify(case when found_plan.member_a = me then found_plan.member_b else found_plan.member_a end,
    'P4', jsonb_build_object('name', private.viewer_name(me), 'milestone', found_milestone.title,
                             'plan_id', found_plan.id::text));
  return 'ok';
end;
$$;

-- The other member confirms a stage marked done. It can never change after this.
create function access.confirm_milestone(milestone uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  found_milestone public.milestones;
  found_plan public.milestone_plans;
  me uuid := auth.uid();
begin
  select * into found_milestone from public.milestones m where m.id = milestone for update;
  if not found or not access.in_plan(found_milestone.plan_id) then
    return 'not_found';
  end if;
  select * into found_plan from public.milestone_plans p where p.id = found_milestone.plan_id;
  if found_plan.status <> 'active' then
    return 'not_active';
  end if;
  if found_milestone.responsible_member_id = me then
    return 'own_milestone';
  end if;
  if found_milestone.status <> 'done' then
    return 'not_done';
  end if;
  update public.milestones set status = 'confirmed', confirmed_at = now() where id = milestone;
  perform private.notify(found_milestone.responsible_member_id, 'P5',
    jsonb_build_object('name', private.viewer_name(me), 'milestone', found_milestone.title,
                       'plan_id', found_plan.id::text));
  return 'ok';
end;
$$;

-- Withdrawing: the proposer while pending, or either member within one hour of stage 1 being agreed. P9 to both.
create or replace function access.withdraw_plan(plan uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  found_plan public.milestone_plans;
  me uuid := auth.uid();
begin
  select * into found_plan from public.milestone_plans p where p.id = plan for update;
  if not found or not access.in_plan(plan) then
    return 'not_found';
  end if;
  if not ((found_plan.status = 'pending' and found_plan.started_by = me)
          or (found_plan.status = 'active' and found_plan.stage1_agreed_at > now() - interval '1 hour')) then
    return 'not_allowed';
  end if;
  update public.milestone_plans set status = 'withdrawn', withdrawn_by = me, withdrawn_at = now() where id = plan;
  perform private.notify(m, 'P9', jsonb_build_object('name', private.viewer_name(me),
    'item', private.plan_item(found_plan), 'plan_id', plan::text))
  from unnest(array[found_plan.member_a, found_plan.member_b]) m;
  return 'ok';
end;
$$;

-- Ending: after the first hour, either member, with a reason. The other is told; the record stays.
create function access.end_plan(plan uuid, reason text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  found_plan public.milestone_plans;
  me uuid := auth.uid();
  clean_reason text := btrim(coalesce(reason, ''));
begin
  select * into found_plan from public.milestone_plans p where p.id = plan for update;
  if not found or not access.in_plan(plan) then
    return 'not_found';
  end if;
  if found_plan.status <> 'active' then
    return 'not_active';
  end if;
  if found_plan.stage1_agreed_at > now() - interval '1 hour' then
    return 'withdraw_instead';
  end if;
  if char_length(clean_reason) not between 3 and 600 then
    return 'reason_required';
  end if;
  if private.holds_contact_details(jsonb_build_object('reason', clean_reason)) then
    return 'contact_details';
  end if;
  update public.milestone_plans set status = 'ended', ended_by = me, ended_at = now(), ended_reason = clean_reason
  where id = plan;
  perform private.notify(case when found_plan.member_a = me then found_plan.member_b else found_plan.member_a end,
    'P10', jsonb_build_object('name', private.viewer_name(me), 'item', private.plan_item(found_plan),
                              'reason', clean_reason, 'plan_id', plan::text));
  return 'ok';
end;
$$;

revoke all on function access.mark_milestone_done(uuid), access.confirm_milestone(uuid), access.end_plan(uuid, text)
  from public, anon;
grant execute on function access.mark_milestone_done(uuid), access.confirm_milestone(uuid), access.end_plan(uuid, text)
  to authenticated;

create function public.mark_milestone_done(milestone uuid) returns text
language sql volatile security invoker set search_path = '' as $$ select access.mark_milestone_done(milestone); $$;
create function public.confirm_milestone(milestone uuid) returns text
language sql volatile security invoker set search_path = '' as $$ select access.confirm_milestone(milestone); $$;
create function public.end_plan(plan uuid, reason text) returns text
language sql volatile security invoker set search_path = '' as $$ select access.end_plan(plan, reason); $$;
revoke all on function public.mark_milestone_done(uuid), public.confirm_milestone(uuid), public.end_plan(uuid, text)
  from public, anon;
grant execute on function public.mark_milestone_done(uuid), public.confirm_milestone(uuid), public.end_plan(uuid, text)
  to authenticated;
