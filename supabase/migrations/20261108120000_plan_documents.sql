-- P03: the signed agreement. Once every stage is confirmed, each member uploads the signed agreement (PDF, up
-- to 10 MB, once). The platform stores it and does nothing else with it. P6 tells the other member; when both
-- are in, the plan is Completed (P7). Staff can open a signed document only while a report on that plan is open,
-- so members can now report a plan too.

create table public.plan_documents (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.milestone_plans (id),
  uploaded_by uuid not null references public.members (id),
  storage_path text not null unique,
  size int not null check (size between 1 and 10485760),
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, uploaded_by)
);
create trigger set_updated_at before update on public.plan_documents
  for each row execute function private.set_updated_at();
create trigger audit after insert or update or delete on public.plan_documents
  for each row execute function private.log_change();
create trigger plans_are_kept before delete on public.plan_documents
  for each row execute function private.plans_are_kept();
alter table public.plan_documents enable row level security;
revoke all on public.plan_documents from anon, authenticated;
create policy "base rule" on public.plan_documents as restrictive for all to authenticated
  using ((select access.is_member()) or (select access.is_staff()))
  with check ((select access.is_member()) or (select access.is_staff()));

-- Whether staff may look at a plan's signed documents: only while a report on that plan is open.
create function access.plan_report_open(plan uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select access.is_staff())
     and exists (select 1 from public.reports r
                 where r.target_type = 'plan' and r.target_id = plan and r.status in ('open', 'under_review'));
$$;

grant select (id, plan_id, uploaded_by, storage_path, size, uploaded_at) on public.plan_documents to authenticated;
create policy "the two members, or staff while reported" on public.plan_documents for select to authenticated
  using (access.in_plan(plan_id) or access.plan_report_open(plan_id));

