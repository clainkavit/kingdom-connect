-- D02: the settings a Super Administrator manages in one place (A16): the platform name, the legal entity name, the
-- featured slot limit and the daily application cap, with the legal text versions to read. Matching weights and
-- staff accounts have their own functions (O07, R04). Only a Super Administrator reads or changes these; every
-- change is audit logged with its before and after values by the audit trigger on platform_settings.

-- The settings this screen edits, with what each accepts.
create function private.platform_setting_ok(setting text, new_value jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select case setting
    when 'platform_name' then jsonb_typeof(new_value) = 'string' and char_length(btrim(new_value #>> '{}')) between 2 and 60
    when 'legal_entity_name' then jsonb_typeof(new_value) = 'string' and char_length(btrim(new_value #>> '{}')) between 2 and 120
    when 'featured_slot_limit' then jsonb_typeof(new_value) = 'number' and (new_value #>> '{}') ~ '^([1-9]|1[0-9]|20)$'
    when 'daily_application_cap' then new_value = 'null'::jsonb
      or (jsonb_typeof(new_value) = 'number' and (new_value #>> '{}') ~ '^[1-9][0-9]{0,5}$')
    else false end;
$$;
revoke all on function private.platform_setting_ok(text, jsonb) from public, anon, authenticated;

create function access.platform_settings_list() returns table (key text, value jsonb)
language sql stable security definer set search_path = '' as $$
  select s.key, s.value from public.platform_settings s
  where s.key in ('platform_name', 'legal_entity_name', 'featured_slot_limit', 'daily_application_cap')
    and (select access.is_super_admin())
  order by s.key;
$$;

create function access.set_platform_setting(setting text, new_value jsonb) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  current_value jsonb;
begin
  if not (select access.is_super_admin()) then
    return 'not_super_admin';
  end if;
  select s.value into current_value from public.platform_settings s where s.key = setting;
  if not found or setting not in ('platform_name', 'legal_entity_name', 'featured_slot_limit', 'daily_application_cap') then
    return 'unknown_setting';
  end if;
  if new_value is null or not private.platform_setting_ok(setting, new_value) then
    return 'invalid_value';
  end if;
  if jsonb_typeof(new_value) = 'string' then
    new_value := to_jsonb(btrim(new_value #>> '{}'));
  end if;
  if new_value is not distinct from current_value then
    return 'unchanged';
  end if;
  update public.platform_settings set value = new_value where key = setting;
  return 'ok';
end;
$$;

-- The legal texts with their versions, newest first within each kind, and which one is in force.
create function access.legal_text_versions()
returns table (kind text, version text, approved_at timestamptz, effective_at timestamptz, is_current boolean)
language sql stable security definer set search_path = '' as $$
  select t.kind, t.version, t.approved_at, t.effective_at, t.id = access.current_legal_text_id(t.kind)
  from public.legal_texts t
  where (select access.is_super_admin())
  order by t.kind, string_to_array(t.version, '.')::int[] desc;
$$;

revoke all on function access.platform_settings_list(), access.set_platform_setting(text, jsonb),
  access.legal_text_versions() from public, anon;
grant execute on function access.platform_settings_list(), access.set_platform_setting(text, jsonb),
  access.legal_text_versions() to authenticated;

create function public.platform_settings_list() returns table (key text, value jsonb)
language sql stable security invoker set search_path = '' as $$ select * from access.platform_settings_list(); $$;
create function public.set_platform_setting(setting text, new_value jsonb) returns text
language sql volatile security invoker set search_path = '' as $$ select access.set_platform_setting(setting, new_value); $$;
create function public.legal_text_versions()
returns table (kind text, version text, approved_at timestamptz, effective_at timestamptz, is_current boolean)
language sql stable security invoker set search_path = '' as $$ select * from access.legal_text_versions(); $$;
revoke all on function public.platform_settings_list(), public.set_platform_setting(text, jsonb),
  public.legal_text_versions() from public, anon;
grant execute on function public.platform_settings_list(), public.set_platform_setting(text, jsonb),
  public.legal_text_versions() to authenticated;
