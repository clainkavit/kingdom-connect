begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(15);

delete from private.login_attempts;
insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000014' || k)::uuid, 'sa' || k || '@test.invalid'
from unnest(array['01', '02', 'a1', 'b1', 'b2']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000001401', 'sa_loud', 'approved'),
  ('00000000-0000-0000-0000-000000001402', 'sa_quiet', 'approved');
insert into public.staff (id, full_name, role, active) values
  ('00000000-0000-0000-0000-0000000014a1', 'Alert Admin', 'admin', true),
  ('00000000-0000-0000-0000-0000000014b1', 'Alert Super', 'super_admin', true),
  ('00000000-0000-0000-0000-0000000014b2', 'Former Super', 'super_admin', false);

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000014' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;

select is(private.check_security_alerts(), 0, 'a quiet platform raises no alert');

insert into private.login_attempts (identifier, failed_count, updated_at)
values ('username:old_failures', 4, now() - interval '1 day');
update private.login_attempts set failed_count = 5, updated_at = now() where identifier = 'username:old_failures';
select is(private.check_security_alerts(), 0, 'old failures on one name do not count as recent ones');
insert into private.login_attempts (identifier, failed_count, updated_at)
select 'username:guess' || g, 0, now() from generate_series(1, 5) g;
update private.login_attempts set failed_count = failed_count + 1 where identifier like 'username:guess%';
update private.login_attempts set failed_count = failed_count + 1 where identifier like 'username:guess%';
update private.login_attempts set failed_count = failed_count + 1 where identifier like 'username:guess%';
update private.login_attempts set failed_count = failed_count + 1 where identifier like 'username:guess%';
insert into private.login_attempts (identifier, failed_count, locked_until, updated_at)
select 'username:locked' || g, 5, now() + interval '15 minutes', now() from generate_series(1, 3) g;
insert into public.message_threads (id, member_a, member_b) values
  ('00000000-0000-0000-0014-000000000001', '00000000-0000-0000-0000-000000001401', '00000000-0000-0000-0000-000000001402');
insert into public.messages (thread_id, sender_id, body)
select '00000000-0000-0000-0014-000000000001', '00000000-0000-0000-0000-000000001401', 'msg ' || g
from generate_series(1, 101) g;
insert into private.audit_log (actor_member_id, action, target_type, target_id, after)
values ('00000000-0000-0000-0000-000000001402', 'registration.duplicate_id', 'members',
        '00000000-0000-0000-0000-000000001402', '{"id_type": "nida"}');

select is(private.check_security_alerts(), 4, 'each monitored event raises one alert');
select is((select array_agg(kind order by kind) from public.security_alerts),
  array['duplicate_id', 'failed_logins', 'lockouts', 'message_volume'],
  'failed sign-ins, lockouts, message volume and a duplicate ID');
select is(private.check_security_alerts(), 0, 'the next check does not repeat them');
update public.security_alerts set created_at = now() - interval '11 minutes' where kind = 'failed_logins';
select is(private.check_security_alerts(), 1, 'a burst still going after 10 minutes raises the failed sign-in alert again');
select is((select count(*)::int from private.email_outbox where kind = 'Y1' and to_email = 'sab1@test.invalid'), 5,
  'every alert is emailed to the Super Admin');
select is((select count(*)::int from private.email_outbox where kind = 'Y1' and to_email = 'sab2@test.invalid'), 0,
  'not to a deactivated Super Admin');
select is((select count(*)::int from private.email_outbox where kind = 'Y1' and to_email = 'saa1@test.invalid'), 0,
  'not to other Administrators');
select ok((select payload ->> 'alert' from private.email_outbox where kind = 'Y1' limit 1) is not null,
  'with a short description');

set local role authenticated;
select pg_temp.login('01');
select is((select count(*)::int from public.security_alerts), 0, 'members never see alerts');
select throws_ok($$select public.acknowledge_security_alert(gen_random_uuid())$$, 'P0001', 'not_allowed',
  'nor mark them seen');
select throws_ok($$select private.check_security_alerts()$$, '42501', null, 'nor run the check');
select pg_temp.login('a1');
select is((select count(*)::int from public.security_alerts), 5, 'staff read them on the dashboard');
select public.acknowledge_security_alert((select id from public.security_alerts where kind = 'lockouts'));
select is((select count(*)::int from public.security_alerts where acknowledged_at is null), 4,
  'and acknowledge them');

select * from finish();
rollback;
