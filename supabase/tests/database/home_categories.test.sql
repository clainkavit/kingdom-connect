begin;
create extension if not exists pgtap with schema extensions;
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(3);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000004901', 'hc01@test.invalid');
insert into public.members (id, username, status, categories)
  values ('00000000-0000-0000-0000-000000004901', 'hc_member', 'approved', array['professional', 'businessperson']);
insert into public.profiles (member_id, full_name) values ('00000000-0000-0000-0000-000000004901', 'Home Member');
insert into public.businesses (member_id, name, sector_id, size, status)
select '00000000-0000-0000-0000-000000004901', 'Home Tailoring', id, 'small', 'pending'
from public.sectors order by name_en limit 1;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000004901',
  'role', 'authenticated', 'otp_verified', true)::text, true);

select is((select categories from public.member_dashboard()), array['professional', 'businessperson'],
  'Home shows the categories the member ticked (U01)');
select is((select business_name from public.member_dashboard()), 'Home Tailoring',
  'and the name of their business, even before it is verified');
select is((select full_name from public.member_dashboard()), 'Home Member', 'and still the welcome name');

select * from finish();
rollback;
