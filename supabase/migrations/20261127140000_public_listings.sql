-- O19: public listings. Tenders and jobs read once a day from public sources wait here for staff review; an approved
-- listing becomes an ordinary staff post (the approving Administrator is its poster) that links back to the source.

create table public.public_listing_sources (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9_]{2,30}$'),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  kind text not null check (kind in ('tenders', 'jobs')),
  page_url text not null check (page_url ~ '^https://'),
  active boolean not null default true,
  last_run_at timestamptz,
  last_found int,
  last_error text check (char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.public_listing_sources
  for each row execute function private.set_updated_at();

insert into public.public_listing_sources (key, name, kind, page_url) values
  ('nest', 'NeST', 'tenders', 'https://nest.go.tz/tenders/published-tenders'),
  ('ajira', 'Ajira Portal', 'jobs', 'https://portal.ajira.go.tz/vacancies'),
  ('crdb', 'CRDB Bank', 'jobs', 'https://careers.crdbbank.co.tz/jobs'),
  ('ajira_adverts', 'Ajira adverts', 'jobs', 'https://www.ajira.go.tz/archive?type=vacancies');

create table public.public_listings (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.public_listing_sources (id),
  external_id text not null check (char_length(external_id) between 1 and 120),
  title text not null check (char_length(btrim(title)) between 1 and 300),
  employer text check (char_length(employer) <= 200),
  summary text check (char_length(summary) <= 500),
  details jsonb not null default '{}',
  original_url text not null check (original_url ~ '^https://'),
  language text not null default 'en' check (language in ('en', 'sw')),
  opens_on date,
  closing_on date,
  closing_time time,
  fee_note text check (char_length(fee_note) <= 300),
  suggested_region_id uuid references public.regions (id),
  suggested_district_id uuid references public.districts (id),
  suggested_sector_id uuid references public.sectors (id),
  translated_title text check (char_length(translated_title) <= 300),
  translated_summary text check (char_length(translated_summary) <= 500),
  status text not null default 'waiting' check (status in ('waiting', 'approved', 'discarded')),
  opportunity_id uuid unique references public.opportunities (id),
  decided_by uuid references public.staff (id),
  decided_at timestamptz,
  last_seen_at timestamptz not null default now(),
  gone_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, external_id),
  check ((status = 'approved') = (opportunity_id is not null))
);
create index public_listings_waiting on public.public_listings (created_at desc) where status = 'waiting';
create trigger set_updated_at before update on public.public_listings
  for each row execute function private.set_updated_at();

alter table public.public_listing_sources enable row level security;
alter table public.public_listings enable row level security;
create policy "staff read" on public.public_listing_sources for select to authenticated
  using ((select access.is_staff()));
create policy "staff read" on public.public_listings for select to authenticated
  using ((select access.is_staff()));
revoke insert, update, delete on public.public_listing_sources, public.public_listings from anon, authenticated;

-- The import (an Edge Function on the service role) saves one listing. A listing seen again keeps the staff's
-- choices; a waiting one takes the source's newer text and dates.
create function private.save_public_listing(source_key text, listing jsonb) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  src public.public_listing_sources;
  region uuid;
  district uuid;
  sector uuid;
  saved uuid;
