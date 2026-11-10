begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(10);

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000050' || k)::uuid, 'sc' || k || '@test.invalid' from unnest(array['01', '02', '03', '04']) k;
insert into public.members (id, username, status)
select ('00000000-0000-0000-0000-0000000050' || k)::uuid, 'sc_' || k, 'pending' from unnest(array['01', '02', '03']) k;
insert into public.members (id, username, status, category)
  values ('00000000-0000-0000-0000-000000005004', 'sc_04', 'approved', 'entrepreneur');
insert into public.member_private (member_id, email, phone)
select ('00000000-0000-0000-0000-0000000050' || k)::uuid, 'sc' || k || '@test.invalid', '+2557000050' || k
from unnest(array['01', '02', '03']) k;
do $$ begin
  perform private.set_identity(('00000000-0000-0000-0000-0000000050' || k)::uuid, 'nida', '1990010150' || k || '000000' || k)
  from unnest(array['01', '02', '03']) k;
end $$;
insert into storage.objects (bucket_id, name)
select 'identity-documents', '00000000-0000-0000-0000-0000000050' || k || '/' || f
from unnest(array['01', '02', '03']) k, unnest(array['face', 'id']) f;

create temp table place as
  select d.id as district_id, d.region_id from public.districts d order by d.id limit 1;
create function pg_temp.draft(who text, extra jsonb) returns void language sql as $$
  insert into public.registration_drafts (member_id, data)
  select ('00000000-0000-0000-0000-0000000050' || who)::uuid,
         jsonb_build_object('fullName', 'Applicant ' || who, 'address', 'Plot ' || who, 'regionId', region_id,
                            'districtId', district_id, 'acceptTerms', true, 'acceptPrivacy', true) || extra
  from place
  on conflict (member_id) do update set data = excluded.data;
$$;

select pg_temp.draft('01', jsonb_build_object('categories', jsonb_build_array('professional', 'businessperson'),
  'categoryDetails', jsonb_build_object('profession', 'Accountant', 'businessName', 'Neema Tailoring')));
select is(private.submit_registration('00000000-0000-0000-0000-000000005001'), 'ok', 'an applicant ticks two categories');
select is((select categories from public.members where id = '00000000-0000-0000-0000-000000005001'),
  array['businessperson', 'professional'], 'both are kept');
select is((select category from public.members where id = '00000000-0000-0000-0000-000000005001'), 'businessperson',
  'and the single category column holds the first, for the screens that still read one');

select pg_temp.draft('02', jsonb_build_object('category', 'other', 'categoryDetails', jsonb_build_object('description', 'Farmer')));
select is(private.submit_registration('00000000-0000-0000-0000-000000005002'), 'ok', 'a draft saved with one category still works');
select is((select categories from public.members where id = '00000000-0000-0000-0000-000000005002'), array['other'],
  'and becomes a list of one');

select pg_temp.draft('03', jsonb_build_object('categories', jsonb_build_array('entrepreneur')));
select is(private.submit_registration('00000000-0000-0000-0000-000000005003'), 'incomplete',
  'Entrepreneur is no longer offered to a new registration');
select pg_temp.draft('03', jsonb_build_object('categories', jsonb_build_array()));
select is(private.submit_registration('00000000-0000-0000-0000-000000005003'), 'incomplete', 'and at least one category is needed');

select is((select categories from public.members where id = '00000000-0000-0000-0000-000000005004'), array['entrepreneur'],
  'a member who registered as an Entrepreneur keeps it');
update public.members set status = 'deleted' where id = '00000000-0000-0000-0000-000000005004';
select is((select coalesce(array_length(categories, 1), 0)::text || ':' || coalesce(category, 'none') from public.members
           where id = '00000000-0000-0000-0000-000000005004'), '0:none', 'deleting the account clears the categories');
select throws_ok($$update public.members set categories = array['investor'] where id = '00000000-0000-0000-0000-000000005001'$$,
  '23514', null, 'the investor flag is never a category');

select * from finish();
rollback;
