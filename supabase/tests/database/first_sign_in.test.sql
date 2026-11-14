begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into public.legal_texts (kind, version, body_en, body_sw, effective_at)
select k, '97.0', 'Test ' || k, 'Jaribio ' || k, now() - interval '1 minute'
from unnest(array['terms', 'privacy']) k;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000004701', 'neema.joseph@example.test'),
  ('00000000-0000-0000-0000-000000004702', 'taken@example.test'),
  ('00000000-0000-0000-0000-000000004703', 'second@example.test'),
  ('00000000-0000-0000-0000-000000004704', 'staff.google@example.test'),
  ('00000000-0000-0000-0000-000000004705', 'clash@example.test');
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000004702', 'neema.joseph', 'approved');
insert into public.member_private (member_id, email, phone)
  values ('00000000-0000-0000-0000-000000004702', 'clash@example.test', '+255712004702');
insert into public.staff (id, full_name, role, active)
  values ('00000000-0000-0000-0000-000000004704', 'Google Staff', 'admin', true);

create function pg_temp.login(who text, verified boolean default true) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-0000-0000-0000000047' || who, 'role', 'authenticated', 'otp_verified', verified)::text, true);
$$;
create function pg_temp.texts() returns uuid[] language sql as $$
  select array_agg(id) from public.legal_texts where version = '97.0';
$$;

select is((private.custom_access_token_hook(json_build_object(
  'user_id', '00000000-0000-0000-0000-000000004701',
  'claims', json_build_object('amr', json_build_array(json_build_object('method', 'oauth'))))::jsonb)
  -> 'claims' ->> 'otp_verified'), 'true', 'a Google session counts as verified: the provider is the second step');
select is((private.custom_access_token_hook(json_build_object(
  'user_id', '00000000-0000-0000-0000-000000004701',
  'claims', json_build_object('amr', json_build_array(json_build_object('method', 'password'))))::jsonb)
  -> 'claims' ->> 'otp_verified'), 'false', 'a password session still needs the email code');
select is((private.custom_access_token_hook(json_build_object(
  'user_id', '00000000-0000-0000-0000-000000004704',
  'claims', json_build_object('amr', json_build_array(json_build_object('method', 'oauth'))))::jsonb)
  -> 'claims' ->> 'otp_verified'), 'false', 'a staff account signing in through Google still needs the email code');
select is((private.custom_access_token_hook(json_build_object(
  'user_id', '00000000-0000-0000-0000-000000004701', 'claims', '{}'::json)::jsonb)
  -> 'claims' ->> 'user_status'), 'none', 'someone new from Google has no account yet');

set local role authenticated;

select pg_temp.login('01');
select ok(not access.can_read_listings(), 'before First sign-in, someone new reads nothing');
select is(public.suggest_username(), 'neema.joseph1', 'the suggestion comes from the email and is free');
select is(public.complete_first_sign_in('neema.joseph', pg_temp.texts()), 'username_taken', 'a taken username is refused');
select is(public.complete_first_sign_in('No', pg_temp.texts()), 'username_invalid',
  'a username outside the sign-up rules is refused');
select is(public.complete_first_sign_in('neema.joseph1', (pg_temp.texts())[1:1]), 'texts_missing',
  'both texts must be accepted');
select is(public.complete_first_sign_in('Neema.Joseph1', pg_temp.texts()), 'ok', 'then the account is made');
select is(public.complete_first_sign_in('neema.joseph2', pg_temp.texts()), 'already_done', 'only once');
select ok(access.can_look(), 'after it, with both texts accepted, they look around');

select pg_temp.login('05');
select is(public.complete_first_sign_in('clash.one', pg_temp.texts()), 'email_taken',
  'an email that already has an account never makes a second one');
select pg_temp.login('01');

reset role;
select is((select status from public.members where id = '00000000-0000-0000-0000-000000004701'), 'signed_in',
  'as a signed-in account that looks but does not act');
select is((select username::text from public.members where id = '00000000-0000-0000-0000-000000004701'),
  'neema.joseph1', 'with the username lowercased');
select is((select email || coalesce(phone, '-') from public.member_private
           where member_id = '00000000-0000-0000-0000-000000004701'), 'neema.joseph@example.test-',
  'the email from Google and no phone yet');
select is((select count(*)::int from public.legal_acceptances
           where member_id = '00000000-0000-0000-0000-000000004701'), 2, 'and both texts recorded as accepted');

select is(private.application_status('00000000-0000-0000-0000-000000004701') ->> 'state', 'drafting',
  'a signed-in account is still writing its verification steps');
select is(private.set_identity('00000000-0000-0000-0000-000000004701', 'passport', 'FS4701'), 'ok',
  'it saves its ID like an applicant');
insert into storage.objects (bucket_id, name) values
  ('identity-documents', '00000000-0000-0000-0000-000000004701/face'),
  ('identity-documents', '00000000-0000-0000-0000-000000004701/id');
insert into public.registration_drafts (member_id, step, data)
select '00000000-0000-0000-0000-000000004701', 6, jsonb_build_object(
  'fullName', 'Neema Joseph', 'categories', jsonb_build_array('other'), 'address', 'Plot 9',
  'regionId', d.region_id, 'districtId', d.id, 'categoryDetails', jsonb_build_object('description', 'Tailor'),
  'idType', 'passport', 'identitySaved', true, 'facePhoto', true, 'idPhoto', true,
  'phone', '0712 004 701')
from public.districts d limit 1;
select is(private.submit_registration('00000000-0000-0000-0000-000000004701'), 'ok', 'it can send them');
select is((select status from public.members where id = '00000000-0000-0000-0000-000000004701'), 'pending',
  'which makes it pending, waiting for review');

set local role authenticated;
select pg_temp.login('03', false);
select is(public.complete_first_sign_in('second.one', pg_temp.texts()), 'not_allowed',
  'a session that is not verified cannot make an account');

select * from finish();
rollback;
