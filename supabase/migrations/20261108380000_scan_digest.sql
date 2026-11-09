-- O09: the weekly Scan digest. Every Monday morning (Tanzania time) each approved member gets the matches from
-- Scan for Opportunities that were published since the last run, at most 5, as the in-app notice S1 and, when
-- their email switch for matches is on, one queued digest email. Nothing is sent to a member with no new match.
-- The scores come from access.scan_opportunities() itself: the job takes each member's identity for the length
-- of their scan, so there is one set of matching rules. The run time is kept in platform_settings so a run twice
-- finds nothing new the second time.

create function private.queue_scan_digests(run_at timestamptz default now()) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  since timestamptz := coalesce((select (s.value #>> '{}')::timestamptz from public.platform_settings s
                                 where s.key = 'scan_digest_last_run'), run_at - interval '7 days');
  target uuid;
  fresh int;
  queued int := 0;
begin
  for target in select m.id from public.members m where m.status = 'approved' order by m.id loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', target, 'role', 'authenticated', 'otp_verified', true)::text, true);
    select count(*)::int into fresh
    from (select 1 from access.scan_opportunities(20) s where s.published_at > since limit 5) x;
    if fresh > 0 then
      perform private.notify(target, 'S1', jsonb_build_object('count', fresh));
      if coalesce((select p.email from public.notification_preferences p
                   where p.member_id = target and p.category = 'matches'), true) then
        insert into private.email_outbox (member_id, kind, payload)
        values (target, 'S1', jsonb_build_object('digest', true, 'count', fresh));
      end if;
      queued := queued + 1;
    end if;
  end loop;
  perform set_config('request.jwt.claims', '', true);
  insert into public.platform_settings (key, value) values ('scan_digest_last_run', to_jsonb(run_at::text))
  on conflict (key) do update set value = excluded.value;
  return queued;
end;
$$;
revoke all on function private.queue_scan_digests(timestamptz) from public, anon, authenticated;

select cron.schedule('scan-digest', '0 2 * * 1', $job$ select private.queue_scan_digests() $job$);
