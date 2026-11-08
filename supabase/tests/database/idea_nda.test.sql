begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(26);

insert into public.legal_texts (kind, version, body_en, body_sw, approved_at, effective_at) values
  ('nda', '9.0', 'NDA nine', 'NDA tisa', now(), now() - interval '1 day'),
  ('ip', '9.0', 'IP nine', 'IP tisa', now(), now() - interval '1 day');

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000027' || k)::uuid, 'na' || k || '@test.invalid'
from unnest(array['01', '02', '03', '04']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000002701', 'na_owner', 'approved'),
  ('00000000-0000-0000-0000-000000002702', 'na_requester', 'approved'),
  ('00000000-0000-0000-0000-000000002703', 'na_pending', 'approved'),
  ('00000000-0000-0000-0000-000000002704', 'na_other', 'approved');
insert into public.member_private (member_id, phone, email, language)
select ('00000000-0000-0000-0000-0000000027' || k)::uuid, '+2557120007' || k, 'na' || k || '@test.invalid', 'en'
from unnest(array['01', '02', '03', '04']) k;
insert into public.profiles (member_id, full_name, headline, hidden_from_directory) values
  ('00000000-0000-0000-0000-000000002701', 'Asha Mwita', 'Engineer', true),
  ('00000000-0000-0000-0000-000000002702', 'Neema Joseph', 'Farmer', true),
  ('00000000-0000-0000-0000-000000002703', 'Juma Pending', 'Trader', false),
  ('00000000-0000-0000-0000-000000002704', 'Other Member', 'Teacher', false);
insert into public.verification_requests (member_id, level, status, submitted_at, decided_at)
select ('00000000-0000-0000-0000-0000000027' || k)::uuid, 1, 'approved', now(), now()
from unnest(array['01', '02', '03', '04']) k;
insert into public.ideas (id, owner_id, title, problem, sector_id, stage, seeking, status, published_at)
values ('00000000-0000-0000-0000-00000000e271', '00000000-0000-0000-0000-000000002701', 'Solar dryers',
        'Farmers lose much of their harvest before market.', (select id from public.sectors order by name_en limit 1),
        'prototype', 'both', 'published', now());
insert into public.idea_details (idea_id, description) values
  ('00000000-0000-0000-0000-00000000e271', repeat('Confidential plan. ', 5));
insert into public.idea_access_requests (id, idea_id, requester_id, role, status, decided_at) values
  ('00000000-0000-0000-0000-00000000a271', '00000000-0000-0000-0000-00000000e271',
   '00000000-0000-0000-0000-000000002702', 'partner', 'approved', now()),
  ('00000000-0000-0000-0000-00000000a272', '00000000-0000-0000-0000-00000000e271',
   '00000000-0000-0000-0000-000000002703', 'investor', 'pending', null);

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000027' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
create function pg_temp.approved() returns uuid language sql as $$ select '00000000-0000-0000-0000-00000000a271'::uuid; $$;
create function pg_temp.pending() returns uuid language sql as $$ select '00000000-0000-0000-0000-00000000a272'::uuid; $$;
create function pg_temp.idea() returns uuid language sql as $$ select '00000000-0000-0000-0000-00000000e271'::uuid; $$;
create function pg_temp.texts() returns uuid[] language sql as $$
  select array_agg(id) from public.legal_texts where version = '9.0';
$$;

set local role authenticated;
select pg_temp.login('03');
select is((select count(*)::int from public.idea_terms(pg_temp.pending())), 0,
  'the texts are offered only after approval');
select is(public.accept_idea_terms(pg_temp.pending(), pg_temp.texts()), 'not_approved', 'and cannot be accepted before');

select pg_temp.login('04');
select is(public.accept_idea_terms(pg_temp.approved(), pg_temp.texts()), 'not_found',
  'another member cannot accept for the requester');
select is((select count(*)::int from public.idea_terms(pg_temp.approved())), 0, 'nor read the offer');

select pg_temp.login('02');
select is((select string_agg(kind || ' ' || version || ' ' || body_sw, ',' order by kind)
           from public.idea_terms(pg_temp.approved())),
  'ip 9.0 IP tisa,nda 9.0 NDA tisa', 'the requester gets both texts, in both languages');
select is((select count(*)::int from public.idea_details), 0, 'the details stay closed before acceptance');
select is((select full_name from public.profiles where member_id = '00000000-0000-0000-0000-000000002701'), null,
  'and a hidden owner stays hidden');
select is(public.accept_idea_terms(pg_temp.approved(),
  array[(select id from public.legal_texts where kind = 'nda' and version = '9.0')]), 'texts_changed',
  'both texts must be accepted');
select is(public.accept_idea_terms(pg_temp.approved(), pg_temp.texts()), 'ok', 'the requester accepts both');
select is(public.accept_idea_terms(pg_temp.approved(), pg_temp.texts()), 'already_accepted', 'once');
select is((select status from public.idea_access_requests where id = pg_temp.approved()), 'nda_accepted',
  'the request moves past the NDA');
select is((select count(*)::int from public.idea_details), 1, 'the requester now reads the details');
select is((select full_name from public.profiles where member_id = '00000000-0000-0000-0000-000000002701'),
  'Asha Mwita', 'and sees the owner');
select is((select count(*)::int from public.get_contact_details('00000000-0000-0000-0000-000000002701')), 0,
  'contact details still need a connection');
select lives_ok($$insert into public.messages (thread_id, body)
                  values (public.idea_thread(pg_temp.idea(), '00000000-0000-0000-0000-000000002701'), 'Hello')$$,
  'the requester can message the owner without a connection');
select is((select idea_title from public.my_threads()), 'Solar dryers', 'the thread is labelled with the idea');

reset role;
select is((select count(*)::int from public.legal_acceptances a join public.legal_texts t on t.id = a.legal_text_id
           where a.context_type = 'idea_access' and a.context_id = pg_temp.approved() and t.version = '9.0'
             and a.accepted_at is not null),
  2, 'both acceptances are stored with their version and time');
select is((select count(*)::int from public.notifications where kind = 'I5'
           and member_id in ('00000000-0000-0000-0000-000000002701', '00000000-0000-0000-0000-000000002702')),
  2, 'I5 tells both sides');
select ok((select bool_and(payload ? 'thread_id') from public.notifications where kind = 'I5'), 'with the thread');

-- A new NDA version never changes an acceptance already given.
insert into public.legal_texts (kind, version, body_en, body_sw, approved_at, effective_at)
  values ('nda', '9.1', 'NDA nine one', 'NDA tisa moja', now(), now());
select is((select t.version from public.idea_access_requests r
           join public.legal_acceptances a on a.id = r.nda_acceptance_id
           join public.legal_texts t on t.id = a.legal_text_id where r.id = pg_temp.approved()),
  '9.0', 'a new NDA version leaves the acceptance on the version accepted');
select throws_ok($$update public.legal_acceptances set legal_text_id =
                   (select id from public.legal_texts where kind = 'nda' and version = '9.1')
                   where context_id = '00000000-0000-0000-0000-00000000a271'$$,
  'P0001', null, 'and the acceptance itself can never be changed');
set local role authenticated;
select pg_temp.login('02');
select is((select count(*)::int from public.idea_details), 1, 'the requester keeps access');

select pg_temp.login('01');
select is((select full_name from public.profiles where member_id = '00000000-0000-0000-0000-000000002702'),
  'Neema Joseph', 'the owner sees the requester');
select ok((select can_send from public.thread_details(
  public.idea_thread(pg_temp.idea(), '00000000-0000-0000-0000-000000002702'))), 'and can reply');
select is(public.revoke_idea_access(pg_temp.approved()), 'ok', 'the owner revokes');
select pg_temp.login('02');
select is((select count(*)::int from public.idea_details), 0, 'revoking closes the details at once');

select * from finish();
rollback;
