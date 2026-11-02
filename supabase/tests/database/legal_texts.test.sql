begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

select has_table('public', 'legal_texts', 'legal_texts exists');
select has_table('public', 'legal_acceptances', 'legal_acceptances exists');

delete from public.legal_texts;
insert into public.legal_texts (kind, version, body_en, body_sw, effective_at) values
  ('terms', '0.1', 'Terms 0.1', 'Masharti 0.1', now() - interval '2 days'),
  ('privacy', '0.1', 'Privacy 0.1', 'Faragha 0.1', now() - interval '2 days'),
  ('nda', '0.1', 'NDA 0.1', 'NDA 0.1 sw', now() - interval '2 days'),
  ('ip', '0.1', 'IP 0.1', 'IP 0.1 sw', now() - interval '2 days'),
  ('handoff', '0.1', 'Handoff 0.1', 'Handoff 0.1 sw', now() - interval '2 days');

select throws_ok(
  $$insert into public.legal_texts (kind, version, body_en, body_sw) values ('terms', 'v2', 'x', 'y')$$,
  '23514', null, 'a version is written as major.minor'
);
select throws_ok(
  $$insert into public.legal_texts (kind, version, body_en, body_sw) values ('terms', '0.1', 'x', 'y')$$,
  '23505', null, 'a version is loaded once'
);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'reader@test.invalid'),
  ('00000000-0000-0000-0000-0000000000c2', 'other@test.invalid'),
  ('00000000-0000-0000-0000-0000000000c3', 'super@test.invalid');
insert into public.members (id, username, status) values
  ('00000000-0000-0000-0000-0000000000c1', 'legal_reader', 'approved'),
  ('00000000-0000-0000-0000-0000000000c2', 'legal_other', 'approved');
insert into public.staff (id, full_name, role) values ('00000000-0000-0000-0000-0000000000c3', 'Legal Super', 'super_admin');

set local role anon;
select results_eq(
  $$select kind from public.legal_texts order by kind$$,
  $$values ('privacy'), ('terms')$$,
  'signed-out visitors read the terms and privacy notice only'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated", "otp_verified": true}', true);
select is((select count(*)::int from public.legal_texts), 5, 'a member reads all five texts');
select results_eq(
  $$select kind from public.legal_texts_to_accept() order by kind$$,
  $$values ('privacy'), ('terms')$$,
  'a member who accepted nothing owes the terms and privacy notice'
);
select lives_ok(
  $$insert into public.legal_acceptances (legal_text_id, context_type)
    select id, 'reaccept' from public.legal_texts where kind in ('terms', 'privacy')$$,
  'a member accepts the current terms and privacy notice'
);
select is((select count(*)::int from public.legal_texts_to_accept()), 0, 'then owes nothing');
select is(
  (select member_id from public.legal_acceptances limit 1),
  '00000000-0000-0000-0000-0000000000c1'::uuid,
  'the acceptance is recorded for the caller'
);
select throws_ok(
  $$insert into public.legal_acceptances (member_id, legal_text_id, context_type)
    select '00000000-0000-0000-0000-0000000000c2', id, 'reaccept' from public.legal_texts where kind = 'terms'$$,
  '42501', null, 'a member cannot accept for someone else'
);
select throws_ok(
  $$insert into public.legal_acceptances (legal_text_id, context_type)
    select id, 'reaccept' from public.legal_texts where kind = 'terms'$$,
  '23505', null, 'the same acceptance is recorded once'
);
select throws_ok(
  $$insert into public.legal_acceptances (legal_text_id, context_type, context_id)
    select id, 'idea_access', '00000000-0000-0000-0000-000000000999' from public.legal_texts where kind = 'nda'$$,
  '42501', null, 'a member cannot record an NDA acceptance directly'
);
select throws_ok(
  $$update public.legal_acceptances set accepted_at = now() - interval '1 year'$$,
  '42501', null, 'an acceptance can never be edited'
);
select throws_ok(
  $$delete from public.legal_acceptances$$,
  '42501', null, 'an acceptance can never be deleted'
);
select throws_ok(
  $$insert into public.legal_texts (kind, version, body_en, body_sw) values ('terms', '9.9', 'x', 'y')$$,
  '42501', null, 'a member cannot load a text'
);
reset role;

insert into public.legal_texts (kind, version, body_en, body_sw, effective_at) values
  ('terms', '0.2', 'Terms 0.2', 'Masharti 0.2', now() - interval '1 day');
set local role authenticated;
select results_eq(
  $$select kind, version from public.legal_texts_to_accept()$$,
  $$values ('terms'::text, '0.2'::text)$$,
  'a new terms version must be accepted again'
);
select throws_ok(
  $$insert into public.legal_acceptances (legal_text_id, context_type)
    select id, 'reaccept' from public.legal_texts where kind = 'terms' and version = '0.1'$$,
  'P0001', null, 'an old version can no longer be accepted'
);
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000c2", "role": "authenticated", "otp_verified": true}', true);
select is((select count(*)::int from public.legal_acceptances), 0, 'a member never sees someone else''s acceptances');
reset role;

select throws_ok(
  $$insert into public.legal_texts (kind, version, body_en, body_sw, effective_at) values
    ('terms', '0.4', 'Terms 0.4', 'Masharti 0.4', now() - interval '3 days')$$,
  'P0001', null, 'a newer version cannot take effect before an older one'
);
insert into public.legal_texts (kind, version, body_en, body_sw, effective_at) values
  ('terms', '0.3', 'Terms 0.3', 'Masharti 0.3', now() + interval '7 days');
set local role anon;
select is((select max(version) from public.legal_texts where kind = 'terms'), '0.2',
  'visitors see only texts already in effect');
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated", "otp_verified": true}', true);
select is(
  (select version from public.legal_texts_to_accept() where kind = 'terms'), '0.2',
  'a version takes effect only on its date'
);
reset role;
delete from public.legal_texts where kind = 'terms' and version = '0.3';

select is(private.legal_texts_ready(), false, 'drafts are not ready for launch');
select throws_ok(
  $$update public.platform_settings set value = 'true' where key = 'real_registrations_open'$$,
  'P0001', null, 'real registrations cannot open while any text is a draft'
);
select throws_ok(
  $$update public.platform_settings set value = '"true"' where key = 'real_registrations_open'$$,
  'P0001', null, 'nor with any value other than false'
);

insert into public.legal_texts (kind, version, body_en, body_sw, approved_at, effective_at)
select kind, '1.0', 'Approved', 'Imeidhinishwa', now(), now() - interval '1 hour'
from unnest(array['terms', 'privacy', 'nda', 'ip']) kind;
select is(private.legal_texts_ready(), false, 'four approved texts are not enough');
insert into public.legal_texts (kind, version, body_en, body_sw, approved_at, effective_at)
  values ('handoff', '1.0', 'Approved', 'Imeidhinishwa', now(), now() - interval '1 hour');
select is(private.legal_texts_ready(), true, 'all five approved at 1.0 are ready');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000000c3", "role": "authenticated", "otp_verified": true}', true);
select lives_ok(
  $$update public.platform_settings set value = 'true' where key = 'real_registrations_open'$$,
  'a Super Administrator opens real registrations once all five are ready'
);
reset role;
select is(
  (select value #>> '{}' from public.platform_settings where key = 'real_registrations_open'), 'true',
  'real registrations are open'
);
select throws_ok(
  $$insert into public.legal_texts (kind, version, body_en, body_sw) values ('terms', '1.1', 'Draft', 'Rasimu')$$,
  'P0001', null, 'once open, an unapproved version cannot be loaded'
);

select * from finish();
rollback;
