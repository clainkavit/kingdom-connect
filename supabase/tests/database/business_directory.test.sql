begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(16);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000017' || k)::uuid, 'bd' || k || '@test.invalid'
from unnest(array['00', '01', '02', '03', '04', '05', '06', '07', '08', '09']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000001700', 'bd_viewer', 'approved'),
  ('00000000-0000-0000-0000-000000001701', 'bd_level2', 'approved'),
  ('00000000-0000-0000-0000-000000001702', 'bd_level3', 'approved'),
  ('00000000-0000-0000-0000-000000001703', 'bd_pending', 'approved'),
  ('00000000-0000-0000-0000-000000001704', 'bd_rejected', 'approved'),
  ('00000000-0000-0000-0000-000000001705', 'bd_expired', 'approved'),
  ('00000000-0000-0000-0000-000000001706', 'bd_hidden', 'approved'),
  ('00000000-0000-0000-0000-000000001707', 'bd_blocker', 'approved'),
  ('00000000-0000-0000-0000-000000001708', 'bd_suspended', 'suspended'),
  ('00000000-0000-0000-0000-000000001709', 'bd_blocked', 'approved');
insert into public.verification_requests (member_id, level, status, submitted_at, decided_at)
select ('00000000-0000-0000-0000-0000000017' || k)::uuid, 1, 'approved', now(), now()
from unnest(array['00', '01', '02', '03', '04', '05', '06', '07', '08', '09']) k;
insert into public.profiles (member_id, full_name, region_id, hidden_from_directory)
select ('00000000-0000-0000-0000-0000000017' || k)::uuid, 'Owner ' || k,
       (select id from public.regions where name_en = case when k = '02' then 'Arusha' else 'Mwanza' end),
       k = '06'
from unnest(array['00', '01', '02', '03', '04', '05', '06', '07', '08', '09']) k;
select set_config('test.trade', (select id::text from public.sectors where name_en = 'Trade'), true);
select set_config('test.building', (select id::text from public.sectors where name_en = 'Construction'), true);
insert into public.businesses (member_id, name, sector_id, size, description, level, status)
select ('00000000-0000-0000-0000-0000000017' || b.k)::uuid, b.name,
       (case when b.k = '02' then current_setting('test.building') else current_setting('test.trade') end)::uuid,
       'small', b.description, b.level, b.status
from (values
  ('00', 'Viewer Own Shop', 'The viewer''s own business', 2, 'approved'),
  ('01', 'Pendo Supplies', 'Farm tools and seeds', 2, 'approved'),
  ('02', 'Mlima Builders', 'Roads and bridges', 3, 'approved'),
  ('03', 'Waiting Traders', 'Not yet verified', null, 'pending'),
  ('04', 'Refused Traders', 'Rejected documents', null, 'rejected'),
  ('05', 'Lapsed Traders', 'Licence expired', 2, 'expired'),
  ('06', 'Hidden Owner Traders', 'Owner hides their profile', 2, 'approved'),
  ('07', 'Blocker Traders', 'Owner blocked the viewer', 2, 'approved'),
  ('08', 'Suspended Traders', 'Owner is suspended', 2, 'approved'),
  ('09', 'Blocked Traders', 'The viewer blocked the owner', 2, 'approved')
) as b (k, name, description, level, status);
insert into public.blocks (blocker_id, blocked_id) values
  ('00000000-0000-0000-0000-000000001707', '00000000-0000-0000-0000-000000001700'),
  ('00000000-0000-0000-0000-000000001700', '00000000-0000-0000-0000-000000001709');
insert into public.connections (member_a, member_b)
values ('00000000-0000-0000-0000-000000001700', '00000000-0000-0000-0000-000000001706');

create function pg_temp.names(q text default null, sector uuid default null, level int default null,
                              region uuid default null) returns text
language sql as $$
  select coalesce(string_agg(name, ',' order by name), '')
  from public.search_businesses(q => q, sector => sector, level => level, region => region, page_size => 50)
  where member_id::text like '00000000-0000-0000-0000-0000000017%';
$$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub', '00000000-0000-0000-0000-000000001700', 'role', 'authenticated', 'otp_verified', true)::text, true);

select is(pg_temp.names(), 'Mlima Builders,Pendo Supplies',
  'only approved Level 2 and Level 3 businesses are listed');
select ok(position('Waiting' in pg_temp.names()) = 0 and position('Refused' in pg_temp.names()) = 0,
  'a pending or rejected business never appears');
select ok(position('Lapsed' in pg_temp.names()) = 0, 'nor an expired one');
select ok(position('Hidden Owner' in pg_temp.names()) = 0,
  'a business follows its owner hidden from the directory, even for a connection');
select ok(position('Blocker' in pg_temp.names()) = 0, 'and is not listed when the owner blocked the viewer');
select ok(position('Blocked Traders' in pg_temp.names()) = 0, 'or when the viewer blocked the owner');
select is((select count(*)::int from public.businesses where name in ('Blocker Traders', 'Blocked Traders')), 0,
  'nor can it be read from the table directly across a block');
select ok(position('Suspended' in pg_temp.names()) = 0, 'nor when its owner is suspended');
select ok(position('Viewer Own' in pg_temp.names()) = 0, 'a member does not see their own business');
select is(pg_temp.names(level => 3), 'Mlima Builders', 'the level filter keeps Opportunity Posters');
select is(pg_temp.names(sector => current_setting('test.trade')::uuid), 'Pendo Supplies', 'the sector filter');
select is(pg_temp.names(region => (select id from public.regions where name_en = 'Arusha')), 'Mlima Builders',
  'the region filter uses the owner''s region');
select is(pg_temp.names(q => 'pendo'), 'Pendo Supplies', 'search finds a business by name');
select is(pg_temp.names(q => 'bridges'), 'Mlima Builders', 'and by description');
select is((select row(owner_name, level, sector_en, region_en)::text
           from public.search_businesses(q => 'pendo')), '("Owner 01",2,Trade,Mwanza)',
  'a card carries the owner, level, sector and region');
select ok(pg_get_function_result('public.search_businesses(text, uuid, int, uuid, int, int)'::regprocedure)
          !~ '(brela|tin|licence|address|photo)', 'and no registration number, address or photo');

select * from finish();
rollback;
