begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select hasnt_column('private', 'phone_codes', 'code', 'phone codes are stored as a hash only');

set local role authenticated;
select throws_ok('select * from private.phone_codes', '42501', null, 'signed-in sessions cannot read phone codes');
select throws_ok('select * from private.sms_pending', '42501', null, 'signed-in sessions cannot read waiting codes');
reset role;
set local role anon;
select throws_ok('select * from private.test_sms', '42501', null, 'visitors cannot read the test sender');
select throws_ok($$select private.send_sms_hook('{}'::jsonb)$$, '42501', null, 'visitors cannot run the SMS hook');
reset role;

-- The Send SMS hook: Tanzanian numbers only, and it only parks the code for phone-start.
select is(private.send_sms_hook('{"user": {"phone": "447700900123"}, "sms": {"otp": "123456"}}'::jsonb) #>> '{error,http_code}',
  '400', 'a number outside Tanzania is refused before anything is sent');
select is(private.send_sms_hook('{"user": {"phone": "255712000901"}, "sms": {"otp": "123456"}}'::jsonb),
  '{}'::jsonb, 'a +255 number is accepted');
select is((select code from private.sms_pending where phone = '+255712000901'), '123456',
  'the code waits under the number with its plus sign');
select private.send_sms_hook('{"user": {"phone": "255712000901"}, "sms": {"otp": "654321"}}'::jsonb);
select is((select count(*)::int from private.sms_pending where phone = '+255712000901'), 1,
  'a new code replaces the waiting one');

-- The code rules: 10 minutes, 3 attempts, used once.
select ok(private.issue_phone_code('+255712000901', 'right', 10, 10), 'a code is issued');
select is((select result from private.check_phone_code('+255712000901', 'wrong', 3)), 'wrong_code', 'a wrong code is refused');
select is((select attempts_left from private.check_phone_code('+255712000901', 'wrong', 3)), 1, 'two wrong codes leave one try');
select is((select result from private.check_phone_code('+255712000901', 'right', 3)), 'ok', 'the right code works within its tries');
select is((select result from private.check_phone_code('+255712000901', 'right', 3)), 'no_code', 'a code works once');

select private.issue_phone_code('+255712000902', 'right', 10, 10);
update private.phone_codes set expires_at = now() - interval '1 second' where phone = '+255712000902';
select is((select result from private.check_phone_code('+255712000902', 'right', 3)), 'expired', 'an old code is refused');

select private.issue_phone_code('+255712000903', 'x', 10, 1);
select ok(not private.issue_phone_code('+255712000903', 'y', 10, 1), 'the hourly limit stops more codes');

select * from finish();
rollback;
