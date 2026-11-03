begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(5);

insert into auth.users (id, email)
select ('00000000-0000-4000-9000-' || lpad(g::text, 12, '0'))::uuid, 'perf' || g || '@test.invalid'
from generate_series(1, 10000) g;
insert into public.members (id, username, status)
select ('00000000-0000-4000-9000-' || lpad(g::text, 12, '0'))::uuid, 'perf_' || g, 'approved'
from generate_series(1, 10000) g;
insert into public.skills (name)
select 'perf skill ' || g from generate_series(1, 300) g on conflict do nothing;
insert into public.profiles (member_id, full_name, headline, profession, region_id, district_id, hidden_from_directory)
select ('00000000-0000-4000-9000-' || lpad(g::text, 12, '0'))::uuid,
       'Perf Person ' || g, 'Headline ' || g,
       (array['Accountant', 'Nurse', 'Teacher', 'Driver', 'Engineer', 'Farmer'])[1 + g % 6],
       d.region_id, d.id, g % 20 = 0
from generate_series(1, 10000) g
join lateral (select id, region_id from public.districts order by md5(id::text || g) limit 1) d on true;
insert into public.profile_skills (member_id, skill_id)
select ('00000000-0000-4000-9000-' || lpad(g::text, 12, '0'))::uuid, s.id
from generate_series(1, 10000) g
join lateral (select id from public.skills where name::text like 'perf skill %'
              order by md5(id::text || g) limit 5) s on true;
analyze public.profiles;
analyze public.profile_skills;
analyze public.skills;

create function pg_temp.ms(query text) returns numeric language plpgsql as $$
declare started timestamptz := clock_timestamp();
begin
  execute 'select count(*) from (' || query || ') x';
  return extract(epoch from clock_timestamp() - started) * 1000;
end $$;
grant execute on function pg_temp.ms(text) to authenticated;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-9000-000000000001", "role": "authenticated", "otp_verified": true}', true);

select cmp_ok(pg_temp.ms('select * from public.search_directory()'), '<', 2000::numeric,
  'the directory opens in under 2 seconds with 10,000 members');
select cmp_ok(pg_temp.ms('select * from public.search_directory(q => ''person 42'')'), '<', 2000::numeric,
  'a name search takes under 2 seconds');
select cmp_ok(pg_temp.ms('select * from public.search_directory(q => ''skill 7'')'), '<', 2000::numeric,
  'a search that matches skills takes under 2 seconds');
select cmp_ok(pg_temp.ms('select * from public.search_directory(skill => ''perf skill 12'', profession => ''nurse'')'), '<', 2000::numeric,
  'a skill and profession filter takes under 2 seconds');
select cmp_ok(pg_temp.ms('select * from public.search_directory(page => 30)'), '<', 2000::numeric,
  'a later page takes under 2 seconds');
reset role;

select * from finish();
rollback;
