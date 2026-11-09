begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000045a1', 'ea_super@test.invalid');
insert into public.staff (id, full_name, role, active) values
  ('00000000-0000-0000-0000-0000000045a1', 'Alert Super', 'super_admin', true);

select is(private.count_email_sent(), 1, 'the first email of the day counts 1');
select is(private.count_email_sent(), 2, 'and the next 2');
select is((select count(*)::int from public.security_alerts where kind = 'email_volume'), 0, 'no alert below 200');

select private.count_email_sent() from generate_series(3, 199);
select is((select sent from private.email_daily where day = private.tanzania_today()), 199, 'the day reaches 199');
select is((select count(*)::int from public.security_alerts where kind = 'email_volume'), 0, 'still no alert at 199');

select is(private.count_email_sent(), 200, 'the 200th email counts');
select is((select count(*)::int from public.security_alerts where kind = 'email_volume')
          || '/' || (select count(*)::int from private.email_outbox where kind = 'Y1' and to_email = 'ea_super@test.invalid'),
  '1/1', 'and raises one alert that is emailed to the Super Administrator');

select * from finish();
rollback;
