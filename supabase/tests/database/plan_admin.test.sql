begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(13);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000033' || k)::uuid, 'pa' || k || '@test.invalid'
from unnest(array['01', '02', 'a1']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000003301', 'pa_owner', 'approved'),
  ('00000000-0000-0000-0000-000000003302', 'pa_investor', 'approved');
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000033a1', 'Plan Desk', 'admin', true);
insert into public.member_private (member_id, phone, email, language) values
  ('00000000-0000-0000-0000-000000003301', '+255712001301', 'secret-owner@test.invalid', 'en'),
  ('00000000-0000-0000-0000-000000003302', '+255712001302', 'secret-investor@test.invalid', 'en');
insert into public.profiles (member_id, full_name) values
  ('00000000-0000-0000-0000-000000003301', 'Asha Mwita'),
  ('00000000-0000-0000-0000-000000003302', 'Baraka Mtaji');
insert into public.investor_flags (member_id, granted_by, route, ticket_band)
  values ('00000000-0000-0000-0000-000000003302', '00000000-0000-0000-0000-0000000033a1', 'invitation', 'over_50m');
insert into public.ideas (id, owner_id, title, problem, sector_id, stage, seeking, status, published_at) values
  ('00000000-0000-0000-0000-00000000e331', '00000000-0000-0000-0000-000000003301', 'Solar dryers',
   'Farmers lose much of their harvest before market.', (select id from public.sectors order by name_en limit 1),
   'prototype', 'both', 'published', now());
insert into public.milestone_plans (id, member_a, member_b, idea_id, started_by, status, stage1_agreed_at, ended_by,
                                    ended_at, ended_reason) values
  ('00000000-0000-0000-0000-0000000a3301', '00000000-0000-0000-0000-000000003301',
   '00000000-0000-0000-0000-000000003302', '00000000-0000-0000-0000-00000000e331',
   '00000000-0000-0000-0000-000000003302', 'ended', now() - interval '3 days', '00000000-0000-0000-0000-000000003302',
   now() - interval '1 day', 'The funding fell through');
insert into public.milestones (plan_id, position, title, responsible_member_id, status, confirmed_at) values
  ('00000000-0000-0000-0000-0000000a3301', 1, 'Agreed in principle', '00000000-0000-0000-0000-000000003302',
   'confirmed', now()),
  ('00000000-0000-0000-0000-0000000a3301', 2, 'First investment', '00000000-0000-0000-0000-000000003302', 'open', null);

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000033' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
create function pg_temp.plan() returns uuid language sql as $$ select '00000000-0000-0000-0000-0000000a3301'::uuid; $$;

set local role authenticated;
select pg_temp.login('01');
select is((select count(*)::int from public.admin_plans()), 0, 'members never get the admin view');
select is(public.annotate_plan(pg_temp.plan(), 'A note'), 'not_staff', 'nor annotate');
select is((select count(*)::int from public.admin_plan_notes(pg_temp.plan())), 0, 'nor read notes');

select pg_temp.login('a1');
select is((select member_a_name || ' & ' || member_b_name || ' · ' || item_title || ' · ' || status || ' · '
                  || confirmed || '/' || milestones
           from public.admin_plans() where plan_id = pg_temp.plan()),
  'Asha Mwita & Baraka Mtaji · Solar dryers · ended · 1/2', 'staff see names, the idea, status and progress');
select is((select string_agg(stage_no || ' ' || status || ' ' || responsible_name, ',' order by stage_no)
           from public.admin_plan_stages(pg_temp.plan())),
  '1 confirmed Baraka Mtaji,2 open Baraka Mtaji', 'and every stage with who is responsible');
select is(public.annotate_plan(pg_temp.plan(), 'x'), 'invalid_note', 'an annotation needs some text');
select is(public.annotate_plan(pg_temp.plan(), 'Both members called; nothing further.'), 'ok', 'staff annotate');
select is((select string_agg(kind || ': ' || note, ' | ' order by created_at) from public.admin_plan_notes(pg_temp.plan())),
  'ended: The funding fell through | annotation: Both members called; nothing further.',
  'the notes show the reason it ended and the annotations');
select ok(not exists (
  select 1 from (select row_to_json(p)::text as t from public.admin_plans() p
                 union all select row_to_json(s)::text from public.admin_plan_stages(pg_temp.plan()) s
                 union all select row_to_json(n)::text from public.admin_plan_notes(pg_temp.plan()) n) all_rows
  where t ~* '(\+?255712|secret-|@test\.invalid)'), 'no contact details appear');
select ok(not exists (
  select 1 from information_schema.parameters
  where specific_schema = 'public' and parameter_mode in ('OUT', 'INOUT')
    and specific_name ~ '^(admin_plans|admin_plan_stages|admin_plan_notes)_'
    and (parameter_name ~* '(investor|ticket|band|phone|email)')), 'nor the investor flag');
select throws_ok($$update public.plan_annotations set note = 'Changed'$$, '42501', null, 'staff cannot edit an annotation');

reset role;
select throws_ok($$delete from public.plan_annotations$$, 'P0001', null, 'nobody deletes an annotation');
select throws_ok($$update public.plan_annotations set note = 'Changed'$$, 'P0001', null, 'or changes one');

select * from finish();
rollback;
