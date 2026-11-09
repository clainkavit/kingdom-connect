begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(40);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000035' || k)::uuid, 'rs' || k || '@test.invalid'
from unnest(array['01', '02', '03', '04', 'a1']) k;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000003501', 'rs_poster', 'approved'),
  ('00000000-0000-0000-0000-000000003502', 'rs_level1', 'approved'),
  ('00000000-0000-0000-0000-000000003503', 'rs_level2', 'approved'),
  ('00000000-0000-0000-0000-000000003504', 'rs_other', 'approved');
insert into public.member_private (member_id, phone, email, language)
select ('00000000-0000-0000-0000-0000000035' || k)::uuid, '+2557120035' || k, 'rs' || k || '@test.invalid', 'en'
from unnest(array['01', '02', '03', '04']) k;
insert into public.verification_requests (member_id, level, status, submitted_at, decided_at)
select ('00000000-0000-0000-0000-0000000035' || k)::uuid, l, 'approved', now(), now()
from (values ('01', 1), ('01', 2), ('01', 3), ('02', 1), ('03', 1), ('03', 2), ('04', 1)) as x (k, l);
insert into public.profiles (member_id, full_name, hidden_from_directory) values
  ('00000000-0000-0000-0000-000000003501', 'Neema Poster', false),
  ('00000000-0000-0000-0000-000000003502', 'Asha Hidden', true),
  ('00000000-0000-0000-0000-000000003503', 'Juma Level Two', false),
  ('00000000-0000-0000-0000-000000003504', 'Other Member', false);
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-0000000035a1', 'Response Checker', 'admin', true);
select set_config('test.sector', (select id::text from public.sectors order by name_en limit 1), true);
select set_config('test.region', (select id::text from public.regions where name_en = 'Mwanza'), true);
select set_config('test.today', private.tanzania_today()::text, true);

create function pg_temp.add(title text, kind text default 'job', status text default 'published',
                            poster uuid default '00000000-0000-0000-0000-000000003501', closing int default 20)
returns uuid language plpgsql as $$
declare saved uuid;
begin
  insert into public.opportunities (poster_member_id, poster_staff_id, type, title, employment_type, region_id, remote,
                                    sector_id, description, closing_at, status, published_at)
  values (poster, case when poster is null then '00000000-0000-0000-0000-0000000035a1'::uuid end, kind, title,
          case when kind = 'job' then 'full_time' end, current_setting('test.region')::uuid, false,
          current_setting('test.sector')::uuid, repeat('A fair description of the work to do. ', 4),
          current_setting('test.today')::date + closing, status, now())
  returning id into saved;
  return saved;
end $$;
select pg_temp.add('Job A');
select pg_temp.add('Tender T', 'tender');
select pg_temp.add('Partnership P', 'partnership');
select pg_temp.add('Closed C', status => 'closed');
select pg_temp.add('Pending P', status => 'pending_review');
select pg_temp.add('Admin post', 'investment', poster => null);
create temp table ids as select title, id from public.opportunities;
grant select on pg_temp.ids to authenticated;
insert into storage.objects (bucket_id, name, metadata) values
  ('response-files', '00000000-0000-0000-0000-000000003502/00000000-0000-0000-0000-0000000f3501.pdf', '{"size": 1000}'),
  ('response-files', '00000000-0000-0000-0000-000000003503/00000000-0000-0000-0000-0000000f3502.pdf', '{"size": 9000000}');

