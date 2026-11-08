begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(33);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000026' || k)::uuid, 'ia' || k || '@test.invalid'
from unnest(array['01', '02', '03', '04', 'a1']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000002601', 'ia_owner', 'approved'),
  ('00000000-0000-0000-0000-000000002602', 'ia_partner', 'approved'),
  ('00000000-0000-0000-0000-000000002603', 'ia_investor', 'approved'),
  ('00000000-0000-0000-0000-000000002604', 'ia_plain', 'approved');
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000026a1', 'Investor Desk', 'admin', true);
insert into public.member_private (member_id, phone, email, language)
select ('00000000-0000-0000-0000-0000000026' || k)::uuid, '+2557120006' || k, 'ia' || k || '@test.invalid', 'en'
from unnest(array['01', '02', '03', '04']) k;
insert into public.profiles (member_id, full_name, headline) values
  ('00000000-0000-0000-0000-000000002601', 'Asha Mwita', 'Engineer'),
  ('00000000-0000-0000-0000-000000002602', 'Neema Joseph', 'Farmer'),
  ('00000000-0000-0000-0000-000000002603', 'Baraka Secret', 'Fund manager');
insert into public.verification_requests (member_id, level, status, submitted_at, decided_at)
select ('00000000-0000-0000-0000-0000000026' || k)::uuid, 1, 'approved', now(), now()
from unnest(array['01', '02', '03', '04']) k;
insert into public.investor_flags (member_id, granted_by, route, sector_focus, ticket_band)
values ('00000000-0000-0000-0000-000000002603', '00000000-0000-0000-0000-0000000026a1', 'invitation',
        (select id from public.sectors order by name_en limit 1), '10m_to_50m');
insert into public.ideas (id, owner_id, title, problem, sector_id, stage, seeking, status, published_at)
values ('00000000-0000-0000-0000-00000000e261', '00000000-0000-0000-0000-000000002601', 'Solar dryers',
        'Farmers lose much of their harvest before market.', (select id from public.sectors order by name_en limit 1),
        'prototype', 'both', 'published', now());
insert into public.idea_details (idea_id, description) values
  ('00000000-0000-0000-0000-00000000e261', repeat('Confidential plan. ', 5));

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000026' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
create function pg_temp.idea() returns uuid language sql as $$ select '00000000-0000-0000-0000-00000000e261'::uuid; $$;
create function pg_temp.request(who text) returns uuid language sql as $$
  select id from public.idea_access_requests where requester_id = ('00000000-0000-0000-0000-0000000026' || who)::uuid;
$$;

set local role authenticated;
select pg_temp.login('04');
select is(public.express_interest(pg_temp.idea(), 'investor', true), 'not_investor',
  'without an investor flag a member cannot ask anonymously');

select pg_temp.login('01');
select is(public.express_interest(pg_temp.idea(), 'partner', false), 'own_idea', 'an owner cannot ask for their own idea');

select pg_temp.login('02');
select is(public.express_interest(pg_temp.idea(), 'pirate', false), 'invalid_role', 'the role is investor, partner or both');
select is(public.express_interest(pg_temp.idea(), 'partner', false), 'ok', 'a member asks by name, as partner');
select is(public.express_interest(pg_temp.idea(), 'both', false), 'already_requested', 'once per idea');
select perform_view from (select public.record_idea_view(pg_temp.idea()) as perform_view) v;

select pg_temp.login('03');
select is(public.express_interest(pg_temp.idea(), 'partner', true), 'invalid_role',
  'anonymous interest is as an investor');
select is(public.express_interest(pg_temp.idea(), 'investor', true), 'ok', 'an investor asks anonymously');
select perform_view from (select public.record_idea_view(pg_temp.idea()) as perform_view) v;
select perform_view from (select public.record_idea_view(pg_temp.idea()) as perform_view) v;

select pg_temp.login('01');
select is((select count(*)::int from public.idea_access_requests), 0, 'the owner never reads the requests table');
select is((select string_agg(coalesce(requester_name, 'A verified investor') || ':' || role || ':' || status, ','
                             order by anonymous) from public.requests_for_my_idea(pg_temp.idea())),
  'Neema Joseph:partner:pending,A verified investor:investor:pending', 'the owner sees both request cards');
select is((select row(requester_id, requester_name, requester_headline, ticket_band)::text
           from public.requests_for_my_idea(pg_temp.idea()) where anonymous),
  '(,,,10m_to_50m)', 'an anonymous card has no id, name or headline, only the band');
select ok((select sector_focus_en is not null from public.requests_for_my_idea(pg_temp.idea()) where anonymous),
  'and the sector focus');
select is(public.investor_view_count(pg_temp.idea()), 1, 'Viewed by 1 investor: the partner is not counted');
select is((select count(*)::int from public.idea_views), 0, 'the owner never reads who viewed');

reset role;
select ok(not exists (select 1 from public.notifications where member_id = '00000000-0000-0000-0000-000000002601'
                      and kind = 'I2' and (payload::text ~* '(baraka|secret|fund manager|ia_investor|0000000026)')),
  'I2 never names the anonymous investor');
select is((select payload ->> 'band' from public.notifications where kind = 'I2'), 'TZS 10M to 50M',
  'I2 gives the band');
select is((select payload ->> 'name' from public.notifications where kind = 'I1'), 'Neema Joseph',
  'I1 names a named requester');
set local role authenticated;

select pg_temp.login('02');
select is(public.decide_idea_request(pg_temp.request('02'), true), 'not_found', 'a requester cannot decide their own');
select is((select status from public.idea_access_requests), 'pending', 'and reads only their own request');

select pg_temp.login('01');
select is(public.decide_idea_request(pg_temp.request('02'), true), 'not_found',
  'the owner cannot look up request ids directly');
select is(public.decide_idea_request((select request_id from public.requests_for_my_idea(pg_temp.idea())
                                      where not anonymous), true), 'ok', 'the owner approves the named request');
select is(public.decide_idea_request((select request_id from public.requests_for_my_idea(pg_temp.idea())
                                      where anonymous), false), 'ok', 'and declines the anonymous one');
select is((select requester_name from public.requests_for_my_idea(pg_temp.idea()) where anonymous), null,
  'a declined anonymous investor stays unnamed');
select is(public.decide_idea_request((select request_id from public.requests_for_my_idea(pg_temp.idea())
                                      where anonymous), true), 'already_decided', 'a decision stands');

reset role;
select is((select string_agg(kind, ',' order by kind) from public.notifications
           where member_id in ('00000000-0000-0000-0000-000000002602', '00000000-0000-0000-0000-000000002603')),
  'I3,I4', 'I3 tells the approved requester, I4 the declined one');
select ok((select payload::text !~* 'reason' from public.notifications where kind = 'I4'), 'I4 is neutral');
-- The NDA (I04) reveals an anonymous investor; until then nothing has.
update public.idea_access_requests set status = 'nda_accepted' where requester_id = '00000000-0000-0000-0000-000000002603';
set local role authenticated;
select pg_temp.login('01');
select is((select requester_name from public.requests_for_my_idea(pg_temp.idea()) where anonymous), 'Baraka Secret',
  'after the NDA, the investor is named to the owner');
select is(public.revoke_idea_access((select request_id from public.requests_for_my_idea(pg_temp.idea())
                                     where not anonymous)), 'ok', 'the owner revokes access');
select is((select status from public.requests_for_my_idea(pg_temp.idea()) where not anonymous), 'revoked',
  'at once');

select pg_temp.login('04');
select is((select interest_count from public.idea_summaries where id = pg_temp.idea()), 2,
  'the pool shows how many asked, never who');
select is((select count(*)::int from public.requests_for_my_idea(pg_temp.idea())), 0,
  'another member cannot read the request cards');
select is(public.investor_view_count(pg_temp.idea()), 0, 'nor the view count');

reset role;
select ok(exists (select 1 from public.notifications where kind = 'I6'
                  and member_id = '00000000-0000-0000-0000-000000002602'), 'I6 tells the requester');
select ok(exists (select 1 from private.audit_log where action = 'idea_access_requests.update'
                  and actor_member_id = '00000000-0000-0000-0000-000000002601'), 'revoking is logged');

select * from finish();
rollback;
