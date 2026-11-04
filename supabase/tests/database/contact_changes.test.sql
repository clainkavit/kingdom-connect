begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(25);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000012' || k)::uuid, 'cc' || k || '@test.invalid'
from unnest(array['01', '02', 'a1']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000001201', 'cc_member', 'approved'),
  ('00000000-0000-0000-0000-000000001202', 'cc_other', 'approved');
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000012a1', 'Contact Staff', 'admin', true);
insert into public.member_private (member_id, phone, email, address) values
  ('00000000-0000-0000-0000-000000001201', '+255712000121', 'cc01@test.invalid', 'Mwanza'),
  ('00000000-0000-0000-0000-000000001202', '+255712000122', 'cc02@test.invalid', null);

create function pg_temp.login(who text, verified boolean default true) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000012' || who, 'role', 'authenticated', 'otp_verified', verified)::text, true);
$$;

set local role authenticated;
select pg_temp.login('01', false);
select throws_ok($$select public.set_my_phone('+255754000999')$$, 'P0001', 'not_allowed',
  'a session without the email code cannot change the phone');

select pg_temp.login('01');
select throws_ok($$update public.member_private set phone = '+255700000000'$$, '42501', null,
  'a member cannot change their phone directly');
select throws_ok($$update public.member_private set email = 'x@test.invalid'$$, '42501', null, 'nor their email');
select throws_ok($$update public.member_private set address = 'x'$$, '42501', null, 'nor their address');
select is(public.set_my_phone('+255 754 000 999'), 'ok', 'but can change the phone through set_my_phone');
select is((select phone from public.member_private where member_id = '00000000-0000-0000-0000-000000001201'),
  '+255754000999', 'which stores it without spaces');
select is(public.set_my_phone('0754000999'), 'invalid_phone', 'the phone must start with +255');
select is(public.set_my_address('Ilemela, Mwanza'), 'ok', 'a member changes their address');
select is(public.set_my_address(repeat('x', 301)), 'too_long', 'up to 300 characters');
select throws_ok($$select private.start_email_change('00000000-0000-0000-0000-000000001201', 'x@test.invalid', 'h', 10, 5)$$,
  '42501', null, 'a member cannot start an email change without the Edge Function');
select throws_ok($$select * from private.check_email_change_code('00000000-0000-0000-0000-000000001201', 'h', 3)$$,
  '42501', null, 'nor check a code');

reset role;
select ok(exists (select 1 from private.audit_log where action = 'member.phone_changed'
                  and actor_member_id = '00000000-0000-0000-0000-000000001201'
                  and before ->> 'phone' = '+255712000121' and after ->> 'phone' = '+255754000999'),
  'the phone change is in the audit log with the actor, before and after');
select ok(exists (select 1 from private.audit_log where action = 'member.address_changed'
                  and before ->> 'address' = 'Mwanza' and after ->> 'address' = 'Ilemela, Mwanza'),
  'so is the address change');
select is((select count(*)::int from public.notifications where member_id = '00000000-0000-0000-0000-000000001201'
           and kind = 'E2'), 1, 'a phone change sends E2');

select is(private.start_email_change('00000000-0000-0000-0000-000000001201', 'CC01@test.invalid', 'h', 10, 5),
  'same_email', 'the new email cannot be the same one');
select is(private.start_email_change('00000000-0000-0000-0000-000000001201', 'cc02@test.invalid', 'h', 10, 5),
  'taken', 'an email in use is not revealed to the member; no code is ever valid for it');
select is((select result from private.check_email_change_code('00000000-0000-0000-0000-000000001201', 'h', 3)),
  'wrong_code', 'so a code for a taken email never works');
select is(private.start_email_change('00000000-0000-0000-0000-000000001201', 'New.Mail@test.invalid', 'right', 10, 5),
  'ok', 'a code is sent to a free email');
select is((select result from private.check_email_change_code('00000000-0000-0000-0000-000000001201', 'wrong', 3)),
  'wrong_code', 'a wrong code is refused');
select is((select row(result, new_email)::text from private.check_email_change_code(
             '00000000-0000-0000-0000-000000001201', 'right', 3)),
  '(ok,new.mail@test.invalid)', 'the right code gives the new email');

update auth.users set email = 'new.mail@test.invalid' where id = '00000000-0000-0000-0000-000000001201';
select is((select email from public.member_private where member_id = '00000000-0000-0000-0000-000000001201'),
  'new.mail@test.invalid', 'changing the sign-in email changes the contact email in the same transaction');
select ok(exists (select 1 from private.audit_log where action = 'member.email_changed'
                  and before ->> 'email' = 'cc01@test.invalid' and after ->> 'email' = 'new.mail@test.invalid'),
  'and logs it, whichever way the sign-in email was changed');
select is((select count(*)::int from public.notifications where member_id = '00000000-0000-0000-0000-000000001201'
           and kind = 'E1'), 1, 'and sends E1 to the new address');

update private.email_changes set expires_at = now() - interval '1 minute';
select is((select result from private.check_email_change_code('00000000-0000-0000-0000-000000001201', 'right', 3)),
  'expired', 'an expired code is refused');
update private.email_changes set expires_at = now() + interval '5 minutes', attempts = 3;
select is((select result from private.check_email_change_code('00000000-0000-0000-0000-000000001201', 'right', 3)),
  'too_many_attempts', 'after 3 wrong tries the code is spent');

select * from finish();
rollback;
