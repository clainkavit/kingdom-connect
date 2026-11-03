begin;
create extension if not exists pgtap with schema extensions;
-- Members here have accepted the current legal texts; that rule is tested in legal_on_server.test.sql.
create or replace function access.accepted_terms_and_privacy() returns boolean language sql stable as 'select true';
select plan(7);

select has_schema('private', 'the private schema exists');
select ok(not has_schema_privilege('anon', 'private', 'usage'), 'signed-out visitors cannot use the private schema');
select ok(not has_schema_privilege('authenticated', 'private', 'usage'), 'signed-in users cannot use the private schema');
select ok(has_schema_privilege('service_role', 'private', 'usage'), 'Edge Functions (service_role) can use the private schema');

create table private.pgtap_probe (id int);
select ok(not has_table_privilege('anon', 'private.pgtap_probe', 'select'), 'a new private table grants nothing to signed-out visitors');
select ok(not has_table_privilege('authenticated', 'private.pgtap_probe', 'select'), 'a new private table grants nothing to signed-in users');

set local role authenticated;
select throws_ok('select * from private.pgtap_probe', '42501', null, 'a signed-in user reading a private table is refused');
reset role;

select * from finish();
rollback;
