begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(9);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000077' || k)::uuid, 'lr' || k || '@test.invalid'
from unnest(array['01', '02', '03', '04']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000007701', 'lr_viewer', 'approved'),
  ('00000000-0000-0000-0000-000000007702', 'lr_business', 'approved'),
  ('00000000-0000-0000-0000-000000007703', 'lr_plain', 'approved'),
  ('00000000-0000-0000-0000-000000007704', 'lr_hidden', 'approved');

select set_config('test.sector', (select id::text from public.sectors order by name_en limit 1), true);
select set_config('test.region', (select id::text from public.regions where name_en = 'Mwanza'), true);
select set_config('test.region2', (select id::text from public.regions where name_en <> 'Mwanza' order by name_en limit 1), true);

insert into public.skills (name) values ('accounting'), ('welding') on conflict (name) do nothing;
insert into public.profiles (member_id, full_name, region_id, hidden_from_directory) values
  ('00000000-0000-0000-0000-000000007701', 'List Viewer', current_setting('test.region')::uuid, false),
  ('00000000-0000-0000-0000-000000007702', 'Business Owner', null, false),
  ('00000000-0000-0000-0000-000000007703', 'Plain Poster', null, false),
  ('00000000-0000-0000-0000-000000007704', 'Hidden Owner', null, true);
insert into public.profile_skills (member_id, skill_id)
select '00000000-0000-0000-0000-000000007701', id from public.skills where name = 'accounting';
insert into public.businesses (member_id, name, sector_id, size, level, status) values
  ('00000000-0000-0000-0000-000000007702', 'Zqxlist Traders', current_setting('test.sector')::uuid, 'small', 2, 'approved'),
  ('00000000-0000-0000-0000-000000007704', 'Zqxlist Hidden Ltd', current_setting('test.sector')::uuid, 'small', 3, 'approved');

create function pg_temp.add(title text, poster text, skills text[], region text)
returns void language plpgsql as $$
declare saved uuid;
begin
  insert into public.opportunities (poster_member_id, type, title, employment_type, region_id, remote, sector_id,
                                    description, closing_at, status, published_at)
  values (('00000000-0000-0000-0000-0000000077' || poster)::uuid, 'job', title, 'full_time',
          current_setting(region)::uuid, false, current_setting('test.sector')::uuid,
          repeat('A fair description of the work to do. ', 4), private.tanzania_today() + 20, 'published', now())
  returning id into saved;
  insert into public.opportunity_skills (opportunity_id, skill_id)
  select saved, s.id from public.skills s where s.name = any (skills);
end $$;
select pg_temp.add('Zqxlist matching job', '02', array['accounting'], 'test.region');
select pg_temp.add('Zqxlist weak job', '03', array['welding'], 'test.region2');
select pg_temp.add('Zqxlist hidden poster job', '04', array['welding'], 'test.region2');
select pg_temp.add('Zqxlist own job', '01', array['accounting'], 'test.region');

select set_config('request.jwt.claims', json_build_object(
  'sub', '00000000-0000-0000-0000-000000007701', 'role', 'authenticated', 'otp_verified', true)::text, true);
set local role authenticated;

select is((select poster_verified from public.opportunity_list(q => 'zqxlist') where title = 'Zqxlist matching job'),
  true, 'a post by a Verified Business says so');
select is((select poster_verified from public.opportunity_list(q => 'zqxlist') where title = 'Zqxlist weak job'),
  false, 'a post by a member without a verified business does not');
select is((select poster_verified from public.opportunity_list(q => 'zqxlist') where title = 'Zqxlist hidden poster job'),
  false, 'a poster hidden from the directory shows no business level to someone they are not connected to');

select is((select reasons -> 0 ->> 'code' from public.opportunity_list(q => 'zqxlist') where title = 'Zqxlist matching job'),
  'skills', 'a post Scan would list carries the same reasons');
select is((select reasons from public.opportunity_list(q => 'zqxlist') where title = 'Zqxlist matching job'),
  (select reasons from public.scan_opportunities() where title = 'Zqxlist matching job'),
  'the list and Scan give the same reasons for the same post');
select is((select reasons from public.opportunity_list(q => 'zqxlist') where title = 'Zqxlist weak job'), null,
  'a post under the Scan minimum carries no reasons');
select is((select reasons from public.opportunity_list(q => 'zqxlist') where title = 'Zqxlist own job'), null,
  'the member''s own post carries no reasons');

reset role;
update public.members set status = 'pending' where id = '00000000-0000-0000-0000-000000007701';
set local role authenticated;
select is((select count(*)::int from public.opportunity_list(q => 'zqxlist') where reasons is not null), 0,
  'someone not verified yet can look at the list but gets no reasons');
reset role;

select is((select count(*)::int from public.scan_opportunities()), 0, 'and Scan stays for verified members');

select * from finish();
rollback;
