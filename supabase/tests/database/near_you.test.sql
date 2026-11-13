begin;
create extension if not exists pgtap with schema extensions;
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(6);

-- Two districts of one region, and a district of another region.
select set_config('test.d1', (select d.id::text from public.districts d
  where (select count(*) from public.districts x where x.region_id = d.region_id) >= 2 order by d.id limit 1), true);
select set_config('test.d2', (select d.id::text from public.districts d
  where d.region_id = (select region_id from public.districts where id = current_setting('test.d1')::uuid)
    and d.id <> current_setting('test.d1')::uuid order by d.id limit 1), true);
select set_config('test.d3', (select d.id::text from public.districts d
  where d.region_id <> (select region_id from public.districts where id = current_setting('test.d1')::uuid)
  order by d.id limit 1), true);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000044' || k)::uuid, 'ny' || k || '@test.invalid'
from unnest(array['01', '02', '03', '04', '05']) k;
insert into public.members (id, username, status)
select ('00000000-0000-0000-0000-0000000044' || k)::uuid, 'ny_' || k, 'approved'
from unnest(array['01', '02', '03', '04', '05']) k;
insert into public.profiles (member_id, full_name, profession, region_id, district_id)
select ('00000000-0000-0000-0000-0000000044' || k)::uuid, name, 'Nyprofession', d.region_id, d.id
from (values ('01', 'Ny Reader', 'test.d1'), ('02', 'Ny Same District', 'test.d1'),
             ('03', 'Ny Same Region', 'test.d2'), ('04', 'Ny Elsewhere', 'test.d3')) v (k, name, setting)
join public.districts d on d.id = current_setting(v.setting)::uuid;
insert into public.profiles (member_id, full_name, profession)
values ('00000000-0000-0000-0000-000000004405', 'Ny No Place', 'Nyprofession');
select private.set_skills('00000000-0000-0000-0000-000000004404', array['nyweaving']);
select private.set_skills('00000000-0000-0000-0000-000000004402', array['nyweaving']);

create function pg_temp.login(k text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000044' || k, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
create function pg_temp.listed() returns text language sql as $$
  select string_agg(full_name || ':' || near, ', ' order by n) from (
    select full_name, near, row_number() over () n
    from public.search_directory(profession => 'Nyprofession')) x;
$$;

set local role authenticated;
select pg_temp.login('01');
select is(left(pg_temp.listed(), length('Ny Same District:true, Ny Same Region:true, ')),
  'Ny Same District:true, Ny Same Region:true, ',
  'with no words: same district first, then same region; near means the reader''s region');
select is((select string_agg(full_name || ':' || near, ', ' order by full_name)
           from (select * from public.search_directory(profession => 'Nyprofession') offset 2) x),
  'Ny Elsewhere:false, Ny No Place:false', 'then everyone else, not marked near');
select is((select count(*) from public.search_directory(q => 'nyweaving'))::int, 2,
  'with words, only the matches come back');
select is((select bool_or(near) from public.search_directory(q => 'nyweaving')), false,
  'with words, nobody is marked near');

select pg_temp.login('05');
select is((select bool_or(near) from public.search_directory(profession => 'Nyprofession')), false,
  'a reader with no place sees nobody marked near');
select is((select count(*) from public.search_directory(profession => 'Nyprofession'))::int, 4,
  'and still sees everyone');

select * from finish();
rollback;
