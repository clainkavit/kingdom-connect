begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into public.legal_texts (kind, version, body_en, body_sw, effective_at)
select k, '98.0', 'Test ' || k, 'Jaribio ' || k, now() - interval '1 minute'
from unnest(array['terms', 'privacy']) k;

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000046' || k)::uuid, 'ln' || k || '@test.invalid'
from unnest(array['01', '02', '03', '04', '05', '06', 'a1']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000004601', 'ln_poster', 'approved'),
  ('00000000-0000-0000-0000-000000004602', 'ln_pending', 'pending'),
  ('00000000-0000-0000-0000-000000004603', 'ln_signed_in', 'signed_in'),
  ('00000000-0000-0000-0000-000000004604', 'ln_rejected', 'rejected'),
  ('00000000-0000-0000-0000-000000004605', 'ln_suspended', 'suspended'),
  ('00000000-0000-0000-0000-000000004606', 'ln_new', 'signed_in');
insert into public.profiles (member_id, full_name) values
  ('00000000-0000-0000-0000-000000004601', 'Look Poster');
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000046a1', 'Look Staff', 'admin', true);
insert into public.legal_acceptances (member_id, legal_text_id, context_type)
select ('00000000-0000-0000-0000-0000000046' || who)::uuid, t.id, 'reaccept'
from unnest(array['01', '02', '03', '04', '05']) who
cross join public.legal_texts t where t.version = '98.0';

insert into public.opportunities (id, poster_member_id, type, title, role, employment_type, remote, sector_id,
                                  description, closing_at, status, published_at)
values ('00000000-0000-0000-0046-00000000000a', '00000000-0000-0000-0000-000000004601', 'job', 'LN bookkeeper',
        'Bookkeeper', 'full_time', true, (select id from public.sectors limit 1),
        repeat('Keep the daily sales records for a shop. ', 4), private.tanzania_today() + 20, 'published', now());
insert into public.ideas (id, owner_id, title, problem, sector_id, stage, seeking, status, published_at)
values ('00000000-0000-0000-0046-00000000000b', '00000000-0000-0000-0000-000000004601', 'LN cold storage',
        'Fish traders lose a third of the catch before it sells.', (select id from public.sectors limit 1),
        'idea', 'partner', 'published', now());
insert into public.trainings (poster_member_id, title, provider, format, seats, status, published_at)
values ('00000000-0000-0000-0000-000000004601', 'LN record keeping', 'LN School', 'online', 20, 'published', now());
insert into public.events (poster_member_id, title, starts_at, capacity, link, status, published_at)
values ('00000000-0000-0000-0000-000000004601', 'LN breakfast', now() + interval '5 days', 30,
        'https://example.test/ln', 'published', now());
insert into public.news_items (staff_id, title, body, status, published_at)
values ('00000000-0000-0000-0000-0000000046a1', 'LN news', 'Hello', 'published', now());

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000046' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;

set local role authenticated;

select pg_temp.login('02');
select ok(exists (select 1 from public.opportunity_list() where title = 'LN bookkeeper'),
  'a pending applicant who accepted the terms sees the opportunity list');
select is((select poster_id from public.opportunity_detail('00000000-0000-0000-0046-00000000000a')), null,
  'and the detail, without the poster''s member id');
select is((select poster_name from public.opportunity_detail('00000000-0000-0000-0046-00000000000a')), 'Look Poster',
  'but with the poster''s name');
select ok(exists (select 1 from public.idea_summaries where title = 'LN cold storage' and owner_id is null),
  'idea summaries, without the owner''s member id');
select ok(exists (select 1 from public.trainings_feed() where title = 'LN record keeping')
          and exists (select 1 from public.events_feed() where title = 'LN breakfast'),
  'published training and events');
select ok(exists (select 1 from public.news_items where title = 'LN news'), 'and news');
select ok(exists (select 1 from public.dashboard_latest('all', 20) where title = 'LN bookkeeper'),
  'the latest items on Home');
select is((select count(*)::int from public.profiles) + (select count(*)::int from public.members)
          + (select count(*)::int from public.search_directory()), 0,
  'no profile, member row or directory card');
select throws_ok($$select public.respond_to_opportunity('00000000-0000-0000-0046-00000000000a', 'Hi')$$,
  'not_allowed', 'and cannot apply');
select is((select count(*)::int from public.legal_texts_to_accept()), 0,
  'their own acceptances count, so the terms are not asked again');
select is((select count(*)::int from public.connections) + (select count(*)::int from public.message_threads)
          + (select count(*)::int from public.responses) + (select count(*)::int from public.saved_opportunities), 0,
  'no connections, messages, responses or saved posts');
select throws_ok($$insert into public.saved_opportunities (opportunity_id)
                   values ('00000000-0000-0000-0046-00000000000a')$$, null, null, 'and cannot save a post');
select throws_ok($$select public.register_for_training((select id from public.trainings where title = 'LN record keeping'))$$,
  'not_allowed', 'nor register for training');
select is(public.express_interest('00000000-0000-0000-0046-00000000000b', 'partner', false), 'not_found',
  'nor show interest in an idea');
select is((select link from public.events_feed() where title = 'LN breakfast'), null,
  'and gets no online event link');

select pg_temp.login('03');
select ok(exists (select 1 from public.opportunity_list() where title = 'LN bookkeeper'),
  'a signed-in account that accepted the terms looks too');

select pg_temp.login('04');
select ok(exists (select 1 from public.opportunity_list() where title = 'LN bookkeeper'), 'so does a rejected one');

select pg_temp.login('05');
select is((select count(*)::int from public.opportunity_list()) + (select count(*)::int from public.idea_summaries)
          + (select count(*)::int from public.news_items), 0, 'a suspended account sees nothing');

select pg_temp.login('06');
select is((select count(*)::int from public.opportunity_list()) + (select count(*)::int from public.trainings_feed())
          + (select count(*)::int from public.news_items), 0, 'nor does one that has not accepted the terms');
select is((select count(*)::int from public.legal_texts_to_accept()), 2, 'which is asked to accept both texts');
select lives_ok($$insert into public.legal_acceptances (legal_text_id, context_type)
                  select id, 'reaccept' from public.legal_texts where version = '98.0'$$,
  'and can accept them');
select ok(exists (select 1 from public.opportunity_list() where title = 'LN bookkeeper'),
  'after which it looks too');

select * from finish();
rollback;