create function pg_temp.login(who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000035' || who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;
create function pg_temp.opp(title text) returns uuid language sql as $$
  select i.id from pg_temp.ids i where i.title = opp.title;
$$;
create function pg_temp.respond(title text, note text default 'I would like to help with this.', path text default null)
returns text language sql as $$
  select result from public.respond_to_opportunity(pg_temp.opp(title), note, path);
$$;
create function pg_temp.resp(title text, who text) returns uuid language sql as $$
  select r.response_id from public.responses_for_post(pg_temp.opp(title)) r
  where r.member_id = ('00000000-0000-0000-0000-0000000035' || who)::uuid;
$$;

set local role authenticated;
select pg_temp.login('02');
select is(pg_temp.respond('Job A', note => 'Call me on 0712345678 about this.'), 'contact_details', 'a note with a phone number is refused');
select is(pg_temp.respond('Job A', path => '00000000-0000-0000-0000-000000003503/00000000-0000-0000-0000-0000000f3502.pdf'),
  'invalid_attachment', 'an attachment must be in the member''s own folder');
select is(pg_temp.respond('Job A', path => '00000000-0000-0000-0000-000000003502/00000000-0000-0000-0000-0000000f3999.pdf'),
  'invalid_attachment', 'and must exist');
select is(pg_temp.respond('Job A', path => '00000000-0000-0000-0000-000000003502/00000000-0000-0000-0000-0000000f3501.pdf'),
  'ok', 'a member applies to a job with a CV');
select is(pg_temp.respond('Job A'), 'already_responded', 'only once');
select is(pg_temp.respond('Tender T'), 'level2_required', 'a Level 1 member cannot respond to a tender');
select is(pg_temp.respond('Closed C'), 'not_open', 'nor to a closed post');
select is(pg_temp.respond('Pending P'), 'not_open', 'nor to one still in review');
select is(pg_temp.respond('Partnership P', note => ''), 'ok', 'interest in a partnership needs no note');
select is((select string_agg(kind, ',' order by kind) from public.my_responses()), 'application,interest',
  'a job gets an application and the other types an expression of interest');
select throws_ok($$insert into public.responses (opportunity_id, member_id, kind) values (pg_temp.opp('Admin post'), pg_temp.opp('Admin post'), 'interest')$$,
  '42501', null, 'responses are not written directly');

select pg_temp.login('03');
select is(pg_temp.respond('Tender T'), 'ok', 'a Level 2 member expresses interest in a tender');
select is(pg_temp.respond('Admin post'), 'ok', 'and in an admin post');
select is((select count(*)::int from public.responses), 2, 'a member reads only their own responses');
select is((select count(*)::int from public.responses_for_post(pg_temp.opp('Job A'))), 0, 'and no responses to another''s post');

select pg_temp.login('01');
select is(pg_temp.respond('Job A'), 'own_post', 'a poster cannot respond to their own post');
select is((select count(*)::int from public.responses_for_post(pg_temp.opp('Job A'))), 1, 'the poster sees the responses to their post');
select is((select count(*)::int from public.responses), 3, 'across all their posts');
select is((select string_agg(member_name, ',' order by member_name) from public.responses_for_post(pg_temp.opp('Tender T'))),
  'Juma Level Two', 'with the responder''s name');
select is((select count(*)::int from storage.objects where bucket_id = 'response-files'), 1, 'and opens the attachments sent to them');
select is((select count(*)::int from public.profiles where member_id = '00000000-0000-0000-0000-000000003502'), 1,
  'the poster reads a responder''s hidden profile while the response is open');

select pg_temp.login('04');
select is((select count(*)::int from public.responses), 0, 'another member sees no responses');
select is((select count(*)::int from public.responses_for_post(pg_temp.opp('Job A'))), 0, 'nor through the function');
select is((select count(*)::int from storage.objects where bucket_id = 'response-files'), 0, 'nor their attachments');
select is(public.set_response_status(pg_temp.resp('Job A', '02'), 'shortlisted'), 'not_found', 'nor change a status');
select is((select count(*)::int from public.profiles where member_id = '00000000-0000-0000-0000-000000003502'), 0,
  'and the hidden profile stays hidden from them');

select pg_temp.login('01');
select is(public.set_response_status(pg_temp.resp('Job A', '02'), 'withdrawn'), 'invalid_status', 'a poster only shortlists or declines');
select is(public.set_response_status(pg_temp.resp('Job A', '02'), 'shortlisted'), 'ok', 'the poster shortlists');
select is(public.set_response_status(pg_temp.resp('Job A', '02'), 'shortlisted'), 'not_allowed', 'once');
select ok(access.can_send(public.opportunity_thread(pg_temp.opp('Job A'), '00000000-0000-0000-0000-000000003502')),
  'the poster can message a shortlisted member');

select pg_temp.login('02');
select is((select status from public.my_response(pg_temp.opp('Job A'))), 'shortlisted', 'the member sees the same status');
select is(public.withdraw_response((select response_id from public.my_response(pg_temp.opp('Job A')))), 'not_allowed',
  'and can no longer withdraw');
select is(public.withdraw_response((select response_id from public.my_response(pg_temp.opp('Partnership P')))), 'ok',
  'a New response can be withdrawn');

select pg_temp.login('01');
select is(public.set_response_status(pg_temp.resp('Job A', '02'), 'declined'), 'ok', 'the poster declines');
select ok(not access.can_send(public.opportunity_thread(pg_temp.opp('Job A'), '00000000-0000-0000-0000-000000003502')),
  'the thread closes to sending');
select is((select count(*)::int from public.profiles where member_id = '00000000-0000-0000-0000-000000003502'), 0,
  'and the hidden profile closes again');

select pg_temp.login('a1');
select is((select count(*)::int from public.responses_for_post(pg_temp.opp('Admin post'))), 1, 'staff read the responses to an admin post');

reset role;
select is((select string_agg(kind, ',' order by kind) from public.notifications
           where member_id = '00000000-0000-0000-0000-000000003501'), 'O1,O2,O2',
  'O1 and O2 told the poster of each response');
select is((select string_agg(kind, ',' order by kind) from public.notifications
           where member_id = '00000000-0000-0000-0000-000000003502' and kind in ('O3', 'O4')), 'O3,O4',
  'O3 and O4 told the member');

set local role anon;
select throws_ok($$select * from public.my_responses()$$, '42501', null, 'a signed-out visitor cannot read responses');

select * from finish();
rollback;
