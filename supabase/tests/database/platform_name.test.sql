begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

set local role anon;
select results_eq(
  $$select key, value #>> '{}' from public.platform_settings order by key$$,
  $$values ('legal_entity_name', 'Kingdom Connect'), ('platform_name', 'Kingdom Connect')$$,
  'signed-out visitors see the platform and entity names and no other setting'
);
select throws_ok(
  $$update public.platform_settings set value = '"x"' where key = 'platform_name'$$,
  '42501', null, 'signed-out visitors cannot change the platform name'
);
select throws_ok('select * from public.members', '42501', null, 'signed-out visitors still read no member table');
reset role;

update public.platform_settings set value = '"Test Platform"' where key = 'platform_name';
set local role anon;
select is(
  (select value #>> '{}' from public.platform_settings where key = 'platform_name'),
  'Test Platform',
  'the name comes from platform_settings'
);
reset role;

select * from finish();
rollback;
