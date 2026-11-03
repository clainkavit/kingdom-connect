create sequence public.report_reference_seq;

create function private.next_report_reference() returns text
language sql volatile set search_path = '' as $$
  select 'KC-' || extract(year from now() at time zone 'Africa/Dar_es_Salaam')::int || '-'
         || lpad(n::text, greatest(6, length(n::text)), '0')
  from (select nextval('public.report_reference_seq') as n) s;
$$;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reference_no text not null unique default private.next_report_reference(),
  reporter_id uuid not null references public.members (id),
  target_type text not null check (target_type in ('profile', 'opportunity', 'idea', 'thread', 'plan')),
  target_id uuid not null,
  reason text not null
    check (reason in ('asked_for_money', 'fake_job_or_business', 'harassment', 'impersonation', 'spam', 'other')),
  note text check (char_length(note) <= 1000),
  screenshot_path text unique,
  status text not null default 'open' check (status in ('open', 'under_review', 'action_taken', 'no_action')),
  decided_by uuid references public.staff (id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (screenshot_path is null or screenshot_path like reporter_id::text || '/%')
);
create index reports_reporter on public.reports (reporter_id, target_type, target_id);
create index reports_status on public.reports (status, created_at);
create trigger set_updated_at before update on public.reports
  for each row execute function private.set_updated_at();

alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;
revoke all on sequence public.report_reference_seq from anon, authenticated;
revoke all on function private.next_report_reference() from public, anon, authenticated;
create policy "base rule" on public.reports as restrictive for all to authenticated
  using ((select access.is_member()) or (select access.is_staff()))
  with check ((select access.is_member()) or (select access.is_staff()));
grant select on public.reports to authenticated;
create policy "staff read" on public.reports for select to authenticated
  using ((select access.is_staff()));

create function access.report(target_type text, target_id uuid, reason text, note text, screenshot_path text)
returns table (reference_no text, already_reported boolean)
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  existing text;
  created text;
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
  elsif report.target_type = 'thread' then
    if not exists (select 1 from public.message_threads t
                   where t.id = report.target_id and me in (t.member_a, t.member_b)) then
      raise exception 'not_available';
    end if;
  else
    raise exception 'not_available';
  end if;
  insert into public.reports (reporter_id, target_type, target_id, reason, note, screenshot_path)
  values (me, report.target_type, report.target_id, report.reason, nullif(btrim(report.note), ''),
          report.screenshot_path)
  returning reports.reference_no into created;
  if report.target_type = 'thread' then
    update public.message_threads set status = 'reported', reported_at = now()
    where id = report.target_id and status <> 'reported';
  end if;
  return query select created, false;
end;
$$;

create function access.my_reports() returns table (reference_no text, outcome text, reported_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.reference_no,
         case r.status when 'action_taken' then 'action_taken' when 'no_action' then 'no_action' else 'open' end,
         r.created_at
  from public.reports r
  where r.reporter_id = auth.uid() and (select access.is_member())
  order by r.created_at desc;
$$;

create function access.report_file_removable(path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select access.is_member()) and split_part(path, '/', 1) = auth.uid()::text
     and not exists (select 1 from public.reports r where r.screenshot_path = path);
$$;

create function access.report_file_writable(path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select access.is_member()) and split_part(path, '/', 1) = auth.uid()::text
     and split_part(path, '/', 2) <> '' and split_part(path, '/', 3) = '';
$$;

revoke all on function access.report(text, uuid, text, text, text), access.my_reports(),
  access.report_file_writable(text), access.report_file_removable(text) from public, anon;
grant execute on function access.report(text, uuid, text, text, text), access.my_reports(),
  access.report_file_writable(text), access.report_file_removable(text) to authenticated;

create function public.report(target_type text, target_id uuid, reason text, note text default null,
                              screenshot_path text default null)
returns table (reference_no text, already_reported boolean)
language sql volatile security invoker set search_path = '' as $$
  select * from access.report(target_type, target_id, reason, note, screenshot_path);
$$;
create function public.my_reports() returns table (reference_no text, outcome text, reported_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select * from access.my_reports();
$$;
revoke all on function public.report(text, uuid, text, text, text), public.my_reports() from public, anon;
grant execute on function public.report(text, uuid, text, text, text), public.my_reports() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-files', 'report-files', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "report files: a member uploads into their own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'report-files' and access.report_file_writable(name));
create policy "report files: staff only" on storage.objects for select to authenticated
  using (bucket_id = 'report-files' and (select access.is_staff()));
create policy "report files: a member removes an unsent screenshot" on storage.objects for delete to authenticated
  using (bucket_id = 'report-files' and access.report_file_removable(name));