begin
  select * into src from public.public_listing_sources s where s.key = save_public_listing.source_key;
  if not found then
    raise exception 'unknown_source';
  end if;
  select r.id into region from public.regions r
  where lower(r.name_en) = lower(btrim(listing ->> 'region')) or lower(r.name_sw) = lower(btrim(listing ->> 'region'))
  limit 1;
  select d.id into district from public.districts d
  where (region is null or d.region_id = region)
    and (lower(d.name_en) = lower(btrim(listing ->> 'district')) or lower(d.name_sw) = lower(btrim(listing ->> 'district')))
  limit 1;
  if region is null and district is not null then
    select d.region_id into region from public.districts d where d.id = district;
  end if;
  select s.id into sector from public.sectors s where s.name_en = listing ->> 'sector' limit 1;

  insert into public.public_listings as l (source_id, external_id, title, employer, summary, details, original_url,
                                           language, opens_on, closing_on, closing_time, fee_note,
                                           suggested_region_id, suggested_district_id, suggested_sector_id,
                                           translated_title, translated_summary)
  values (src.id, listing ->> 'external_id', left(btrim(listing ->> 'title'), 300),
          left(nullif(btrim(listing ->> 'employer'), ''), 200), left(nullif(btrim(listing ->> 'summary'), ''), 500),
          coalesce(listing -> 'details', '{}'), listing ->> 'original_url', coalesce(listing ->> 'language', 'en'),
          (listing ->> 'opens_on')::date, (listing ->> 'closing_on')::date, (listing ->> 'closing_time')::time,
          left(nullif(btrim(listing ->> 'fee_note'), ''), 300), region, district, sector,
          left(nullif(btrim(listing ->> 'translated_title'), ''), 300),
          left(nullif(btrim(listing ->> 'translated_summary'), ''), 500))
  on conflict (source_id, external_id) do update
    set last_seen_at = now(), gone_at = null,
        title = case when l.status = 'waiting' then excluded.title else l.title end,
        summary = case when l.status = 'waiting' then excluded.summary else l.summary end,
        details = case when l.status = 'waiting' then excluded.details else l.details end,
        closing_on = case when l.status = 'waiting' then excluded.closing_on else l.closing_on end,
        closing_time = case when l.status = 'waiting' then excluded.closing_time else l.closing_time end,
        translated_title = coalesce(l.translated_title, excluded.translated_title),
        translated_summary = coalesce(l.translated_summary, excluded.translated_summary)
  returning l.id into saved;
  return saved;
end;
$$;

-- The listings already saved from one advert (external ids that start with it), so a PDF is read only once.
create function private.public_listing_ids(source_key text, prefix text) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(l.external_id), '{}') from public.public_listings l
  join public.public_listing_sources s on s.id = l.source_id
  where s.key = public_listing_ids.source_key and starts_with(l.external_id, public_listing_ids.prefix);
$$;

-- Whether a listing is already known with a translation, so the import does not translate it again.
create function private.public_listing_translated(source_key text, external_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.public_listings l join public.public_listing_sources s on s.id = l.source_id
                 where s.key = public_listing_translated.source_key and l.external_id = public_listing_translated.external_id
                   and l.translated_title is not null);
$$;

-- After a run: the source's last run, what it found or why it failed. When a run succeeds, listings the source no
-- longer shows are marked gone, and a published post made from one closes.
create function private.finish_public_listing_run(source_key text, seen text[], failure text default null,
                                                   mark_gone boolean default true)
returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  src public.public_listing_sources;
  closed int := 0;
begin
  select * into src from public.public_listing_sources s where s.key = finish_public_listing_run.source_key;
  if not found then
    raise exception 'unknown_source';
  end if;
  update public.public_listing_sources
  set last_run_at = now(), last_error = left(failure, 500),
      last_found = case when failure is null then cardinality(seen) else last_found end
  where id = src.id;
  if failure is null and finish_public_listing_run.mark_gone then
    update public.public_listings
    set gone_at = now()
    where source_id = src.id and gone_at is null and not (external_id = any (seen));
    with gone as (
      update public.opportunities o set status = 'closed', closed_at = now()
      from public.public_listings l
      where l.source_id = src.id and l.gone_at is not null and l.opportunity_id = o.id and o.status = 'published'
      returning o.id)
    select count(*) into closed from gone;
  end if;
  insert into private.audit_log (action, target_type, target_id, after)
  values ('public_listings.imported', 'public_listing_sources', src.id,
          jsonb_build_object('source', src.name, 'found', cardinality(seen), 'closed', closed, 'error', failure));
  return closed;
end;
$$;

revoke all on function private.save_public_listing(text, jsonb), private.public_listing_translated(text, text),
  private.public_listing_ids(text, text), private.finish_public_listing_run(text, text[], text, boolean)
  from public, anon, authenticated;

-- Staff approve a waiting listing: it becomes a published post by the approving Administrator. Staff set the place,
-- sector, skills, closing date and, for a job, the employment type, and may correct the translation and fee note.
create function access.approve_public_listing(listing uuid, region uuid, district uuid, remote boolean, sector uuid,
                                              skills uuid[] default '{}', closing date default null,
                                              employment_type text default null, translated_title text default null,
                                              translated_summary text default null, fee_note text default null)
