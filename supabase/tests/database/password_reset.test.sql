begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000004701', 'pr01@test.invalid');
insert into public.members (id, username, status) values ('00000000-0000-0000-0000-000000004701', 'pr_member', 'approved');
insert into public.member_private (member_id, phone, email, language)
values ('00000000-0000-0000-0000-000000004701', '+255712004701', 'pr01@test.invalid', 'en');
insert into auth.sessions (id, user_id) values
  ('00000000-0000-0000-0047-0000000000f1', '00000000-0000-0000-0000-000000004701'),
  ('00000000-0000-0000-0047-0000000000f2', '00000000-0000-0000-0000-000000004701');
insert into private.login_attempts (identifier, user_id, failed_count, locked_until)
values ('username:pr_member', '00000000-0000-0000-0000-000000004701', 5, now() + interval '15 minutes');

create function pg_temp.start(reset uuid, who uuid default '00000000-0000-0000-0000-000000004701', code text default 'right')
returns text language sql as $$
  select private.start_password_reset(who, reset, 'hash-' || code, 10, 10, 60);
$$;
create function pg_temp.check(reset uuid, code text, consume boolean default false) returns text language sql as $$
  select result || coalesce(':' || attempts_left, '') from private.check_password_reset(reset, 'hash-' || code, 3, consume);
$$;

select is(pg_temp.start('00000000-0000-0000-0047-000000000001'), 'ok', 'a member starts a reset');
select is(pg_temp.start('00000000-0000-0000-0047-000000000002'), 'too_soon', 'a new code waits 60 seconds');
select is(pg_temp.start('00000000-0000-0000-0047-000000000003', null), 'ok',
  'a username with no account still gets a reset id, so the answer is the same');
select is((select count(*)::int from private.password_resets where user_id is null), 1, 'with a row nobody can use');

select is(pg_temp.check('00000000-0000-0000-0047-000000000001', 'wrong'), 'wrong_code:2', 'a wrong code counts an attempt');
select is(pg_temp.check('00000000-0000-0000-0047-000000000001', 'right'), 'ok:1', 'the right code is confirmed');
select is((select consumed_at is null from private.password_resets where id = '00000000-0000-0000-0047-000000000001'), true,
  'without using it up');
select is(pg_temp.check('00000000-0000-0000-0047-000000000001', 'right', true), 'ok:0',
  'the third check, with the new password, still counts and uses the code up');

update private.password_resets set created_at = now() - interval '2 minutes';
select is(pg_temp.start('00000000-0000-0000-0047-000000000004'), 'ok', 'after 60 seconds a new code can be sent');
select is(pg_temp.check('00000000-0000-0000-0047-000000000004', 'right', true), 'ok:2', 'the right code with a new password is used up');
select is(pg_temp.check('00000000-0000-0000-0047-000000000004', 'right', true), 'expired', 'and cannot be used again');
select is((select user_id::text from private.check_password_reset('00000000-0000-0000-0047-000000000004', 'hash-right', 3, true)), null,
  'nor does it give the account again');

select is(pg_temp.check('00000000-0000-0000-0047-000000000003', 'anything'), 'wrong_code:2',
  'a reset for an unknown username answers like a real one');
select is(pg_temp.check('00000000-0000-0000-0047-000000000003', 'hash-guess'), 'wrong_code:1', 'every time');
select is(pg_temp.check('00000000-0000-0000-0047-000000000003', 'other'), 'too_many:0', 'until its attempts run out');
select is(pg_temp.check('00000000-0000-0000-0047-0000000000ff', 'right'), 'wrong_code:2', 'an unknown reset id answers the same way');

update private.password_resets set created_at = now() - interval '2 minutes';
select is(pg_temp.start('00000000-0000-0000-0047-000000000005'), 'ok', 'another code is sent');
update private.password_resets set expires_at = now() - interval '1 minute' where id = '00000000-0000-0000-0047-000000000005';
select is(pg_temp.check('00000000-0000-0000-0047-000000000005', 'right'), 'expired', 'a code older than 10 minutes has expired');

update private.password_resets set created_at = now() - interval '2 minutes';
insert into private.password_resets (id, user_id, code_hash, expires_at, created_at)
select gen_random_uuid(), '00000000-0000-0000-0000-000000004701', 'x', now() + interval '10 minutes', now() - interval '5 minutes'
from generate_series(1, 7);
select is(pg_temp.start('00000000-0000-0000-0047-000000000006'), 'too_many', 'at most 10 codes an hour');

select lives_ok($$select private.finish_password_reset('00000000-0000-0000-0000-000000004701')$$, 'the new password is saved');
select is((select count(*)::int from auth.sessions where user_id = '00000000-0000-0000-0000-000000004701'), 0,
  'every device is signed out');
select is((select count(*)::int from private.login_attempts where identifier = 'username:pr_member'), 0, 'the lockout ends');
select is((select count(*)::int from public.notifications where member_id = '00000000-0000-0000-0000-000000004701' and kind = 'E7')
          || '/' || (select count(*)::int from private.audit_log where action = 'password.reset'
                     and target_id = '00000000-0000-0000-0000-000000004701'),
  '1/1', 'the member is told, and the reset is in the audit log');

select * from finish();
rollback;
