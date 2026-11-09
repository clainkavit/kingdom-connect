begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(21);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000036' || k)::uuid, 'ft' || k || '@test.invalid'
from unnest(array['01', '02', 'a1']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000003601', 'ft_poster', 'approved'),
  ('00000000-0000-0000-0000-000000003602', 'ft_reader', 'approved');
insert into public.member_private (member_id, phone, email, language)
select ('00000000-0000-0000-0000-0000000036' || k)::uuid, '+2557120036' || k, 'ft' || k || '@test.invalid', 'en'
from unnest(array['01', '02']) k;
insert into public.verification_requests (member_id, level, status, submitted_at, decided_at)
select ('00000000-0000-0000-0000-0000000036' || k)::uuid, 1, 'approved', now(), now() from unnest(array['01', '02']) k;
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000036a1', 'Feature Checker', 'admin', true);
select set_config('test.sector', (select id::text from public.sectors order by name_en limit 1), true);
select set_config('test.region', (select id::text from public.regions where name_en = 'Mwanza'), true);
select set_config('test.today', private.tanzania_today()::text, true);

create function pg_temp.add(title text, status text default 'published', closing int default 20)
returns uuid language plpgsql as $$
declare saved uuid;
begin
  insert into public.opportunities (poster_member_id, type, title, employment_type, region_id, remote, sector_id,
                                    description, closing_at, status, published_at)
  values ('00000000-0000-0000-0000-000000003601', 'job', title, 'full_time', current_setting('test.region')::uuid, false,
          current_setting('test.sector')::uuid, repeat('A fair description of the work to do. ', 4),
          current_setting('test.today')::date + closing, status, now())
  returning id into saved;
  return saved;
end $$;
select pg_temp.add('Post ' || n) from generate_series(1, 7) n;
select pg_temp.add('Draft post', 'draft');
select pg_temp.add('Late post', closing => -1);
create temp table ids as select title, id from public.opportunities;
grant select on pg_temp.ids to authenticated;

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000036' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
create function pg_temp.feature(title text, on_off boolean default true) returns text language sql as $$
  select public.set_opportunity_featured((select i.id from pg_temp.ids i where i.title = feature.title), on_off);
$$;

set local role authenticated;
select pg_temp.login('02');
select is(pg_temp.feature('Post 1'), 'not_staff', 'a member cannot feature a post');
select is((select count(*)::int from public.featured_slots()), 0, 'nor read the slots');

select pg_temp.login('a1');
select is((select row(used, slot_limit)::text from public.featured_slots()), '(0,5)', 'five slots, none used');
select is(pg_temp.feature('Draft post'), 'not_published', 'a draft cannot be featured');
select is(pg_temp.feature('Late post'), 'not_published', 'nor a post past its closing date');
select is(pg_temp.feature('Post 1') || pg_temp.feature('Post 2') || pg_temp.feature('Post 3') || pg_temp.feature('Post 4')
          || pg_temp.feature('Post 5'), 'okokokokok', 'staff feature five posts');
select is(pg_temp.feature('Post 1'), 'already_featured', 'one post only once');
select is(pg_temp.feature('Post 6'), 'slots_full', 'a sixth is refused');
select is((select row(used, slot_limit)::text from public.featured_slots()), '(5,5)', 'the slot count shows all used');
select is((select count(*)::int from public.admin_featured()), 5, 'the featured list has five');
select is((select count(*)::int from public.featurable_opportunities()), 2, 'two published posts remain to pick from');
select is((select count(*)::int from public.featurable_opportunities('post 7')), 1, 'narrowed by a word of the title');

select is(pg_temp.feature('Post 2', false), 'ok', 'staff remove one');
select is(pg_temp.feature('Post 2', false), 'not_featured', 'once');
select is(pg_temp.feature('Post 6'), 'ok', 'which frees a slot');

reset role;
update public.opportunities set status = 'closed' where title = 'Post 3';
select is((select featured_at is null from public.opportunities where title = 'Post 3'), true,
  'a post that closes stops being featured');
select is(private.featured_in_use(), 4, 'and frees its slot');
update public.platform_settings set value = '2' where key = 'featured_slot_limit';
select is(private.featured_in_use(), 4, 'lowering the limit leaves the current picks in place');
set local role authenticated;
select pg_temp.login('a1');
select is(pg_temp.feature('Post 7'), 'slots_full', 'but no more can be added');

select pg_temp.login('02');
select is((select featured from public.opportunity_list() where title = 'Post 1'), true, 'members see the featured flag in the list');
select is((select featured from public.opportunity_list() limit 1), true, 'and featured posts come first');

select * from finish();
rollback;
