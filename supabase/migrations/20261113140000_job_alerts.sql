-- O13: job alerts. A member saves the Opportunities filters they are using (type, region, sector, employment
-- type, remote only), up to 5 sets. Once a day the alerts job finds posts published since its last run that
-- match any of a member's alerts and that the member can see in the list, never their own, and sends one notice
-- S2 with the count. private.notify queues its email; the sender skips it when the member switched off email
-- for matches (S46).

create table public.job_alerts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null default auth.uid() references public.members (id) on delete cascade,
  kind text check (kind in ('job', 'partnership', 'collaboration', 'investment', 'tender')),
  region uuid references public.regions (id) on delete cascade,
  sector uuid references public.sectors (id) on delete cascade,
  employment text check (employment in ('full_time', 'part_time', 'contract', 'internship')),
  remote_only boolean not null default false,
  created_at timestamptz not null default now(),
  unique nulls not distinct (member_id, kind, region, sector, employment, remote_only)
);
create index job_alerts_member on public.job_alerts (member_id);
alter table public.job_alerts enable row level security;
revoke all on public.job_alerts from anon, authenticated;
grant select (id, kind, region, sector, employment, remote_only, created_at),
  insert (kind, region, sector, employment, remote_only), delete on public.job_alerts to authenticated;

create policy "base rule" on public.job_alerts as restrictive for all to authenticated
  using ((select access.is_member())) with check ((select access.is_member()));
create policy "your own" on public.job_alerts for select to authenticated
  using (member_id = (select auth.uid()));
create function access.my_job_alert_count() returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.job_alerts a where a.member_id = (select auth.uid());
$$;
revoke all on function access.my_job_alert_count() from public, anon;
grant execute on function access.my_job_alert_count() to authenticated;

create policy "up to 5 of your own" on public.job_alerts for insert to authenticated
  with check (member_id = (select auth.uid()) and access.my_job_alert_count() < 5);
create policy "remove your own" on public.job_alerts for delete to authenticated
  using (member_id = (select auth.uid()));

-- The day's alerts. Each member's alerts run as that member through access.opportunity_list, so what they are
-- told about is exactly what they could find themselves.
create function private.queue_job_alerts(run_at timestamptz default now()) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  since timestamptz := coalesce((select (s.value #>> '{}')::timestamptz from public.platform_settings s
                                 where s.key = 'job_alerts_last_run'), run_at - interval '1 day');
  target uuid;
  fresh int;
  queued int := 0;
begin
  for target in
    select distinct a.member_id from public.job_alerts a
    join public.members m on m.id = a.member_id and m.status = 'approved'
    order by a.member_id
  loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', target, 'role', 'authenticated', 'otp_verified', true)::text, true);
    select count(distinct o.id)::int into fresh
    from public.job_alerts a
    cross join lateral access.opportunity_list(a.kind, a.region, null, a.remote_only, a.sector, a.employment,
                                               null, 0) o
    where a.member_id = target and not o.is_mine
      and o.published_at > greatest(since, a.created_at) and o.published_at <= run_at;
    if fresh > 0 then
      perform private.notify(target, 'S2', jsonb_build_object('count', fresh));
      queued := queued + 1;
    end if;
  end loop;
  perform set_config('request.jwt.claims', '', true);
  insert into public.platform_settings (key, value) values ('job_alerts_last_run', to_jsonb(run_at::text))
  on conflict (key) do update set value = excluded.value;
  return queued;
end;
$$;
revoke all on function private.queue_job_alerts(timestamptz) from public, anon, authenticated;

select cron.schedule('job-alerts', '0 4 * * *', $job$ select private.queue_job_alerts() $job$);
