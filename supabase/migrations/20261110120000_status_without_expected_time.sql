-- R20: the registration status no longer carries an expected review time (decided 10 Nov 2026, #180). Under review
-- the applicant reads "You will get a notification when the review is done". Staff keep the queue age and the
-- 2-working-day alert on the admin dashboard.

create or replace function private.application_status(member uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  account public.members;
  latest public.verification_requests;
begin
  select * into account from public.members where id = member;
  if not found or account.status not in ('pending', 'rejected', 'approved') then
    return null;
  end if;
  if account.status = 'approved' then
    return jsonb_build_object('state', 'approved');
  end if;

  select * into latest from public.verification_requests
  where member_id = member and level = 1
  order by submitted_at desc limit 1;

  if account.status = 'rejected' then
    return jsonb_build_object(
      'state', case when account.resubmissions_used > 0 then 'rejected_final' else 'rejected' end,
      'reason', latest.reason);
  end if;
  if latest.status is distinct from 'pending' then
    return jsonb_build_object('state', 'drafting');
  end if;
  return jsonb_build_object('state', 'under_review');
end $$;