returns table (result text, opportunity_id uuid)
language plpgsql volatile security definer set search_path = '' as $$
declare
  item public.public_listings;
  src public.public_listing_sources;
  kind text;
  closes date;
  body text;
  made uuid;
begin
  if not (select access.is_staff()) then
    return query select 'not_staff', null::uuid;
    return;
  end if;
  select * into item from public.public_listings l where l.id = approve_public_listing.listing for update;
  if not found then
    return query select 'not_found', null::uuid;
    return;
  end if;
  if item.status <> 'waiting' then
    return query select 'already_decided', null::uuid;
    return;
  end if;
  select * into src from public.public_listing_sources s where s.id = item.source_id;
  kind := case when src.kind = 'tenders' then 'tender' else 'job' end;
  closes := coalesce(approve_public_listing.closing, item.closing_on);
  if closes is null or closes < private.tanzania_today() then
    return query select 'closing_date', null::uuid;
    return;
  end if;
  if approve_public_listing.sector is null
     or (not coalesce(approve_public_listing.remote, false) and approve_public_listing.region is null) then
    return query select 'place_and_sector', null::uuid;
    return;
  end if;
  if kind = 'job' and coalesce(approve_public_listing.employment_type, '')
                      not in ('full_time', 'part_time', 'contract', 'internship') then
    return query select 'employment_type', null::uuid;
    return;
  end if;

  body := concat_ws(E'\n',
    btrim(item.title),
    nullif(btrim(coalesce(approve_public_listing.translated_title, item.translated_title, '')), ''),
    nullif(btrim(coalesce(item.summary, '')), ''),
    nullif(btrim(coalesce(approve_public_listing.translated_summary, item.translated_summary, '')), ''),
    case when item.employer is not null then item.employer end,
    case when item.details ->> 'reference_no' is not null then 'Ref: ' || (item.details ->> 'reference_no') end,
    case when item.details ->> 'posts' is not null then 'Posts / Nafasi: ' || (item.details ->> 'posts') end,
    nullif(btrim(coalesce(approve_public_listing.fee_note, item.fee_note, '')), ''),
    'Public listing from ' || src.name || '. Read the full notice and apply on the official site. '
      || 'Tangazo la umma kutoka ' || src.name || '. Soma tangazo kamili na uombe kwenye tovuti rasmi.');

  insert into public.opportunities (poster_staff_id, type, title, employment_type, region_id, district_id, remote,
                                    sector_id, description, closing_at, no_fee_declared, status, reviewed_by,
                                    approved_at, published_at)
  values (auth.uid(), kind, left(btrim(item.title), 120),
          case when kind = 'job' then approve_public_listing.employment_type end,
          approve_public_listing.region, approve_public_listing.district, coalesce(approve_public_listing.remote, false),
          approve_public_listing.sector, left(body, 5000), closes, false, 'published', auth.uid(), now(), now())
  returning id into made;
  if kind = 'tender' then
    insert into public.tender_details (opportunity_id, issuing_org, reference_no, scope, closing_time)
    values (made, left(coalesce(item.employer, src.name), 120),
            left(coalesce(item.details ->> 'reference_no', item.external_id), 60),
            left(btrim(item.title), 3000), coalesce(item.closing_time, time '17:00'));
  end if;
  insert into public.opportunity_skills (opportunity_id, skill_id)
  select made, s from unnest(coalesce(approve_public_listing.skills, '{}')) s
  on conflict do nothing;

  update public.public_listings l
  set status = 'approved', opportunity_id = made, decided_by = auth.uid(), decided_at = now(),
      translated_title = coalesce(nullif(btrim(approve_public_listing.translated_title), ''), l.translated_title),
      translated_summary = coalesce(nullif(btrim(approve_public_listing.translated_summary), ''), l.translated_summary),
      fee_note = coalesce(nullif(btrim(approve_public_listing.fee_note), ''), l.fee_note)
  where l.id = item.id;
  insert into private.audit_log (actor_staff_id, action, target_type, target_id, before, after, ip_address)
  values (auth.uid(), 'public_listing.approved', 'public_listings', item.id, jsonb_build_object('status', 'waiting'),
          jsonb_build_object('status', 'approved', 'opportunity_id', made, 'source', src.name, 'title', item.title),
          private.request_ip());
  return query select 'ok', made;
end;
$$;

