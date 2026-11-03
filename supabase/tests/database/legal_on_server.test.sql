begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into public.legal_texts (kind, version, body_en, body_sw, effective_at)
select k, '99.0', 'Test ' || k, 'Jaribio ' || k, now() - interval '1 minute'
from unnest(array['terms', 'privacy']) k;

insert into public.legal_texts (kind, version, body_en, body_sw, effective_at)
  values ('privacy', '99.5', 'Not yet in effect', 'Bado haijaanza', now() + interval '30 days');

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000010' || k)::uuid, 'lg' || k || '@test.invalid'
from unnest(array['01', '02', 'a1']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000001001', 'lg_member', 'approved'),
  ('00000000-0000-0000-0000-000000001002', 'lg_other', 'approved');
insert into public.profiles (member_id, full_name) values
  ('00000000-0000-0000-0000-000000001002', 'Other Member');
insert into public.member_private (member_id, phone, email, language) values
  ('00000000-0000-0000-0000-000000001001', '+255712000001', 'lg01@test.invalid', 'en');
insert into public.connections (member_a, member_b)
  values ('00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000001002');
insert into public.notifications (member_id, kind) values ('00000000-0000-0000-0000-000000001001', 'C2');
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000010a1', 'Legal Staff', 'admin', true);

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000010' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;

set local role authenticated;
select pg_temp.login('01');
select is((select count(*)::int from public.profiles), 0,
  'a Member who has not accepted the current terms and privacy notice reads no member table');
select is((select count(*)::int from public.members), 0, 'not even their own member row');
select is((select count(*)::int from public.member_private) + (select count(*)::int from public.connections)
          + (select count(*)::int from public.notifications) + (select count(*)::int from public.member_dashboard()), 0,
  'nor their private details, connections, notifications or dashboard');
select is(public.my_language(), 'en', 'but reads their saved language');
select lives_ok($$select public.set_my_language('sw')$$, 'and can change it on S07');
select is(public.my_language(), 'sw', 'and the choice is kept');
select is((select array_agg(kind order by kind) from public.legal_texts_to_accept()), array['privacy', 'terms'],
  'but sees the texts waiting for acceptance');
select lives_ok($$insert into public.legal_acceptances (legal_text_id, context_type)
                  values (access.current_legal_text_id('terms'), 'reaccept')$$, 'and accepts the terms');
select is((select count(*)::int from public.profiles), 0, 'one text is not enough');
select lives_ok($$insert into public.legal_acceptances (legal_text_id, context_type)
                  values (access.current_legal_text_id('privacy'), 'reaccept')$$, 'then the privacy notice');
select ok((select count(*)::int from public.profiles) >= 1, 'and then reads again');
select is((select count(*)::int from public.connections), 1, 'their connections too');
select is((select count(*)::int from public.legal_texts_to_accept()), 0,
  'a text that is not in effect yet asks for nothing');

select pg_temp.login('a1');
select ok((select count(*)::int from public.profiles) >= 1, 'staff are not asked to accept member texts');

reset role;
insert into public.legal_texts (kind, version, body_en, body_sw, effective_at)
  values ('terms', '99.1', 'Changed terms', 'Masharti mapya', now() - interval '1 second');
set local role authenticated;
select pg_temp.login('01');
select is((select count(*)::int from public.profiles), 0, 'a new version of the terms locks the Member out again');

select * from finish();
rollback;
