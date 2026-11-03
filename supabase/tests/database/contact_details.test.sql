begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(15);

create temp table owners as
select n, ('00000000-0000-0000-0001-' || lpad(n::text, 12, '0'))::uuid as id,
       (n & 1) > 0 as share_phone, (n & 2) > 0 as share_email, (n & 4) > 0 as share_address,
       (n & 8) > 0 as connected, n >> 4 as block
from generate_series(0, 47) n;
grant select on owners to authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000201', 'cd01@test.invalid'),
  ('00000000-0000-0000-0000-000000000202', 'cd02@test.invalid'),
  ('00000000-0000-0000-0000-000000000203', 'cd03@test.invalid'),
  ('00000000-0000-0000-0000-000000000204', 'cd04@test.invalid');
insert into auth.users (id, email) select id, 'cdo' || n || '@test.invalid' from owners;
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-000000000201', 'cd_me', 'approved'),
  ('00000000-0000-0000-0000-000000000202', 'cd_hidden', 'approved'),
  ('00000000-0000-0000-0000-000000000203', 'cd_suspended', 'suspended'),
  ('00000000-0000-0000-0000-000000000204', 'cd_stranger', 'approved');
insert into public.members (id, username, status) select id, 'cd_owner_' || n, 'approved' from owners;
insert into public.member_private (member_id, email, phone, address, share_phone, share_email, share_address)
select id, 'cdo' || n || '@test.invalid', '+255710' || lpad(n::text, 6, '0'), 'Plot ' || n || ', Test Street',
       share_phone, share_email, share_address
from owners;
insert into public.member_private (member_id, email, phone, address, share_phone, share_email, share_address) values
  ('00000000-0000-0000-0000-000000000201', 'cd01@test.invalid', '+255700000201', 'Plot 201', true, true, true),
  ('00000000-0000-0000-0000-000000000202', 'cd02@test.invalid', '+255700000202', 'Plot 202', true, false, false),
  ('00000000-0000-0000-0000-000000000203', 'cd03@test.invalid', '+255700000203', 'Plot 203', true, true, true);
insert into public.profiles (member_id, full_name, hidden_from_directory)
  values ('00000000-0000-0000-0000-000000000202', 'Hidden Friend', true);
insert into public.connections (member_a, member_b)
select least(m, o.id), greatest(m, o.id)
from owners o, (values ('00000000-0000-0000-0000-000000000201'::uuid)) v (m) where o.connected
union all
select '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000202'
union all
select '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000203';
insert into public.blocks (blocker_id, blocked_id)
select case when block = 1 then '00000000-0000-0000-0000-000000000201'::uuid else id end,
       case when block = 1 then id else '00000000-0000-0000-0000-000000000201'::uuid end
from owners where block > 0;

select throws_ok($$insert into public.member_private (member_id, email, phone)
  values ('00000000-0000-0000-0000-000000000204', 'cd04@test.invalid', '0711111111')$$, '23514', null,
  'a phone number must start with +255');

create function pg_temp.login(who uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', who, 'role', 'authenticated', 'otp_verified', true)::text, true);
$$;

set local role authenticated;
select pg_temp.login('00000000-0000-0000-0000-000000000201');

select is((select count(*)::int from owners o
           where (select row(c.phone, c.email, c.address) from public.get_contact_details(o.id) c)
                 is distinct from
                 (case when o.connected and o.block = 0 then
                    row(case when o.share_phone then '+255710' || lpad(o.n::text, 6, '0') end,
                        case when o.share_email then 'cdo' || o.n || '@test.invalid' end,
                        case when o.share_address then 'Plot ' || o.n || ', Test Street' end)
                  end)), 0,
  'every combination of connection, block either way and the three switches returns exactly what is allowed');

select is((select row(phone, email, address)::text from public.get_contact_details(
             (select id from owners where connected and block = 0 and share_phone and share_email and share_address))),
          row('+255710000015', 'cdo15@test.invalid', 'Plot 15, Test Street')::text,
  'a connection sees every field the owner shares');
select is((select row(phone, email, address)::text from public.get_contact_details(
             (select id from owners where connected and block = 0 and share_phone and not share_email and not share_address))),
          row('+255710000009', null::text, null::text)::text,
  'a connection sees only the fields that are switched on');
select is((select count(*)::int from public.get_contact_details(
             (select id from owners where connected and block = 0 and not share_phone and not share_email and not share_address)
           ) where coalesce(phone, email, address) is not null), 0,
  'with every switch off, a connection sees nothing (the default)');
select is((select count(*)::int from public.get_contact_details(
             (select id from owners where not connected and block = 0 and share_phone and share_email and share_address))), 0,
  'a member who is not a connection sees nothing, even with every switch on');
select is((select count(*)::int from public.get_contact_details(
             (select id from owners where connected and block = 1 and share_phone and share_email and share_address))), 0,
  'blocking a connection hides their details from you');
select is((select count(*)::int from public.get_contact_details(
             (select id from owners where connected and block = 2 and share_phone and share_email and share_address))), 0,
  'a connection who blocked you shares nothing with you');
select is((select phone from public.get_contact_details('00000000-0000-0000-0000-000000000202')), '+255700000202',
  'a hidden profile still shares with its connections');
select is((select count(*)::int from public.get_contact_details('00000000-0000-0000-0000-000000000203')), 0,
  'a suspended connection shares nothing');
select is((select count(*)::int from public.get_contact_details('00000000-0000-0000-0000-000000000201')), 0,
  'you read your own details from your own row, not through this function');

select pg_temp.login('00000000-0000-0000-0000-000000000203');
select is((select count(*)::int from public.get_contact_details('00000000-0000-0000-0000-000000000201')), 0,
  'a suspended member reads nothing, even from a connection who shares');

select pg_temp.login('00000000-0000-0000-0000-000000000201');
select throws_ok($$update public.member_private set phone = '+255711111111'
  where member_id = '00000000-0000-0000-0000-000000000201'$$, '42501', null,
  'a member cannot change their own phone');
select throws_ok($$update public.member_private set email = 'x@test.invalid', address = 'x'
  where member_id = '00000000-0000-0000-0000-000000000201'$$, '42501', null,
  'a member cannot change their own email or address');

reset role;
set local role anon;
select throws_ok($$select * from public.get_contact_details('00000000-0000-0000-0000-000000000201')$$, '42501', null,
  'a visitor cannot call it');

select * from finish();
rollback;

