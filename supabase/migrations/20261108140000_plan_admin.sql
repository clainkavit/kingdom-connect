-- P04: the administrators' view of milestone plans (A14): names, the idea, stage statuses, dates and notes,
-- never contact details or the investor flag. Staff can annotate a plan; an annotation is never edited or
-- deleted, and nobody deletes a plan.

create table public.plan_annotations (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.milestone_plans (id),
  staff_id uuid not null references public.staff (id),
  note text not null check (char_length(note) between 2 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index plan_annotations_plan on public.plan_annotations (plan_id, created_at);
create trigger audit after insert or update or delete on public.plan_annotations
  for each row execute function private.log_change();

create function private.annotations_are_final() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'a plan annotation is never changed or deleted: % is not allowed', lower(tg_op);
end $$;
create trigger never_changed before update or delete on public.plan_annotations
  for each row execute function private.annotations_are_final();

alter table public.plan_annotations enable row level security;
revoke all on public.plan_annotations from anon, authenticated;
create policy "base rule" on public.plan_annotations as restrictive for all to authenticated
  using ((select access.is_staff())) with check ((select access.is_staff()));
grant select (id, plan_id, staff_id, note, created_at) on public.plan_annotations to authenticated;
create policy "staff" on public.plan_annotations for select to authenticated using ((select access.is_staff()));

-- A14: every plan, newest first, with the two names, the idea and progress. Staff only.
create function access.admin_plans()
returns table (plan_id uuid, status text, member_a_name text, member_b_name text, started_by_name text,
               item_title text, milestones int, confirmed int, created_at timestamptz,
               stage1_agreed_at timestamptz, closed_at timestamptz, annotations int)
language sql stable security definer set search_path = '' as $$
  select p.id, p.status, private.viewer_name(p.member_a), private.viewer_name(p.member_b),
         private.viewer_name(p.started_by), private.plan_item(p),
         (select count(*)::int from public.milestones m where m.plan_id = p.id),
         (select count(*)::int from public.milestones m where m.plan_id = p.id and m.status = 'confirmed'),
         p.created_at, p.stage1_agreed_at, coalesce(p.completed_at, p.ended_at, p.withdrawn_at),
         (select count(*)::int from public.plan_annotations a where a.plan_id = p.id)
  from public.milestone_plans p
  where (select access.is_staff())
  order by p.created_at desc;
$$;

-- A14: one plan's stages, who closed it and why, and the annotations so far. Staff only.
create function access.admin_plan_stages(plan uuid)
returns table (position int, title text, description text, target_date date, responsible_name text, status text,
               done_at timestamptz, confirmed_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.position, m.title, m.description, m.target_date, private.viewer_name(m.responsible_member_id), m.status,
         m.done_at, m.confirmed_at
  from public.milestones m
  where m.plan_id = plan and (select access.is_staff())
  order by m.position;
$$;

create function access.admin_plan_notes(plan uuid)
returns table (kind text, author text, note text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select 'ended', private.viewer_name(p.ended_by), p.ended_reason, p.ended_at
  from public.milestone_plans p
  where p.id = plan and p.ended_reason is not null and (select access.is_staff())
  union all
  select 'annotation', s.full_name, a.note, a.created_at
  from public.plan_annotations a join public.staff s on s.id = a.staff_id
  where a.plan_id = plan and (select access.is_staff())
  order by 4;
$$;

-- Staff add an annotation, which nobody can change afterwards.
create function access.annotate_plan(plan uuid, note text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  clean_note text := btrim(coalesce(note, ''));
begin
  if not (select access.is_staff()) then
    return 'not_staff';
  end if;
  if not exists (select 1 from public.milestone_plans p where p.id = plan) then
    return 'not_found';
  end if;
  if char_length(clean_note) not between 2 and 1000 then
    return 'invalid_note';
  end if;
  insert into public.plan_annotations (plan_id, staff_id, note) values (plan, auth.uid(), clean_note);
  return 'ok';
end;
$$;

revoke all on function access.admin_plans(), access.admin_plan_stages(uuid), access.admin_plan_notes(uuid),
  access.annotate_plan(uuid, text) from public, anon;
grant execute on function access.admin_plans(), access.admin_plan_stages(uuid), access.admin_plan_notes(uuid),
  access.annotate_plan(uuid, text) to authenticated;

create function public.admin_plans()
returns table (plan_id uuid, status text, member_a_name text, member_b_name text, started_by_name text,
               item_title text, milestones int, confirmed int, created_at timestamptz,
               stage1_agreed_at timestamptz, closed_at timestamptz, annotations int)
language sql stable security invoker set search_path = '' as $$ select * from access.admin_plans(); $$;
create function public.admin_plan_stages(plan uuid)
returns table (position int, title text, description text, target_date date, responsible_name text, status text,
               done_at timestamptz, confirmed_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from access.admin_plan_stages(plan); $$;
create function public.admin_plan_notes(plan uuid)
returns table (kind text, author text, note text, created_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from access.admin_plan_notes(plan); $$;
create function public.annotate_plan(plan uuid, note text) returns text
language sql volatile security invoker set search_path = '' as $$ select access.annotate_plan(plan, note); $$;
revoke all on function public.admin_plans(), public.admin_plan_stages(uuid), public.admin_plan_notes(uuid),
  public.annotate_plan(uuid, text) from public, anon;
grant execute on function public.admin_plans(), public.admin_plan_stages(uuid), public.admin_plan_notes(uuid),
  public.annotate_plan(uuid, text) to authenticated;
