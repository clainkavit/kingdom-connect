begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(34);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000029' || k)::uuid, 'iv' || k || '@test.invalid'
from unnest(array['01', '02', '03', '04', 'a1']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000002901', 'iv_owner', 'approved'),
  ('00000000-0000-0000-0000-000000002902', 'iv_business', 'approved'),
  ('00000000-0000-0000-0000-000000002903', 'iv_invited', 'approved'),
  ('00000000-0000-0000-0000-000000002904', 'iv_plain', 'approved');
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000029a1', 'Investor Desk', 'admin', true);
insert into public.member_private (member_id, phone, email, language)
select ('00000000-0000-0000-0000-0000000029' || k)::uuid, '+2557120009' || k, 'iv' || k || '@test.invalid', 'en'
from unnest(array['01', '02', '03', '04']) k;
insert into public.profiles (member_id, full_name, region_id) values
  ('00000000-0000-0000-0000-000000002901', 'Asha Mwita', (select id from public.regions order by name_en limit 1)),
  ('00000000-0000-0000-0000-000000002902', 'Baraka Biashara', null),
  ('00000000-0000-0000-0000-000000002903', 'Imani Invited', null),
  ('00000000-0000-0000-0000-000000002904', 'Plain Member', null);
insert into public.verification_requests (member_id, level, status, submitted_at, decided_at)
select ('00000000-0000-0000-0000-0000000029' || k)::uuid, 1, 'approved', now(), now()
from unnest(array['01', '02', '03', '04']) k;
insert into public.verification_requests (member_id, level, status, submitted_at, decided_at)
  values ('00000000-0000-0000-0000-000000002902', 2, 'approved', now(), now());
insert into public.ideas (id, owner_id, title, problem, sector_id, stage, seeking, investment_min_tzs,
                          investment_max_tzs, status, published_at) values
  ('00000000-0000-0000-0000-00000000e291', '00000000-0000-0000-0000-000000002901', 'Solar dryers',
   'Farmers lose much of their harvest before market.', (select id from public.sectors order by name_en limit 1),
   'prototype', 'investor', 10000000, 50000000, 'published', now()),
  ('00000000-0000-0000-0000-00000000e292', '00000000-0000-0000-0000-000000002901', 'Clinic booking',
   'Patients wait hours to see a doctor in town.', (select id from public.sectors order by name_en desc limit 1),
   'idea', 'partner', null, 5000000, 'published', now() - interval '1 day');

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000029' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
create function pg_temp.member(who text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000029' || who)::uuid;
$$;
create function pg_temp.pool(sector uuid default null, stage text default null, min_tzs bigint default null,
                             max_tzs bigint default null, region uuid default null, saved boolean default false)
returns text language sql as $$
  select coalesce(string_agg(title, ',' order by published_at desc), '')
  from public.investor_ideas(sector, stage, min_tzs, max_tzs, region, saved, 0);
$$;

set local role authenticated;
select pg_temp.login('04');
select is(public.my_investor_status(), 'none', 'a Level 1 member has no investor tools to see');
select is(public.apply_for_investor_flag(null, null, ''), 'not_eligible', 'and cannot apply');
select is(pg_temp.pool(), '', 'the investor pool is empty for them');
select is(public.set_idea_saved('00000000-0000-0000-0000-00000000e291', true), 'not_investor', 'nor can they save');
select is(public.invite_investor(pg_temp.member('04'), null, null), 'not_staff', 'members cannot grant the flag');
select is((select count(*)::int from public.investor_list()), 0, 'nor list investors');
select is((select count(*)::int from public.investor_application_queue()), 0, 'nor see applications');
select is((select count(*)::int from public.investor_invite_search('iv')), 0, 'nor search for invitations');

select pg_temp.login('02');
select is(public.my_investor_status(), 'can_apply', 'a Level 2 member may apply');
select is(public.apply_for_investor_flag(null, 'huge', ''), 'invalid_band', 'the band is one of the three');
select is(public.apply_for_investor_flag(null, '10m_to_50m', 'Call me on 0754 123 456'), 'contact_details',
  'the note carries no contact details');
select is(public.apply_for_investor_flag((select id from public.sectors order by name_en limit 1), '10m_to_50m',
  'We back farm businesses.'), 'ok', 'and applies');
select is(public.apply_for_investor_flag(null, null, ''), 'already_applied', 'once at a time');
select is(public.my_investor_status(), 'applied', 'and sees the application waiting');

select pg_temp.login('a1');
select is((select username from public.investor_application_queue() where username like 'iv\_%'), 'iv_business',
  'staff see the application');
select is(public.decide_investor_application((select application_id from public.investor_application_queue()
                                              where username = 'iv_business'), true),
  'ok', 'and approve it');
select is((select username || ' ' || route || ' ' || ticket_band from public.investor_list()
           where username like 'iv\_%'),
  'iv_business application 10m_to_50m', 'the flag is granted with its route and band');
select is((select string_agg(username || ':' || is_investor, ',' order by username)
           from public.investor_invite_search('iv_')),
  'iv_business:true,iv_invited:false,iv_owner:false,iv_plain:false', 'staff search members to invite');
select is(public.invite_investor(pg_temp.member('03'), null, 'over_50m'), 'ok', 'staff invite a member');
select is(public.invite_investor(pg_temp.member('03'), null, null), 'already_investor', 'once');

select pg_temp.login('02');
select is(public.my_investor_status(), 'investor', 'the member now has investor tools');
select is(pg_temp.pool(), 'Solar dryers,Clinic booking', 'and the investor pool');
select is(pg_temp.pool(stage => 'idea'), 'Clinic booking', 'filtered by stage');
select is(pg_temp.pool(min_tzs => 20000000), 'Solar dryers', 'by an overlapping range');
select is(pg_temp.pool(region => (select id from public.regions order by name_en limit 1)), 'Solar dryers,Clinic booking',
  'and by the owner''s region');
select is(public.set_idea_saved('00000000-0000-0000-0000-00000000e292', true), 'ok', 'an investor saves an idea');
select is(pg_temp.pool(saved => true), 'Clinic booking', 'and sees it in Saved');
select is((select count(*)::int from public.investor_flags), 1, 'an investor sees only their own flag');

select pg_temp.login('01');
select is((select count(*)::int from public.investor_flags), 0,
  'no member-facing query returns the flag: not the table');
select is((select count(*)::int from public.saved_ideas), 0, 'nor who saved their idea');
select ok(not exists (select 1 from information_schema.columns c
                      join information_schema.role_column_grants g
                        on g.table_schema = c.table_schema and g.table_name = c.table_name and g.column_name = c.column_name
                      where c.table_schema = 'public' and g.grantee = 'authenticated'
                        and c.table_name not in ('investor_flags', 'investor_applications', 'saved_ideas',
                                                 'idea_access_requests')
                        and (c.column_name ilike '%investor%')),
  'nor any column of another table or view');
select is((select count(*)::int from public.notifications where kind = 'V1'), 0, 'nor anyone else''s V1');

reset role;
select is((select count(*)::int from public.notifications where kind = 'V1'
           and member_id in (pg_temp.member('02'), pg_temp.member('03'))), 2, 'V1 tells each new investor');
set local role authenticated;
select pg_temp.login('a1');
select is(public.revoke_investor_flag(pg_temp.member('02')), 'ok', 'staff revoke a flag');

select * from finish();
rollback;
