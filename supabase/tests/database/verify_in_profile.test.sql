begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into public.legal_texts (kind, version, body_en, body_sw, effective_at)
select k, '96.0', 'Test ' || k, 'Jaribio ' || k, now() - interval '1 minute'
from unnest(array['terms', 'privacy']) k;

insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000048' || k)::uuid, 'vp' || k || '@test.invalid'
from unnest(array['01', '02', '03', '04', '05', '06']) k;
insert into public.members (id, username, status, created_at) values
  ('00000000-0000-0000-0000-000000004801', 'vp_ready', 'signed_in', now() - interval '1 day'),
  ('00000000-0000-0000-0000-000000004802', 'vp_unaccepted', 'signed_in', now() - interval '1 day'),
  ('00000000-0000-0000-0000-000000004803', 'vp_quiet', 'signed_in', now() - interval '4 days'),
  ('00000000-0000-0000-0000-000000004804', 'vp_new', 'signed_in', now() - interval '1 day'),
  ('00000000-0000-0000-0000-000000004805', 'vp_quiet_email', 'pending', now() - interval '5 days'),
  ('00000000-0000-0000-0000-000000004806', 'vp_long_ago', 'signed_in', now() - interval '30 days');
insert into public.member_private (member_id, email)
select ('00000000-0000-0000-0000-0000000048' || k)::uuid, 'vp' || k || '@test.invalid'
from unnest(array['01', '02', '03', '04', '05', '06']) k;
insert into public.legal_acceptances (member_id, legal_text_id, context_type)
select ('00000000-0000-0000-0000-0000000048' || who)::uuid, t.id, 'registration'
from unnest(array['01', '03', '04', '05']) who cross join public.legal_texts t where t.version = '96.0';

create function pg_temp.ready(who text) returns void language plpgsql as $$
begin
  perform private.set_identity(('00000000-0000-0000-0000-0000000048' || who)::uuid, 'passport', 'VP48' || who);
  insert into storage.objects (bucket_id, name) values
    ('identity-documents', '00000000-0000-0000-0000-0000000048' || who || '/face'),
    ('identity-documents', '00000000-0000-0000-0000-0000000048' || who || '/id');
  insert into public.registration_drafts (member_id, step, data)
  select ('00000000-0000-0000-0000-0000000048' || who)::uuid, 6, jsonb_build_object(
    'fullName', 'Verify Person', 'categories', jsonb_build_array('other'), 'address', 'Plot 4',
    'regionId', d.region_id, 'districtId', d.id, 'categoryDetails', jsonb_build_object('description', 'Tailor'),
    'idType', 'passport', 'identitySaved', true, 'facePhoto', true, 'idPhoto', true)
  from public.districts d limit 1;
end $$;

select pg_temp.ready('01');
select pg_temp.ready('02');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000004801',
  'role', 'authenticated', 'otp_verified', true)::text, true);
select ok(public.my_phone_missing(), 'an account made with Google has no phone yet, so About you asks for one');
reset role;

select is(private.submit_registration('00000000-0000-0000-0000-000000004801'), 'missing_phone',
  'it cannot send the steps without a phone');
update public.registration_drafts set data = data || '{"phone": "0712 345 678"}'
where member_id = '00000000-0000-0000-0000-000000004801';
select is(private.submit_registration('00000000-0000-0000-0000-000000004801'), 'ok',
  'with one it sends, with no ticks in the draft: the terms were accepted when the account was made');
select is((select phone from public.member_private where member_id = '00000000-0000-0000-0000-000000004801'),
  '+255712345678', 'the phone is kept in the +255 form');
select is((select count(*)::int from public.legal_acceptances
           where member_id = '00000000-0000-0000-0000-000000004801'), 2,
  'sending records no new acceptance of the terms');
select is((select status from public.members where id = '00000000-0000-0000-0000-000000004801'), 'pending',
  'sending makes the account pending');
select is((select approved_at from public.members where id = '00000000-0000-0000-0000-000000004801'), null,
  'and nothing else: it is not approved');
select is((select count(*)::int from public.verification_requests
           where member_id = '00000000-0000-0000-0000-000000004801' and status = 'pending'), 1,
  'one application waits in the queue for A02 and A03');
update public.registration_drafts set data = data || '{"phone": "+255712345679"}'
where member_id = '00000000-0000-0000-0000-000000004802';
select is(private.submit_registration('00000000-0000-0000-0000-000000004802'), 'legal_not_accepted',
  'an account that has not accepted the current terms cannot send');

select is(private.remind_unfinished_verification(now()), 2,
  'the daily job reminds the two accounts that got in 3 to 7 days ago and sent nothing');
select is((select array_agg(m.username::text order by m.username) from public.notifications n
           join public.members m on m.id = n.member_id where n.kind = 'A8'),
  array['vp_quiet', 'vp_quiet_email'],
  'not a newer account, one that already sent the steps, or one that got in long before the reminder existed');
select is(private.remind_unfinished_verification(now() + interval '1 day'), 0, 'and only once');
select is((select count(*)::int from public.notifications where kind = 'A8'), 2, 'so each gets one reminder');

select * from finish();
rollback;
