begin;
create extension if not exists pgtap with schema extensions;
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(24);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000071' || k)::uuid, 'pk' || k || '@test.invalid'
from unnest(array['01', '02', '03', '04', 'a1']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000007101', 'pk_poster', 'approved'),
  ('00000000-0000-0000-0000-000000007102', 'pk_skilled', 'approved'),
  ('00000000-0000-0000-0000-000000007103', 'pk_other', 'approved'),
  ('00000000-0000-0000-0000-000000007104', 'pk_outsider', 'approved');
insert into public.profiles (member_id, full_name) values
  ('00000000-0000-0000-0000-000000007101', 'Pick Poster'), ('00000000-0000-0000-0000-000000007102', 'Pick Skilled'),
  ('00000000-0000-0000-0000-000000007103', 'Pick Other'), ('00000000-0000-0000-0000-000000007104', 'Pick Outsider');
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000071a1', 'Pick Staff', 'admin', true);
insert into public.skills (name) values ('pick tailoring') on conflict (name) do nothing;
insert into public.profile_skills (member_id, skill_id)
select '00000000-0000-0000-0000-000000007102', id from public.skills where name = 'pick tailoring';
insert into public.opportunities (id, poster_member_id, type, title, status)
values ('00000000-0000-0000-0071-00000000000a', '00000000-0000-0000-0000-000000007101', 'job', 'PK tailor', 'draft');
insert into public.opportunity_skills (opportunity_id, skill_id)
select '00000000-0000-0000-0071-00000000000a', id from public.skills where name = 'pick tailoring';

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000071' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
create function pg_temp.req() returns uuid language sql as $$
  select id from public.pick_requests where opportunity_id = '00000000-0000-0000-0071-00000000000a';
$$;
create function pg_temp.my_pick() returns uuid language sql as $$
  select pick_id from public.my_pick_invites() limit 1;
$$;
create function pg_temp.pick_of(who text) returns uuid language sql as $$
  select id from public.picks where member_id = ('00000000-0000-0000-0000-0000000071' || who)::uuid;
$$;

set local role authenticated;
select pg_temp.login('02');
select is(public.request_pick('00000000-0000-0000-0071-00000000000a', 5, ''), 'not_found', 'only the poster asks');
select pg_temp.login('01');
select is(public.request_pick('00000000-0000-0000-0071-00000000000a', 7, ''), 'invalid', '5, 10, 15 or 20 only');
select is(public.request_pick('00000000-0000-0000-0071-00000000000a', 5, 'Call 0712 345 678'), 'contact_details',
  'the note to staff holds no contact details');
select is(public.request_pick('00000000-0000-0000-0071-00000000000a', 5, 'Sews school uniforms'), 'ok',
  'the poster asks Kingdom Connect to pick 5');
select is((select status from public.my_pick_request('00000000-0000-0000-0071-00000000000a')), 'waiting',
  'it waits until the post is approved');

reset role;
update public.opportunities set status = 'published', published_at = now(), closing_at = private.tanzania_today() + 20,
  description = repeat('Sew school uniforms for the new term. ', 4), employment_type = 'full_time', remote = true, role = 'Tailor', sector_id = (select id from public.sectors limit 1)
where id = '00000000-0000-0000-0071-00000000000a';
set local role authenticated;
select pg_temp.login('01');
select is((select status from public.my_pick_request('00000000-0000-0000-0071-00000000000a')), 'picking',
  'approval puts it in the staff queue');

select pg_temp.login('03');
select throws_ok($$ select * from public.pick_queue() $$, 'not_allowed', 'members cannot read the queue');
select throws_ok($$ select * from public.pick_suggestions(pg_temp.req()) $$, 'not_allowed',
  'members cannot read suggestions');
select is((select count(*)::int from public.respond_to_opportunity('00000000-0000-0000-0071-00000000000a', '', null)
           where result = 'picked_post'), 1, 'a picked post takes no applications');

select pg_temp.login('a1');
select is((select count(*)::int from public.pick_queue() where request_id = pg_temp.req()), 1,
  'staff see the post waiting for a pick');
select is((select member_id from public.pick_suggestions(pg_temp.req()) limit 1),
  '00000000-0000-0000-0000-000000007102'::uuid, 'the member with the matching skill is suggested first');
select is((select count(*)::int from public.pick_suggestions(pg_temp.req(), 100)
           where member_id = '00000000-0000-0000-0000-000000007101'), 0, 'the poster is never suggested');
select ok((select bool_and(p.prosrc !~ 'investor_flags|member_private|id_number')
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'access' and p.proname = 'pick_suggestions'),
  'suggestions never read the investor flag, private details or ID data');
select is(public.ask_picks(pg_temp.req(),
  array['00000000-0000-0000-0000-000000007102', '00000000-0000-0000-0000-000000007103']::uuid[],
  array['Has sewn uniforms for two schools.', 'Quick and careful.']), 2, 'staff ask two members, each with a why');

select pg_temp.login('02');
select is((select count(*)::int from public.my_pick_invites()), 1, 'a member sees only their own invite');
select pg_temp.login('01');
select is((select count(*)::int from public.pick_list('00000000-0000-0000-0071-00000000000a')), 0,
  'the poster sees nobody before the list is sent');

select pg_temp.login('02');
select is(public.answer_pick(pg_temp.my_pick(), true), 'ok', 'the skilled member says yes');
select is(public.answer_pick(pg_temp.my_pick(), false), 'already_answered', 'once');
select pg_temp.login('03');
select is(public.answer_pick(pg_temp.my_pick(), false), 'ok', 'the other member says no, privately');
select is((select count(*)::int from public.picks) + (select count(*)::int from public.pick_requests), 0,
  'members cannot read the pick tables directly');

select pg_temp.login('a1');
select is(public.send_pick_list(pg_temp.req()), 'ok', 'staff send the list');
select pg_temp.login('01');
select is((select array_agg(full_name)::text from public.pick_list('00000000-0000-0000-0071-00000000000a')),
  '{"Pick Skilled"}', 'the poster sees only the member who said yes, with no trace of the no');
select is(public.set_pick_view(
  (select pick_id from public.pick_list('00000000-0000-0000-0071-00000000000a')), 'not_fit'), 'ok',
  'the poster can mark Not a fit');

reset role;
update public.picks set status = 'asked', answered_by = now() - interval '1 hour' where id = pg_temp.pick_of('03');
set local role authenticated;
select pg_temp.login('03');
select is(public.answer_pick(pg_temp.my_pick(), true), 'expired', 'after 3 days the ask has lapsed');

select * from finish();
rollback;
