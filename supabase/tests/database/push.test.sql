begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(24);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000046' || k)::uuid, 'pu' || k || '@test.invalid' from unnest(array['01', '02', 'a1']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000004601', 'pu_one', 'approved'),
  ('00000000-0000-0000-0000-000000004602', 'pu_two', 'approved');
insert into public.member_private (member_id, phone, email, language)
select ('00000000-0000-0000-0000-0000000046' || k)::uuid, '+2557120046' || k, 'pu' || k || '@test.invalid', 'en'
from unnest(array['01', '02']) k;
insert into public.verification_requests (member_id, level, status, submitted_at, decided_at)
select ('00000000-0000-0000-0000-0000000046' || k)::uuid, 1, 'approved', now(), now() from unnest(array['01', '02']) k;
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000046a1', 'Push Checker', 'admin', true);

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000046' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
create function pg_temp.tok(n int) returns text language sql as $$
  select 'ExponentPushToken[abcdefghij' || lpad(n::text, 4, '0') || ']';
$$;

set local role authenticated;
select pg_temp.login('01');
select is(public.register_push_token(pg_temp.tok(1), 'android'), 'ok', 'a member registers a phone');
select is(public.register_push_token('not a token', 'android'), 'invalid_token', 'a token must look like an Expo token');
select is(public.register_push_token(pg_temp.tok(2), 'windows'), 'invalid_platform', 'the platform is android or ios');
select is(public.register_push_token(pg_temp.tok(1), 'ios'), 'ok', 'registering the same token again updates it');
select is((select count(*)::int from public.push_tokens), 1, 'without a second row');
select is((select platform from public.push_tokens), 'ios', 'and keeps the newest platform');

select is((select string_agg(category || ':' || enabled, ',') from public.my_push_preferences()),
  'all:true,account:true,connections:true,messages:true,opportunities:true,ideas:true,plans:true',
  'push is on for the master switch and every category until switched off');
select is(public.set_push_preference('messages', false), 'ok', 'a category can be switched off');
select is((select enabled from public.my_push_preferences() where category = 'messages'), false, 'and reads as off');
select is(public.set_push_preference('all', false), 'ok', 'so can the master switch');
select is(public.set_push_preference('reports', false), 'invalid_category', 'a category with no push is refused');
select is(public.set_push_preference('all', true), 'ok', 'the master switch comes back on');

select is((select count(*)::int from generate_series(2, 7) n, lateral (select public.register_push_token(pg_temp.tok(n), 'android')) r), 6,
  'a member can register more phones');
select is((select count(*)::int from public.push_tokens), 5, 'but keeps only the newest 5');

select pg_temp.login('02');
select is((select count(*)::int from public.push_tokens), 0, 'another member reads none of those tokens');
select is(public.register_push_token(pg_temp.tok(7), 'android'), 'ok', 'a phone that changes hands moves to the new member');
select is((select count(*)::int from public.push_tokens), 1, 'who now holds it');
select is(public.remove_push_token(pg_temp.tok(7)), 'ok', 'and can remove it');
select is(public.remove_push_token(pg_temp.tok(7)), 'not_found', 'once');

select pg_temp.login('a1');
select is(public.register_push_token(pg_temp.tok(8), 'android'), 'not_allowed', 'staff are not members and register no phone');

reset role;
select private.notify('00000000-0000-0000-0000-000000004601', 'C1', '{"name": "Neema S."}'::jsonb);
select is((select count(*)::int from private.push_outbox where member_id = '00000000-0000-0000-0000-000000004601' and kind = 'C1'), 1,
  'every notification is queued for push');
select is((select count(*)::int from private.claim_pushes(10)), 1, 'the sender claims it');
select is((select count(*)::int from private.claim_pushes(10)), 0, 'and nobody claims it twice');

set local role anon;
select throws_ok($$select public.register_push_token('ExponentPushToken[abcdefghij9999]', 'android')$$, '42501', null,
  'a signed-out visitor cannot register a phone');

select * from finish();
rollback;
