create table public.legal_texts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('terms', 'privacy', 'nda', 'ip', 'handoff')),
  version text not null check (version ~ '^[0-9]+\.[0-9]+$'),
  body_en text not null,
  body_sw text not null,
  approved_at timestamptz,
  effective_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, version)
);
create trigger set_updated_at before update on public.legal_texts
  for each row execute function private.set_updated_at();

create function access.request_ip() returns inet
language plpgsql stable set search_path = '' as $$
declare hops text[];
begin
  hops := string_to_array(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',');
  return nullif(trim(hops[array_length(hops, 1)]), '')::inet;
exception when others then
  return null;
end $$;
grant execute on function access.request_ip() to authenticated, service_role;

create table public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null default auth.uid() references public.members (id),
  legal_text_id uuid not null references public.legal_texts (id),
  accepted_at timestamptz not null default now(),
  ip_address inet default access.request_ip(),
  context_type text not null check (context_type in ('registration', 'reaccept', 'idea_access', 'plan')),
  context_id uuid,
  created_at timestamptz not null default now(),
  unique nulls not distinct (member_id, legal_text_id, context_type, context_id)
);

create function private.legal_acceptance_is_final() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'a legal acceptance is never changed: % is not allowed', lower(tg_op);
end $$;
create trigger never_changed before update or delete on public.legal_acceptances
  for each row execute function private.legal_acceptance_is_final();

create function access.current_legal_text_id(text_kind text) returns uuid
language sql stable set search_path = '' as $$
  select id from public.legal_texts
  where kind = text_kind and effective_at <= now()
  order by string_to_array(version, '.')::int[] desc
  limit 1;
$$;
grant execute on function access.current_legal_text_id(text) to authenticated, service_role;

create function private.accept_current_text_only() returns trigger
language plpgsql set search_path = '' as $$
declare text_kind text;
begin
  select kind into text_kind from public.legal_texts where id = new.legal_text_id;
  if new.legal_text_id is distinct from access.current_legal_text_id(text_kind) then
    raise exception 'only the current % text can be accepted', text_kind;
  end if;
  new.accepted_at := now();
  return new;
end $$;
create trigger accept_current_text_only before insert on public.legal_acceptances
  for each row execute function private.accept_current_text_only();

revoke all on public.legal_texts, public.legal_acceptances from anon, authenticated;
grant select on public.legal_texts to anon, authenticated;
grant insert (kind, version, body_en, body_sw, approved_at, effective_at) on public.legal_texts to authenticated;
grant select on public.legal_acceptances to authenticated;
grant insert (legal_text_id, context_type, context_id) on public.legal_acceptances to authenticated;

alter table public.legal_texts enable row level security;
alter table public.legal_acceptances enable row level security;

create policy "base rule: signed in to read" on public.legal_texts as restrictive for select to authenticated
  using ((select auth.uid()) is not null);
create policy "base rule: super admin to write" on public.legal_texts as restrictive for insert to authenticated
  with check ((select access.is_super_admin()));
create policy "everyone signed in" on public.legal_texts for select to authenticated using (true);
create policy "terms and privacy in effect, for visitors" on public.legal_texts for select to anon
  using (kind in ('terms', 'privacy') and effective_at <= now());
create policy "super admin loads" on public.legal_texts for insert to authenticated
  with check ((select access.is_super_admin()));

create policy "base rule" on public.legal_acceptances as restrictive for all to authenticated
  using ((select access.is_member()) or (select access.is_staff()))
  with check ((select access.is_member()) or (select access.is_staff()));
create policy "own or staff" on public.legal_acceptances for select to authenticated
  using (member_id = (select auth.uid()) or (select access.is_staff()));
create policy "own re-acceptance" on public.legal_acceptances for insert to authenticated
  with check (member_id = (select auth.uid()) and context_type = 'reaccept' and context_id is null);

create function public.legal_texts_to_accept()
returns table (id uuid, kind text, version text, body_en text, body_sw text, approved_at timestamptz)
language sql stable set search_path = '' as $$
  select t.id, t.kind, t.version, t.body_en, t.body_sw, t.approved_at
  from public.legal_texts t
  where t.kind in ('terms', 'privacy')
    and t.id = access.current_legal_text_id(t.kind)
    and not exists (select 1 from public.legal_acceptances a
                    where a.legal_text_id = t.id and a.member_id = (select auth.uid()));
$$;
revoke all on function public.legal_texts_to_accept() from public, anon;
grant execute on function public.legal_texts_to_accept() to authenticated;

create function private.legal_texts_ready() returns boolean
language sql stable set search_path = '' as $$
  select count(*) = 5 from (
    select distinct on (kind) kind, version, approved_at
    from public.legal_texts
    where effective_at <= now()
    order by kind, string_to_array(version, '.')::int[] desc
  ) current_texts
  where (string_to_array(version, '.')::int[])[1] >= 1 and approved_at is not null;
$$;

create function private.guard_real_registrations() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.key = 'real_registrations_open' and new.value is distinct from 'false'::jsonb
     and not private.legal_texts_ready() then
    raise exception 'real registrations stay closed until all five legal texts are approved at version 1.0';
  end if;
  return new;
end $$;
create trigger guard_real_registrations before insert or update on public.platform_settings
  for each row execute function private.guard_real_registrations();

create function private.guard_new_legal_text() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.legal_texts t
             where t.kind = new.kind
               and string_to_array(t.version, '.')::int[] < string_to_array(new.version, '.')::int[]
               and t.effective_at > new.effective_at) then
    raise exception 'version % of % cannot take effect before an earlier version', new.version, new.kind;
  end if;
  if (select value from public.platform_settings where key = 'real_registrations_open') is distinct from 'false'::jsonb
     and ((string_to_array(new.version, '.')::int[])[1] < 1 or new.approved_at is null) then
    raise exception 'real registrations are open: only an approved version 1.0 or later can be loaded';
  end if;
  return new;
end $$;
create trigger guard_new_legal_text before insert on public.legal_texts
  for each row execute function private.guard_new_legal_text();

insert into public.platform_settings (key, value) values
  ('real_registrations_open', 'false'),
  ('legal_entity_name', '"Kingdom Connect"')
on conflict (key) do nothing;

drop policy "the platform name, for visitors" on public.platform_settings;
create policy "the platform and entity names, for visitors" on public.platform_settings for select to anon
  using (key in ('platform_name', 'legal_entity_name'));
