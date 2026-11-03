begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(34);

select has_table('public', 'notifications', 'notifications exists');
select has_table('public', 'notification_preferences', 'notification_preferences exists');
select has_table('public', 'push_tokens', 'push_tokens exists');
select has_table('private', 'email_outbox', 'the email outbox is private');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'one@test.invalid'),
  ('00000000-0000-0000-0000-0000000000b2', 'two@test.invalid'),
  ('00000000-0000-0000-0000-0000000000b3', 'applicant@test.invalid');
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-0000000000b1', 'notify_one', 'approved'),
  ('00000000-0000-0000-0000-0000000000b2', 'notify_two', 'approved'),
  ('00000000-0000-0000-0000-0000000000b3', 'notify_applicant', 'pending');

select lives_ok(
  $$select private.notify('00000000-0000-0000-0000-0000000000b1', 'C1', '{"name": "Notify Two"}')$$,
  'notify stores a notification'
);
select is((select count(*)::int from public.notifications where member_id = '00000000-0000-0000-0000-0000000000b1'), 1,
  'the notification is stored for the member');
select is((select count(*)::int from private.email_outbox where member_id = '00000000-0000-0000-0000-0000000000b1' and status = 'pending'), 1,
  'its email is queued');

select throws_ok(
  $$select private.notify('00000000-0000-0000-0000-0000000000b1', 'C1', '{"name": "X", "phone": "+255700000000"}')$$,
  'P0001', null, 'a payload with a phone field is refused'
);
select throws_ok(
  $$select private.notify('00000000-0000-0000-0000-0000000000b1', 'C1', '{"name": "reach me at someone@example.test"}')$$,
  'P0001', null, 'a payload holding an email address is refused'
);
select throws_ok(
  $$select private.notify('00000000-0000-0000-0000-0000000000b1', 'C1', '{"name": "call +255 712 345 678"}')$$,
  'P0001', null, 'a payload holding a phone number is refused'
);
select throws_ok(
  $$select private.notify('00000000-0000-0000-0000-0000000000b1', 'I2', '{"name": "Investor Person", "sector": "Agriculture"}')$$,
  'P0001', null, 'an anonymous interest never names the investor'
);
select throws_ok(
  $$select private.notify('00000000-0000-0000-0000-0000000000b1', 'I2', '{"investor_display": "Someone", "sector": "Agriculture"}')$$,
  'P0001', null, 'an anonymous interest carries only the idea, sector and band'
);
select lives_ok(
  $$select private.notify('00000000-0000-0000-0000-0000000000b2', 'I2', '{"idea_title": "Solar pumps", "idea_id": "6f0e0000-0000-4000-8000-000000000255", "sector": "Energy", "band": "TZS 10 to 50M"}')$$,
  'an anonymous interest with only the allowed fields is stored'
);
select throws_ok(
  $$select private.notify('00000000-0000-0000-0000-0000000000b1', 'C1', '{"name": {"phone": "+255700000000"}}')$$,
  'P0001', null, 'a nested payload is refused'
);
select throws_ok(
  $$select private.notify('00000000-0000-0000-0000-0000000000b1', 'C1', '{"name": "call 0712 345 678"}')$$,
  'P0001', null, 'a local phone number is refused'
);
select lives_ok(
  $$select private.notify('00000000-0000-0000-0000-0000000000b2', 'T1', '{"title": "Finance basics", "time": "2026-11-03 14:00", "event_id": "00000000-0000-0000-0000-000000000123"}')$$,
  'times and IDs are not mistaken for phone numbers'
);
select throws_ok(
  $$select private.notify('00000000-0000-0000-0000-0000000000b1', 'nonsense', '{}')$$,
  'P0001', null, 'an unknown kind is refused'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated", "otp_verified": true}', true);
select is((select count(*)::int from public.notifications), 1, 'a member reads their own notifications');
select lives_ok($$update public.notifications set read_at = now()$$, 'a member marks their own as read');
select throws_ok($$update public.notifications set kind = 'C2'$$, '42501', null, 'a member cannot change what a notification says');
select throws_ok(
  $$insert into public.notifications (member_id, kind) values ('00000000-0000-0000-0000-0000000000b1', 'C1')$$,
  '42501', null, 'a member cannot create notifications'
);
select lives_ok(
  $$insert into public.notification_preferences (member_id, category, email) values ('00000000-0000-0000-0000-0000000000b1', 'connections', false)$$,
  'a member sets their own email switch'
);
select lives_ok(
  $$insert into public.notification_preferences (member_id, category, email) values ('00000000-0000-0000-0000-0000000000b1', 'connections', true)
    on conflict (member_id, category) do update set member_id = excluded.member_id, category = excluded.category, email = excluded.email$$,
  'a member changes their switch the way the app saves it'
);
select throws_ok(
  $$insert into public.notification_preferences (member_id, category, email) values ('00000000-0000-0000-0000-0000000000b2', 'connections', false)$$,
  '42501', null, 'a member cannot set someone else''s switch'
);
select throws_ok('select * from private.email_outbox', '42501', null, 'a member cannot read the outbox');

select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000b2", "role": "authenticated", "otp_verified": true}', true);
select is((select count(*)::int from public.notifications where member_id <> '00000000-0000-0000-0000-0000000000b2'), 0,
  'a member never sees another member''s notifications');
select is((select count(*)::int from public.notification_preferences), 0, 'or their switches');
select lives_ok(
  $$insert into public.push_tokens (member_id, token, platform) values ('00000000-0000-0000-0000-0000000000b2', 'token-two', 'android')$$,
  'a member registers their own push token'
);
select throws_ok(
  $$insert into public.push_tokens (member_id, token, platform) values ('00000000-0000-0000-0000-0000000000b1', 'token-one', 'ios')$$,
  '42501', null, 'a member cannot register a token for someone else'
);
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000b1", "role": "authenticated", "otp_verified": true}', true);
select is((select count(*)::int from public.push_tokens), 0, 'a member never sees another member''s push tokens');
reset role;

update private.email_outbox set status = 'sending', next_attempt_at = now() - interval '1 minute'
  where member_id = '00000000-0000-0000-0000-0000000000b1';
select ok(
  (select count(*) from private.claim_emails(50) where member_id = '00000000-0000-0000-0000-0000000000b1') > 0,
  'an email stuck while sending is claimed again'
);

select private.notify('00000000-0000-0000-0000-0000000000b2', 'C3', '{"name": "Notify One"}');
select private.notify('00000000-0000-0000-0000-0000000000b2', 'C3', '{"name": "Notify One"}');
select private.queue_message_digests();
select is(
  (select payload ->> 'count' from private.email_outbox where member_id = '00000000-0000-0000-0000-0000000000b2' and kind = 'C3' and payload ? 'digest'),
  '2', 'the daily digest counts unread messages'
);
select private.queue_message_digests();
select is(
  (select count(*)::int from private.email_outbox where member_id = '00000000-0000-0000-0000-0000000000b2' and payload ? 'digest'),
  1, 'the digest does not repeat messages it already counted'
);

select is(
  (select count(*)::int from cron.job where jobname in ('send-notification-emails', 'message-digest')),
  2, 'the sender runs every minute and the digest daily'
);

select * from finish();
rollback;
