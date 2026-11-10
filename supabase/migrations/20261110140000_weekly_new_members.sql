-- D06: the admin dashboard's line chart of new verified members per week (decided 10 Nov 2026). A member counts in
-- the week (Monday to Sunday, Tanzania time) of their first approved identity check. Staff only; members never get
-- this figure (PRD section 7, criterion 1).

create function access.weekly_new_members(weeks int default 8)
returns table (week_start date, new_members int)
language sql stable security definer set search_path = '' as $$
  with span as (
    select greatest(1, least(coalesce(weekly_new_members.weeks, 8), 52)) as n,
           date_trunc('week', now() at time zone 'Africa/Dar_es_Salaam')::date as this_week
  ),
  first_approval as (
    select v.member_id, min(v.decided_at) as approved_at
    from public.verification_requests v
    where v.level = 1 and v.status = 'approved' and v.decided_at is not null
    group by v.member_id
  )
  select w.week_start::date,
         (select count(*)::int from first_approval f
          where date_trunc('week', f.approved_at at time zone 'Africa/Dar_es_Salaam')::date = w.week_start::date)
  from span s
  cross join lateral generate_series(s.this_week - (s.n - 1) * 7, s.this_week, interval '7 days') as w (week_start)
  where (select access.is_staff())
  order by w.week_start;
$$;
revoke all on function access.weekly_new_members(int) from public, anon;
grant execute on function access.weekly_new_members(int) to authenticated;

create function public.weekly_new_members(weeks int default 8)
returns table (week_start date, new_members int)
language sql stable security invoker set search_path = '' as $$ select * from access.weekly_new_members(weeks); $$;
revoke all on function public.weekly_new_members(int) from public, anon;
grant execute on function public.weekly_new_members(int) to authenticated;
