-- Login internals and the audit log live here (docs/schema.md section 1).
-- App users (anon, authenticated) must never reach it; only database functions and Edge Functions do.
create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

alter default privileges in schema private revoke all on tables from public, anon, authenticated;
alter default privileges in schema private revoke all on sequences from public, anon, authenticated;
alter default privileges in schema private revoke all on functions from public, anon, authenticated;