create function access.discard_public_listing(listing uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  item public.public_listings;
begin
  if not (select access.is_staff()) then
    return 'not_staff';
  end if;
  select * into item from public.public_listings l where l.id = discard_public_listing.listing for update;
  if not found then
    return 'not_found';
  end if;
  if item.status <> 'waiting' then
    return 'already_decided';
  end if;
  update public.public_listings set status = 'discarded', decided_by = auth.uid(), decided_at = now()
  where id = item.id;
  insert into private.audit_log (actor_staff_id, action, target_type, target_id, before, after, ip_address)
  values (auth.uid(), 'public_listing.discarded', 'public_listings', item.id, jsonb_build_object('status', 'waiting'),
          jsonb_build_object('status', 'discarded', 'title', item.title), private.request_ip());
  return 'ok';
end;
$$;

revoke all on function access.approve_public_listing(uuid, uuid, uuid, boolean, uuid, uuid[], date, text, text, text, text),
  access.discard_public_listing(uuid) from public, anon;
grant execute on function access.approve_public_listing(uuid, uuid, uuid, boolean, uuid, uuid[], date, text, text, text, text),
  access.discard_public_listing(uuid) to authenticated;

create function public.approve_public_listing(listing uuid, region uuid, district uuid, remote boolean, sector uuid,
                                              skills uuid[] default '{}', closing date default null,
                                              employment_type text default null, translated_title text default null,
                                              translated_summary text default null, fee_note text default null)
returns table (result text, opportunity_id uuid)
language sql volatile security invoker set search_path = '' as $$
  select * from access.approve_public_listing(listing, region, district, remote, sector, skills, closing,
                                              employment_type, translated_title, translated_summary, fee_note);
$$;
create function public.discard_public_listing(listing uuid) returns text
language sql volatile security invoker set search_path = '' as $$ select access.discard_public_listing(listing); $$;
revoke all on function public.approve_public_listing(uuid, uuid, uuid, boolean, uuid, uuid[], date, text, text, text, text),
  public.discard_public_listing(uuid) from public, anon;
grant execute on function public.approve_public_listing(uuid, uuid, uuid, boolean, uuid, uuid[], date, text, text, text, text),
  public.discard_public_listing(uuid) to authenticated;

-- The audit log: public listings are opportunities, and each daily import run is a routine system entry.
create or replace function access.audit_kind(action text) returns text
language sql immutable set search_path = '' as $$
  select case
    when head in ('members', 'member', 'member_private', 'profiles', 'application', 'registration', 'id',
                  'recovery', 'email_recoveries') then 'people'
    when head = 'investor_flags' then 'investors'
    when head in ('business', 'businesses') then 'business'
    when head in ('opportunity', 'opportunities', 'picks', 'pick_requests', 'responses', 'tenders',
                  'public_listing', 'public_listings') then 'opportunities'
    when head in ('ideas', 'idea_details', 'idea_access_requests', 'idea_views', 'milestones', 'milestone_plans',
                  'plan_documents') then 'ideas'
    when head in ('trainings', 'training_materials', 'registrations', 'events') then 'training'
    when head in ('reports', 'moderation_actions', 'security_alerts') then 'moderation'
    when head in ('staff', 'login', 'password') then 'staff'
    when head in ('platform_settings', 'matching_settings', 'skill_synonyms') then 'settings'
    else 'other'
  end
  from (select split_part(audit_kind.action, '.', 1) as head) h;
$$;

create or replace function access.audit_routine(actor_staff_id uuid, actor_member_id uuid, target_type text,
                                                row_values jsonb)
returns boolean
language sql immutable set search_path = '' as $$
  select actor_staff_id is null and actor_member_id is null
         and ((target_type = 'platform_settings' and coalesce(row_values ->> 'key', '') like '%\_last\_run')
              or target_type = 'public_listing_sources');
$$;

-- Daily from 05:30 Tanzania time (02:30 UTC), one source every five minutes so each call stays short.
select cron.schedule('import-public-listings-' || src.key, src.at, format($job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_url')
      || '/import-public-listings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
    body := jsonb_build_object('source', %L),
    timeout_milliseconds := 150000)
$job$, src.key))
from (values ('nest', '30 2 * * *'), ('ajira', '35 2 * * *'), ('crdb', '40 2 * * *'),
             ('ajira_adverts', '45 2 * * *')) as src (key, at);
