-- O20: the admin review queue and the sources page for public listings. Approving takes skill names as staff type
-- them; staff discard many listings at once, switch sources on and off, and add a company, which stays off until a
-- developer has written its reader.

alter table public.public_listing_sources add column reader_ready boolean not null default true;
alter table public.public_listing_sources
  add constraint public_listing_sources_ready_before_active check (reader_ready or not active);

drop function public.approve_public_listing(uuid, uuid, uuid, boolean, uuid, uuid[], date, text, text, text, text);
drop function access.approve_public_listing(uuid, uuid, uuid, boolean, uuid, uuid[], date, text, text, text, text);

create function access.approve_public_listing(listing uuid, region uuid, district uuid, remote boolean, sector uuid,
                                              skills text[] default '{}', closing date default null,
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
  tags text[];
  tag text;
  skill uuid;
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
  select coalesce(array_agg(distinct n), '{}') into tags
  from unnest(coalesce(approve_public_listing.skills, '{}')) raw, private.normalize_skill(raw) n where n <> '';
  if cardinality(tags) > 5 or exists (select 1 from unnest(tags) n where char_length(n) > 40) then
    return query select 'too_many_skills', null::uuid;
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
  foreach tag in array tags loop
    select y.skill_id into skill from public.skill_synonyms y where y.from_name = tag::extensions.citext;
    if skill is null then
      insert into public.skills (name) values (tag) on conflict (name) do nothing;
      select s.id into skill from public.skills s where s.name = tag::extensions.citext;
    end if;
    insert into public.opportunity_skills (opportunity_id, skill_id) values (made, skill) on conflict do nothing;
    skill := null;
  end loop;

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

-- Several listings discarded at once, each with its own audit entry. Returns how many were discarded.
create function access.discard_public_listings(listings uuid[]) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  one uuid;
  done int := 0;
begin
  if not (select access.is_staff()) then
    return 0;
  end if;
  foreach one in array coalesce(listings, '{}') loop
    if access.discard_public_listing(one) = 'ok' then
      done := done + 1;
    end if;
  end loop;
  return done;
end;
$$;

create function access.set_public_listing_source_active(source uuid, active boolean) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  src public.public_listing_sources;
begin
  if not (select access.is_staff()) then
    return 'not_staff';
  end if;
  select * into src from public.public_listing_sources s where s.id = set_public_listing_source_active.source
  for update;
  if not found then
    return 'not_found';
  end if;
  if coalesce(set_public_listing_source_active.active, false) and not src.reader_ready then
    return 'no_reader';
  end if;
  if src.active = coalesce(set_public_listing_source_active.active, false) then
    return 'ok';
  end if;
  update public.public_listing_sources s set active = coalesce(set_public_listing_source_active.active, false)
  where s.id = src.id;
  insert into private.audit_log (actor_staff_id, action, target_type, target_id, before, after, ip_address)
  values (auth.uid(), 'public_listing_sources.switched', 'public_listing_sources', src.id,
          jsonb_build_object('active', src.active, 'name', src.name),
          jsonb_build_object('active', coalesce(set_public_listing_source_active.active, false), 'name', src.name),
          private.request_ip());
  return 'ok';
end;
$$;

-- A company added by staff is saved switched off and waits for a developer to write its reader.
create function access.add_public_listing_source(name text, page_url text, kind text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  clean_name text := btrim(coalesce(add_public_listing_source.name, ''));
  clean_url text := btrim(coalesce(add_public_listing_source.page_url, ''));
  new_key text;
  made uuid;
begin
  if not (select access.is_staff()) then
    return 'not_staff';
  end if;
  if char_length(clean_name) not between 1 and 80 or clean_url !~ '^https://[^\s/]+\.[^\s]+$'
     or char_length(clean_url) > 300 or coalesce(add_public_listing_source.kind, '') not in ('tenders', 'jobs') then
    return 'invalid';
  end if;
  new_key := left(btrim(regexp_replace(lower(clean_name), '[^a-z0-9]+', '_', 'g'), '_'), 30);
  if char_length(new_key) < 2 then
    new_key := 'company';
  end if;
  if exists (select 1 from public.public_listing_sources s
             where lower(s.name) = lower(clean_name) or s.page_url = clean_url) then
    return 'exists';
  end if;
  while exists (select 1 from public.public_listing_sources s where s.key = new_key) loop
    new_key := left(new_key, 25) || '_' || substr(md5(random()::text), 1, 4);
  end loop;
  insert into public.public_listing_sources (key, name, kind, page_url, active, reader_ready)
  values (new_key, clean_name, add_public_listing_source.kind, clean_url, false, false)
  returning id into made;
  insert into private.audit_log (actor_staff_id, action, target_type, target_id, after, ip_address)
  values (auth.uid(), 'public_listing_sources.added', 'public_listing_sources', made,
          jsonb_build_object('name', clean_name, 'page_url', clean_url, 'kind', add_public_listing_source.kind),
          private.request_ip());
  return 'ok';
end;
$$;

revoke all on function access.approve_public_listing(uuid, uuid, uuid, boolean, uuid, text[], date, text, text, text, text),
  access.discard_public_listings(uuid[]), access.set_public_listing_source_active(uuid, boolean),
  access.add_public_listing_source(text, text, text) from public, anon;
grant execute on function access.approve_public_listing(uuid, uuid, uuid, boolean, uuid, text[], date, text, text, text, text),
  access.discard_public_listings(uuid[]), access.set_public_listing_source_active(uuid, boolean),
  access.add_public_listing_source(text, text, text) to authenticated;

create function public.approve_public_listing(listing uuid, region uuid, district uuid, remote boolean, sector uuid,
                                              skills text[] default '{}', closing date default null,
                                              employment_type text default null, translated_title text default null,
                                              translated_summary text default null, fee_note text default null)
returns table (result text, opportunity_id uuid)
language sql volatile security invoker set search_path = '' as $$
  select * from access.approve_public_listing(listing, region, district, remote, sector, skills, closing,
                                              employment_type, translated_title, translated_summary, fee_note);
$$;
create function public.discard_public_listings(listings uuid[]) returns int
language sql volatile security invoker set search_path = '' as $$ select access.discard_public_listings(listings); $$;
create function public.set_public_listing_source_active(source uuid, active boolean) returns text
language sql volatile security invoker set search_path = '' as $$
  select access.set_public_listing_source_active(source, active);
$$;
create function public.add_public_listing_source(name text, page_url text, kind text) returns text
language sql volatile security invoker set search_path = '' as $$
  select access.add_public_listing_source(name, page_url, kind);
$$;
revoke all on function public.approve_public_listing(uuid, uuid, uuid, boolean, uuid, text[], date, text, text, text, text),
  public.discard_public_listings(uuid[]), public.set_public_listing_source_active(uuid, boolean),
  public.add_public_listing_source(text, text, text) from public, anon;
grant execute on function public.approve_public_listing(uuid, uuid, uuid, boolean, uuid, text[], date, text, text, text, text),
  public.discard_public_listings(uuid[]), public.set_public_listing_source_active(uuid, boolean),
  public.add_public_listing_source(text, text, text) to authenticated;

-- The audit log files changes to sources under opportunities too.
create or replace function access.audit_kind(action text) returns text
language sql immutable set search_path = '' as $$
  select case
    when head in ('members', 'member', 'member_private', 'profiles', 'application', 'registration', 'id',
                  'recovery', 'email_recoveries') then 'people'
    when head = 'investor_flags' then 'investors'
    when head in ('business', 'businesses') then 'business'
    when head in ('opportunity', 'opportunities', 'picks', 'pick_requests', 'responses', 'tenders',
                  'public_listing', 'public_listings', 'public_listing_sources') then 'opportunities'
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