-- Whether the caller may upload now: an active plan, every stage confirmed, nothing uploaded by them yet.
create function access.can_upload_plan_document(plan uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select access.in_plan(plan)
     and exists (select 1 from public.milestone_plans p where p.id = plan and p.status = 'active')
     and not exists (select 1 from public.milestones m where m.plan_id = plan and m.status <> 'confirmed')
     and not exists (select 1 from public.plan_documents d where d.plan_id = plan and d.uploaded_by = auth.uid());
$$;

-- Files: PDFs up to 10 MB at <plan id>/<member id>.pdf. Nobody removes them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('plan-documents', 'plan-documents', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create function access.plan_document_path_ok(path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f-]{36}\.pdf$'
    then split_part(path, '/', 2) = auth.uid()::text || '.pdf'
         and access.can_upload_plan_document(split_part(path, '/', 1)::uuid)
    else false
  end;
$$;
create function access.plan_document_readable(path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.plan_documents d
                 where d.storage_path = path
                   and (access.in_plan(d.plan_id) or access.plan_report_open(d.plan_id)));
$$;

create policy "plan documents: a member uploads their own" on storage.objects for insert to authenticated
  with check (bucket_id = 'plan-documents' and access.plan_document_path_ok(name));
create policy "plan documents: the two members, or staff while reported" on storage.objects
  for select to authenticated
  using (bucket_id = 'plan-documents' and access.plan_document_readable(name));

-- S34: record an uploaded signed agreement. P6 to the other member; with both in, Completed and P7 to both.
create function access.record_plan_document(plan uuid, storage_path text, size int) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  found_plan public.milestone_plans;
  me uuid := auth.uid();
  other uuid;
begin
  select * into found_plan from public.milestone_plans p where p.id = plan for update;
  if not found or not access.in_plan(plan) then
    return 'not_found';
  end if;
  if not access.can_upload_plan_document(plan) then
    return 'not_allowed';
  end if;
  if storage_path is distinct from plan::text || '/' || me::text || '.pdf'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'plan-documents' and o.name = storage_path) then
    return 'invalid_file';
  end if;
  if size is null or size not between 1 and 10485760 then
    return 'too_large';
  end if;
  other := case when found_plan.member_a = me then found_plan.member_b else found_plan.member_a end;
  insert into public.plan_documents (plan_id, uploaded_by, storage_path, size) values (plan, me, storage_path, size);
  if exists (select 1 from public.plan_documents d where d.plan_id = plan and d.uploaded_by = other) then
    update public.milestone_plans set status = 'completed', completed_at = now() where id = plan;
    perform private.notify(m, 'P7', jsonb_build_object('item', private.plan_item(found_plan), 'plan_id', plan::text))
    from unnest(array[found_plan.member_a, found_plan.member_b]) m;
  else
    perform private.notify(other, 'P6', jsonb_build_object('name', private.viewer_name(me),
      'item', private.plan_item(found_plan), 'plan_id', plan::text));
  end if;
  return 'ok';
end;
$$;

revoke all on function access.plan_report_open(uuid), access.can_upload_plan_document(uuid),
  access.plan_document_path_ok(text), access.plan_document_readable(text), access.record_plan_document(uuid, text, int)
  from public, anon;
grant execute on function access.plan_report_open(uuid), access.can_upload_plan_document(uuid),
  access.plan_document_path_ok(text), access.plan_document_readable(text), access.record_plan_document(uuid, text, int)
  to authenticated;

create function public.can_upload_plan_document(plan uuid) returns boolean
language sql stable security invoker set search_path = '' as $$ select access.can_upload_plan_document(plan); $$;
create function public.record_plan_document(plan uuid, storage_path text, size int) returns text
language sql volatile security invoker set search_path = '' as $$
  select access.record_plan_document(plan, storage_path, size);
$$;
revoke all on function public.can_upload_plan_document(uuid), public.record_plan_document(uuid, text, int)
  from public, anon;
grant execute on function public.can_upload_plan_document(uuid), public.record_plan_document(uuid, text, int)
  to authenticated;

-- A member of a plan can report it (section 13), naming the other member as the subject.
create or replace function access.report(target_type text, target_id uuid, reason text, note text, screenshot_path text)
returns table (reference_no text, already_reported boolean)
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  existing text;
  created text;
  subject uuid;
begin
  if not (select access.is_member()) then
    raise exception 'not_allowed';
  end if;
  perform pg_advisory_xact_lock(hashtext('report:' || me::text));
  select r.reference_no into existing from public.reports r
  where r.reporter_id = me and r.target_type = report.target_type and r.target_id = report.target_id
    and r.status in ('open', 'under_review');
  if existing is not null then
    return query select existing, true;
    return;
  end if;
  if (select count(*) from public.reports r
      where r.reporter_id = me
        and r.created_at >= ((now() at time zone 'Africa/Dar_es_Salaam')::date::timestamp
                             at time zone 'Africa/Dar_es_Salaam')) >= 10 then
    raise exception 'daily_limit';
  end if;
  if report.target_type = 'profile' then
    if report.target_id = me
       or not exists (select 1 from public.members m where m.id = report.target_id and m.status = 'approved') then
      raise exception 'not_available';
    end if;
    subject := report.target_id;
  elsif report.target_type = 'thread' then
    select case when t.member_a = me then t.member_b else t.member_a end into subject
    from public.message_threads t
    where t.id = report.target_id and me in (t.member_a, t.member_b);
    if subject is null then
      raise exception 'not_available';
    end if;
  elsif report.target_type = 'plan' then
    select case when p.member_a = me then p.member_b else p.member_a end into subject
    from public.milestone_plans p
    where p.id = report.target_id and me in (p.member_a, p.member_b);
    if subject is null then
      raise exception 'not_available';
    end if;
  else
    raise exception 'not_available';
  end if;
  insert into public.reports (reporter_id, target_type, target_id, subject_id, reason, note, screenshot_path)
  values (me, report.target_type, report.target_id, subject, report.reason, nullif(btrim(report.note), ''),
          report.screenshot_path)
  returning reports.reference_no into created;
  if report.target_type = 'thread' then
    update public.message_threads set status = 'reported', reported_at = now()
    where id = report.target_id and status <> 'reported';
  end if;
  return query select created, false;
end;
$$;
