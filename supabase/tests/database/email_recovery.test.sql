begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(30);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000013' || k)::uuid, 'er' || k || '@test.invalid'
from unnest(array['01', '02', '03', 'a1', 'a2']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000001301', 'er_lost', 'suspended'),
  ('00000000-0000-0000-0000-000000001302', 'er_other', 'approved'),
  ('00000000-0000-0000-0000-000000001303', 'er_owner', 'approved');
insert into public.staff (id, full_name, role, active) values
  ('00000000-0000-0000-0000-0000000013a1', 'Recovery Filer', 'admin', true),
  ('00000000-0000-0000-0000-0000000013a2', 'Recovery Checker', 'admin', true);
insert into public.member_private (member_id, phone, email, id_encrypted) values
  ('00000000-0000-0000-0000-000000001301', '+255712000131', 'er01@test.invalid',
   extensions.pgp_sym_encrypt('19900101123456781234', private.vault_secret('id_encryption_key'))),
  ('00000000-0000-0000-0000-000000001302', '+255712000132', 'er02@test.invalid', null),
  ('00000000-0000-0000-0000-000000001303', '+255712000133', 'er03@test.invalid', null);

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000013' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;

select is((select row(result, member_id)::text from private.file_email_recovery('nobody', 'n@test.invalid', '1234', null)),
  '(ok,)', 'an unknown username gets the same answer and no request');
select is((select row(result, member_id)::text from private.file_email_recovery('er_lost', 'er02@test.invalid', '1234', null)),
  '(ok,)', 'nor does an email already in use');
select is((select result from private.file_email_recovery('er_lost', 'n@test.invalid', '12', null)), 'invalid',
  'the last 4 digits are 4 digits');
select is((select result from private.file_email_recovery('ER_Lost', 'found.again@test.invalid', '1234', null)), 'ok',
  'a suspended member can ask for a new email');
select is((select id_digits_match from public.email_recoveries where member_id = '00000000-0000-0000-0000-000000001301'),
  true, 'the last 4 ID digits are checked against the encrypted number, never stored');
select is((select count(*)::int from private.email_outbox where member_id = '00000000-0000-0000-0000-000000001301'
           and kind = 'E4'), 2, 'both addresses get E4');
select is((select count(*)::int from private.email_outbox where kind = 'E4' and to_email = 'found.again@test.invalid'),
  1, 'one of them at the new address');

set local role authenticated;
select pg_temp.login('02');
select is((select count(*)::int from public.email_recoveries), 0, 'another member reads no recovery');
select throws_ok($$select public.decide_email_recovery(gen_random_uuid(), true)$$, 'P0001', 'not_allowed',
  'nor decides one');
select throws_ok($$select * from private.file_email_recovery('er_lost', 'x@test.invalid', '1234', null)$$,
  '42501', null, 'nor files one without the Edge Function');

select pg_temp.login('a2');
select is(public.decide_email_recovery((select id from public.email_recoveries limit 1), true), 'no_photo',
  'a request is decided only once its face photo is attached');
reset role;
select private.attach_recovery_photo((select id from public.email_recoveries limit 1),
  '00000000-0000-0000-0000-000000001301/recovery-1');
update public.email_recoveries set filed_by = '00000000-0000-0000-0000-0000000013a1';
set local role authenticated;
select pg_temp.login('a1');
select is(public.decide_email_recovery((select id from public.email_recoveries limit 1), true), 'filed_by_you',
  'staff who filed a request cannot approve it themselves');
select pg_temp.login('a2');
select is(public.decide_email_recovery((select id from public.email_recoveries limit 1), false, ''), 'reason_required',
  'a refusal needs a reason');
select is(public.decide_email_recovery((select id from public.email_recoveries limit 1), true), 'ok',
  'another Administrator approves it');

reset role;
select ok((select takes_effect_at > now() + interval '47 hours' from public.email_recoveries limit 1),
  'the change waits 48 hours');
select is(private.apply_due_email_recoveries(), 0, 'nothing changes before then');
update public.email_recoveries set takes_effect_at = now() - interval '1 minute';
select is(private.apply_due_email_recoveries(), 1, 'after 48 hours the change is applied');
select is((select row(u.email, p.email, m.status)::text from auth.users u
           join public.member_private p on p.member_id = u.id join public.members m on m.id = u.id
           where u.id = '00000000-0000-0000-0000-000000001301'),
  '(found.again@test.invalid,found.again@test.invalid,suspended)',
  'the sign-in and contact email change together, and the suspension stays');
select is((select count(*)::int from private.email_outbox where kind = 'E1' and to_email = 'er01@test.invalid'), 1,
  'and the old address is told');

select is((select count(*)::int from private.email_outbox where kind = 'E5'
           and member_id = '00000000-0000-0000-0000-000000001301'), 2, 'E5 went to both addresses');
select ok(exists (select 1 from private.audit_log where action = 'recovery.applied'
                  and actor_staff_id = '00000000-0000-0000-0000-0000000013a2'), 'the applied change names the deciding Administrator');
select is(public.decide_email_recovery((select id from public.email_recoveries limit 1), true), 'already_decided',
  'an applied request cannot be decided again');

select is((select result from private.file_email_recovery('er_owner', 'grief1@test.invalid', '0000', null, '10.0.0.9')), 'ok',
  'a request records the IP');
select ok(exists (select 1 from private.audit_log where action = 'recovery.requested' and ip_address = '10.0.0.9'),
  'in the audit log too');
select private.file_email_recovery('er_owner', 'grief2@test.invalid', '0000', null, '10.0.0.9');
select private.file_email_recovery('er_owner', 'grief3@test.invalid', '0000', null, '10.0.0.9');
select is((select result from private.file_email_recovery('er_owner', 'grief4@test.invalid', '0000', null, '10.0.0.9')),
  'too_many', 'one IP address sends 3 requests a day');
select is((select count(*)::int from public.email_recoveries where member_id = '00000000-0000-0000-0000-000000001303'
           and status = 'pending'), 3, 'and new requests never cancel earlier ones, so junk cannot push the owner out');

set local role authenticated;
select pg_temp.login('03');
select is((select count(*)::int from public.email_recoveries), 3, 'the member reads their own requests');
select is(public.cancel_my_email_recovery(), 'ok', 'and cancels them during the wait');
select pg_temp.login('a2');
select is(public.decide_email_recovery((select id from public.email_recoveries
                                        where member_id = '00000000-0000-0000-0000-000000001303' limit 1), true),
  'already_decided', 'a cancelled request cannot be approved');
reset role;
update public.email_recoveries set status = 'approved', takes_effect_at = now() - interval '1 minute'
where id = (select id from public.email_recoveries where member_id = '00000000-0000-0000-0000-000000001303' limit 1);
update public.members set status = 'deleted' where id = '00000000-0000-0000-0000-000000001303';
select is(private.apply_due_email_recoveries(), 0, 'a deleted account is never brought back by a recovery');

select * from finish();
rollback;
