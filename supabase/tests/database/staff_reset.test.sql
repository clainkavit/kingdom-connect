begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000030' || k)::uuid, 'sr' || k || '@test.invalid'
from unnest(array['a1', 'a2', 'b1', 'b2', 'b3']) k;
insert into public.staff (id, full_name, role, active) values
  ('00000000-0000-0000-0000-0000000030a1', 'Reset Admin', 'admin', true),
  ('00000000-0000-0000-0000-0000000030a2', 'Gone Admin', 'admin', false),
  ('00000000-0000-0000-0000-0000000030b1', 'Reset Super', 'super_admin', true),
  ('00000000-0000-0000-0000-0000000030b2', 'Other Super', 'super_admin', true),
  ('00000000-0000-0000-0000-0000000030b3', 'Former Super', 'super_admin', false);
update public.staff set active = false
where role = 'super_admin' and id::text not like '00000000-0000-0000-0000-0000000030%';

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000030' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
create function pg_temp.request_of(who text) returns uuid language sql as $$
  select id from private.staff_resets
  where staff_id = ('00000000-0000-0000-0000-0000000030' || who)::uuid order by requested_at desc limit 1;
$$;

-- Asking
select private.request_staff_reset('  SRA1@test.invalid ', '10.0.0.1');
select is((select status from private.staff_resets where staff_id = '00000000-0000-0000-0000-0000000030a1'),
  'waiting', 'a staff member''s request waits for a Super Administrator, whatever the case of the email');
select is((select array_agg(to_email order by to_email) from private.email_outbox where kind = 'Y2'
           and payload ->> 'name' = 'Reset Admin'),
  array['srb1@test.invalid', 'srb2@test.invalid'], 'every active Super Administrator is told (Y2)');
select private.request_staff_reset('sra1@test.invalid', null);
select is((select count(*)::int from private.staff_resets where staff_id = '00000000-0000-0000-0000-0000000030a1'),
  1, 'asking again while a request waits adds nothing');
select is((select count(*)::int from private.email_outbox where kind = 'Y2' and payload ->> 'name' = 'Reset Admin'),
  2, 'and sends no more emails');
select private.request_staff_reset('nobody@test.invalid', null);
select private.request_staff_reset('sra2@test.invalid', null);
select is((select count(*)::int from private.staff_resets r join public.staff s on s.id = r.staff_id
           where s.full_name in ('Gone Admin') or r.staff_id is null), 0,
  'an unknown email or a deactivated account makes no request');
select private.request_staff_reset('srb1@test.invalid', null);
select is((select array_agg(to_email) from private.email_outbox where kind = 'Y2' and payload ->> 'name' = 'Reset Super'),
  array['srb2@test.invalid'], 'a Super Administrator''s own request goes only to the others');
select ok(exists (select 1 from private.audit_log where target_id = '00000000-0000-0000-0000-0000000030a1'
           and action = 'staff.reset_requested' and ip_address = '10.0.0.1'), 'the request is in the audit log');

-- Seeing
insert into private.login_attempts (identifier, user_id, failed_count, locked_until)
values ('email:srb2@test.invalid', '00000000-0000-0000-0000-0000000030b2', 5, now() + interval '15 minutes');
set local role authenticated;
select pg_temp.login('a1');
select is((select count(*)::int from public.staff_access_queue()), 0, 'an Administrator sees nothing');
select pg_temp.login('b2');
select is((select array_agg(kind || ':' || full_name order by full_name) from public.staff_access_queue()
           where staff_id::text like '00000000-0000-0000-0000-0000000030%'),
  array['locked:Other Super', 'reset:Reset Admin', 'reset:Reset Super'],
  'a Super Administrator sees waiting requests and locked staff accounts');
select throws_ok($$ select private.request_staff_reset('x@test.invalid', null) $$, '42501', null,
  'asking goes only through the edge function');
reset role;

-- Deciding
select is((select result from private.decide_staff_reset(pg_temp.request_of('a1'),
  '00000000-0000-0000-0000-0000000030a1', 'sent', 'h', 24, null)), 'not_super_admin',
  'an Administrator cannot send a link');
select is((select result from private.decide_staff_reset(pg_temp.request_of('a1'),
  '00000000-0000-0000-0000-0000000030b3', 'sent', 'h', 24, null)), 'not_super_admin',
  'a deactivated Super Administrator cannot send a link');
select is((select result from private.decide_staff_reset(pg_temp.request_of('b1'),
  '00000000-0000-0000-0000-0000000030b1', 'sent', 'h', 24, null)), 'own_request',
  'nobody approves their own request');
select is((select result || ':' || email from private.decide_staff_reset(pg_temp.request_of('a1'),
  '00000000-0000-0000-0000-0000000030b1', 'sent', 'hash-a1', 24, '10.0.0.2')), 'ok:sra1@test.invalid',
  'another Super Administrator sends the link');
select is((select round(extract(epoch from link_expires_at - decided_at) / 3600)::int
           from private.staff_resets where id = pg_temp.request_of('a1')), 24, 'the link works for 24 hours');
select is((select result from private.decide_staff_reset(pg_temp.request_of('a1'),
  '00000000-0000-0000-0000-0000000030b2', 'refused', null, 24, null)), 'not_found',
  'a request is decided only once');
select is((select result from private.decide_staff_reset(pg_temp.request_of('b1'),
  '00000000-0000-0000-0000-0000000030b2', 'refused', null, 24, null)), 'ok', 'a request can be refused');
select is((select count(*)::int from private.email_outbox where kind = 'Y4' and to_email = 'srb1@test.invalid'), 1,
  'the refusal is emailed (Y4)');
select is((select array_agg(action order by action) from private.audit_log
           where action like 'staff.reset_%' and actor_staff_id is not null
             and target_id::text like '00000000-0000-0000-0000-0000000030%'),
  array['staff.reset_refused', 'staff.reset_sent'], 'both decisions are in the audit log with who decided');

-- Using the link
select is((select result from private.check_staff_reset(pg_temp.request_of('a1'), 'wrong')), 'expired',
  'a wrong token opens nothing');
select is((select result || ':' || email from private.check_staff_reset(pg_temp.request_of('a1'), 'hash-a1')),
  'ok:sra1@test.invalid', 'the right token shows whose account it is');
insert into auth.sessions (id, user_id) values (gen_random_uuid(), '00000000-0000-0000-0000-0000000030a1');
select private.finish_staff_reset(pg_temp.request_of('a1'), null);
select is((select count(*)::int from auth.sessions where user_id = '00000000-0000-0000-0000-0000000030a1'), 0,
  'saving the password signs the staff member out everywhere');
select is((select count(*)::int from private.email_outbox where kind = 'E7' and to_email = 'sra1@test.invalid'), 1,
  'and emails them that the password changed (E7)');
select is((select result from private.check_staff_reset(pg_temp.request_of('a1'), 'hash-a1')), 'expired',
  'the link works only once');

-- Unlocking
select is(private.unlock_staff('00000000-0000-0000-0000-0000000030b2', '00000000-0000-0000-0000-0000000030b1', null),
  'ok', 'a Super Administrator ends a lockout early');

select * from finish();
rollback;
