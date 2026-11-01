create extension if not exists citext with schema extensions;

create function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create table public.regions (
  id uuid primary key default gen_random_uuid(),
  name_en text not null unique,
  name_sw text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.districts (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.regions (id),
  name_en text not null,
  name_sw text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (region_id, name_en),
  unique (id, region_id)
);

create table public.sectors (
  id uuid primary key default gen_random_uuid(),
  name_en text not null unique,
  name_sw text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  name extensions.citext not null unique check (name::text = lower(btrim(name::text)) and name::text <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.skill_synonyms (
  id uuid primary key default gen_random_uuid(),
  from_name extensions.citext not null unique check (from_name::text = lower(btrim(from_name::text)) and from_name::text <> ''),
  skill_id uuid not null references public.skills (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platform_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (key, value) values
  ('featured_slot_limit', '5'),
  ('daily_application_cap', 'null');

create table public.members (
  id uuid primary key references auth.users (id),
  username extensions.citext not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'suspended', 'deactivated', 'deleted')),
  category text check (category in ('professional', 'businessperson', 'entrepreneur', 'other')),
  resubmissions_used int not null default 0 check (resubmissions_used >= 0),
  posting_suspended_until timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.staff (
  id uuid primary key references auth.users (id),
  full_name text not null,
  role text not null check (role in ('admin', 'super_admin')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function private.member_or_staff_not_both() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (tg_table_name = 'members' and exists (select 1 from public.staff s where s.id = new.id))
     or (tg_table_name = 'staff' and exists (select 1 from public.members m where m.id = new.id)) then
    raise exception 'account % is already a %', new.id,
      case tg_table_name when 'members' then 'staff account' else 'member' end
      using errcode = '23505';
  end if;
  return new;
end $$;
create trigger member_or_staff_not_both before insert on public.members
  for each row execute function private.member_or_staff_not_both();
create trigger member_or_staff_not_both before insert on public.staff
  for each row execute function private.member_or_staff_not_both();

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null unique references public.members (id) on delete cascade,
  full_name text,
  headline text,
  bio text,
  photo_path text,
  region_id uuid references public.regions (id),
  district_id uuid,
  profession text,
  experience text,
  certifications text,
  study_institution text,
  study_course text,
  study_year int check (study_year between 1 and 10),
  hidden_from_directory boolean not null default false,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (district_id, region_id) references public.districts (id, region_id)
);

create table public.profile_skills (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles (member_id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, skill_id)
);

create table public.member_private (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null unique references public.members (id) on delete cascade,
  email text not null,
  phone text not null check (phone ~ '^\+255[0-9]{9}$'),
  address text,
  id_type text check (id_type in ('nida', 'passport', 'driving_licence', 'voters_id')),
  id_encrypted bytea,
  id_fingerprint bytea,
  id_expires_on date,
  share_phone boolean not null default false,
  share_email boolean not null default false,
  share_address boolean not null default false,
  language text not null default 'en' check (language in ('en', 'sw')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id_type, id_fingerprint),
  check (id_fingerprint is null or id_type is not null)
);

create table public.investor_flags (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  granted_by uuid not null references public.staff (id),
  route text not null check (route in ('invitation', 'application')),
  sector_focus uuid references public.sectors (id),
  ticket_band text check (ticket_band in ('under_10m', '10m_to_50m', 'over_50m')),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index investor_flags_one_live on public.investor_flags (member_id) where revoked_at is null;

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  member_a uuid not null references public.members (id),
  member_b uuid not null references public.members (id),
  connected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (member_a < member_b),
  unique (member_a, member_b)
);
create index connections_member_b on public.connections (member_b);

create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.members (id),
  blocked_id uuid not null references public.members (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (blocker_id <> blocked_id),
  unique (blocker_id, blocked_id)
);
create index blocks_blocked_id on public.blocks (blocked_id);

create table public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id),
  level int not null check (level between 1 and 3),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  reviewer_id uuid references public.staff (id),
  reason text,
  duplicate_suspected_of uuid references public.members (id),
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index verification_requests_member on public.verification_requests (member_id, status);

do $$
declare t text;
begin
  foreach t in array array['regions', 'districts', 'sectors', 'skills', 'skill_synonyms', 'platform_settings',
    'members', 'staff', 'profiles', 'profile_skills', 'member_private', 'investor_flags',
    'connections', 'blocks', 'verification_requests']
  loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', t);
  end loop;
end $$;
