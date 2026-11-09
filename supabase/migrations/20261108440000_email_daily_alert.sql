-- F08: every email the app sends is counted for the day (Tanzania date). When the day's count reaches 200, a
-- security alert goes to the Super Administrators, once a day: Brevo's free plan sends 300 emails a day, and at 200
-- the plan should move to the paid one or the sending should be reduced.

alter table public.security_alerts drop constraint security_alerts_kind_check;
alter table public.security_alerts add constraint security_alerts_kind_check
  check (kind in ('failed_logins', 'lockouts', 'message_volume', 'duplicate_id', 'email_volume'));

create table private.email_daily (
  day date primary key,
  sent int not null default 0 check (sent >= 0)
);
revoke all on private.email_daily from public, anon, authenticated;

create function private.count_email_sent() returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  today date := private.tanzania_today();
  total int;
begin
  insert into private.email_daily (day, sent) values (today, 1)
  on conflict (day) do update set sent = private.email_daily.sent + 1
  returning sent into total;
  if total = 200 then
    perform private.raise_security_alert('email_volume',
      'The platform has sent 200 emails today. The Brevo free plan allows 300 a day: move to the paid plan or send less.',
      null, md5('email_volume' || today::text)::uuid);
  end if;
  return total;
end;
$$;
revoke all on function private.count_email_sent() from public, anon, authenticated;
