create function access.admin_dashboard_stats()
returns table (verified_members int, pending_submitted_at timestamptz[],
               rejected_members int, open_report_cases int, sign_ups_today int, daily_cap int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select access.is_staff()) then
    raise exception 'not_allowed';
  end if;
  return query
  select (select count(*)::int from public.members m where m.status = 'approved'),
         (select coalesce(array_agg(v.submitted_at order by v.submitted_at), '{}')
          from public.verification_requests v where v.status = 'pending' and v.level = 1),
         (select count(*)::int from public.members m where m.status = 'rejected'),
         (select count(*)::int from (select distinct r.target_type, r.target_id, r.subject_id from public.reports r
                                     where r.status in ('open', 'under_review')) c),
         private.sign_ups_today(),
         (select case when jsonb_typeof(s.value) = 'number' then (s.value #>> '{}')::int end
          from public.platform_settings s where s.key = 'daily_application_cap');
end;
$$;
revoke all on function access.admin_dashboard_stats() from public, anon;
grant execute on function access.admin_dashboard_stats() to authenticated;

create function public.admin_dashboard_stats()
returns table (verified_members int, pending_submitted_at timestamptz[],
               rejected_members int, open_report_cases int, sign_ups_today int, daily_cap int)
language sql stable security invoker set search_path = '' as $$
  select * from access.admin_dashboard_stats();
$$;
revoke all on function public.admin_dashboard_stats() from public, anon;
grant execute on function public.admin_dashboard_stats() to authenticated;
