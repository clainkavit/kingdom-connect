-- I06: the investor flag and its discreet tools. Staff grant the flag by invitation, or by approving a
-- Level 2 member's application. A flag holder gets investor filters, a private Saved list and silent browsing.
-- Nothing tells any other member who holds the flag or how many do: the flag is readable by its holder and
-- staff only, and every member-facing function here answers only about the caller.

-- Writes to the flag go through the functions below, not straight to the table.
drop policy "staff grant, as themselves" on public.investor_flags;
drop policy "staff change" on public.investor_flags;
revoke insert, update on public.investor_flags from authenticated;

create table public.investor_applications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  sector_focus uuid references public.sectors (id),
  ticket_band text check (ticket_band in ('under_10m', '10m_to_50m', 'over_50m')),
  note text not null default '' check (char_length(note) <= 600),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_by uuid references public.staff (id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index investor_applications_one_pending on public.investor_applications (member_id)
  where status = 'pending';

create table public.saved_ideas (
  investor_id uuid not null references public.members (id) on delete cascade,
  idea_id uuid not null references public.ideas (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (investor_id, idea_id)
);

do $$
declare t text;
begin
  foreach t in array array['investor_applications', 'saved_ideas'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format($p$create policy "base rule" on public.%I as restrictive for all to authenticated
      using ((select access.is_member()) or (select access.is_staff()))
      with check ((select access.is_member()) or (select access.is_staff()))$p$, t);
  end loop;
end $$;
create trigger audit after insert or update or delete on public.investor_applications
  for each row execute function private.log_change();

grant select (id, member_id, sector_focus, ticket_band, note, status, decided_at, created_at)
  on public.investor_applications to authenticated;
create policy "the applicant and staff" on public.investor_applications for select to authenticated
  using (member_id = (select auth.uid()) or (select access.is_staff()));
grant select (investor_id, idea_id, created_at) on public.saved_ideas to authenticated;
create policy "the investor only" on public.saved_ideas for select to authenticated
  using (investor_id = (select auth.uid()));

-- Whether the caller holds a live flag. Answers only about the caller.
create function access.i_am_investor() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select access.is_member()) and access.is_investor(auth.uid());
$$;

-- What the caller sees about investor tools: investor, can_apply (Level 2), applied, declined, or none.
create function access.my_investor_status() returns text
language sql stable security definer set search_path = '' as $$
  select case
    when not (select access.is_member()) then 'none'
    when access.is_investor(auth.uid()) then 'investor'
    when exists (select 1 from public.investor_applications a where a.member_id = auth.uid() and a.status = 'pending')
      then 'applied'
    when access.member_level(auth.uid()) < 2 then 'none'
    when (select a.status from public.investor_applications a where a.member_id = auth.uid()
          order by a.created_at desc limit 1) = 'declined' then 'declined'
    else 'can_apply'
  end;
$$;

-- IDEA-6: a Level 2 member applies, with an optional sector focus, band and note.
create function access.apply_for_investor_flag(sector uuid, band text, note text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  clean_note text := btrim(coalesce(note, ''));
begin
  if not (select access.is_member()) or access.member_level(auth.uid()) < 2 then
    return 'not_eligible';
  end if;
  if access.is_investor(auth.uid()) then
    return 'already_investor';
  end if;
  if exists (select 1 from public.investor_applications a where a.member_id = auth.uid() and a.status = 'pending') then
    return 'already_applied';
  end if;
  if band is not null and band not in ('under_10m', '10m_to_50m', 'over_50m') then
    return 'invalid_band';
  end if;
  if sector is not null and not exists (select 1 from public.sectors s where s.id = sector) then
    return 'invalid_sector';
  end if;
  if char_length(clean_note) > 600 then
    return 'note_too_long';
  end if;
  if private.holds_contact_details(jsonb_build_object('note', clean_note)) then
    return 'contact_details';
  end if;
  insert into public.investor_applications (member_id, sector_focus, ticket_band, note)
  values (auth.uid(), sector, band, clean_note);
  return 'ok';
end;
$$;

-- Grants the flag, for invitations and approved applications alike. V1 tells only that member.
create function private.grant_investor_flag(member uuid, staff_id uuid, how text, sector uuid, band text)
returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  if access.is_investor(member) then
    return 'already_investor';
  end if;
  insert into public.investor_flags (member_id, granted_by, route, sector_focus, ticket_band)
  values (member, staff_id, how, sector, band);
  perform private.notify(member, 'V1', '{}'::jsonb);
  return 'ok';
end;
$$;
revoke all on function private.grant_investor_flag(uuid, uuid, text, uuid, text) from public, anon, authenticated;

-- A10: an Administrator or Super Administrator invites an approved member.
create function access.invite_investor(member uuid, sector uuid, band text) returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not (select access.is_staff()) then
    return 'not_staff';
  end if;
  if not exists (select 1 from public.members m where m.id = member and m.status = 'approved') then
    return 'unknown_member';
  end if;
  if band is not null and band not in ('under_10m', '10m_to_50m', 'over_50m') then
    return 'invalid_band';
  end if;
  return private.grant_investor_flag(member, auth.uid(), 'invitation', sector, band);
end;
$$;

-- A10: staff approve or decline an application. Declining sends nothing; the member sees it in their tools.
create function access.decide_investor_application(application uuid, approve boolean) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  found_application public.investor_applications;
  granted text;
begin
  if not (select access.is_staff()) then
    return 'not_staff';
  end if;
  select * into found_application from public.investor_applications a where a.id = application for update;
  if not found then
    return 'not_found';
  end if;
  if found_application.status <> 'pending' then
    return 'already_decided';
  end if;
  update public.investor_applications
  set status = case when approve then 'approved' else 'declined' end, decided_by = auth.uid(), decided_at = now()
  where id = application;
  if approve then
    granted := private.grant_investor_flag(found_application.member_id, auth.uid(), 'application',
                                           found_application.sector_focus, found_application.ticket_band);
    if granted not in ('ok', 'already_investor') then
      return granted;
    end if;
  end if;
  return 'ok';
end;
$$;

-- A10: staff revoke a live flag. The member's saved list goes with it.
create function access.revoke_investor_flag(member uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not (select access.is_staff()) then
    return 'not_staff';
  end if;
  update public.investor_flags set revoked_at = now() where member_id = member and revoked_at is null;
  if not found then
    return 'not_found';
  end if;
  delete from public.saved_ideas where investor_id = member;
  return 'ok';
end;
$$;

-- A10: flag holders, for staff only.
create function access.investor_list()
returns table (member_id uuid, full_name text, username text, route text, sector_en text, sector_sw text,
               ticket_band text, granted_at timestamptz, granted_by_name text)
language sql stable security definer set search_path = '' as $$
  select f.member_id, p.full_name, m.username::text, f.route, s.name_en, s.name_sw, f.ticket_band, f.granted_at,
         st.full_name
  from public.investor_flags f
  join public.members m on m.id = f.member_id
  left join public.profiles p on p.member_id = f.member_id
  left join public.sectors s on s.id = f.sector_focus
  left join public.staff st on st.id = f.granted_by
  where f.revoked_at is null and (select access.is_staff())
  order by f.granted_at desc;
$$;

-- A10: pending applications, for staff only.
create function access.investor_application_queue()
returns table (application_id uuid, member_id uuid, full_name text, username text, sector_en text,
               sector_sw text, ticket_band text, note text, applied_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.id, a.member_id, p.full_name, m.username::text, s.name_en, s.name_sw, a.ticket_band, a.note, a.created_at
  from public.investor_applications a
  join public.members m on m.id = a.member_id
  left join public.profiles p on p.member_id = a.member_id
  left join public.sectors s on s.id = a.sector_focus
  where a.status = 'pending' and (select access.is_staff())
  order by a.created_at;
$$;

-- A10: approved members who could be invited, by name or username. Staff only.
create function access.investor_invite_search(query text)
returns table (member_id uuid, full_name text, username text, is_investor boolean)
language sql stable security definer set search_path = '' as $$
  select m.id, p.full_name, m.username::text, access.is_investor(m.id)
  from public.members m left join public.profiles p on p.member_id = m.id
  where (select access.is_staff()) and m.status = 'approved' and char_length(btrim(coalesce(query, ''))) >= 2
    and (p.full_name ilike '%' || btrim(query) || '%' or m.username::text ilike '%' || btrim(query) || '%')
  order by p.full_name nulls last, m.username
  limit 20;
$$;

-- S29: the investor saves or unsaves an idea. Only a flag holder can.
create function access.set_idea_saved(idea uuid, saved boolean) returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not access.i_am_investor() then
    return 'not_investor';
  end if;
  if saved then
    if not exists (select 1 from public.idea_summaries s where s.id = idea) then
      return 'not_found';
    end if;
    insert into public.saved_ideas (investor_id, idea_id) values (auth.uid(), idea) on conflict do nothing;
  else
    delete from public.saved_ideas where investor_id = auth.uid() and idea_id = idea;
  end if;
  return 'ok';
end;
$$;

-- S22 investor filters and S29: the pool for a flag holder, filtered by sector, stage, overlapping range and
-- the owner's region, optionally only saved ideas. The region filters but is never returned. Anyone without a
-- live flag gets nothing.
create function access.investor_ideas(sector uuid, stage text, min_tzs bigint, max_tzs bigint, region uuid,
                                      saved_only boolean, page int)
returns table (id uuid, title text, problem text, sector_id uuid, sector_en text, sector_sw text, stage text,
               seeking text, investment_min_tzs bigint, investment_max_tzs bigint, owner_id uuid, owner_name text,
               interest_count int, published_at timestamptz, is_mine boolean, saved boolean)
language sql stable security definer set search_path = '' as $$
  select s.id, s.title, s.problem, s.sector_id, s.sector_en, s.sector_sw, s.stage, s.seeking,
         s.investment_min_tzs, s.investment_max_tzs, s.owner_id, s.owner_name, s.interest_count, s.published_at,
         s.is_mine, sv.idea_id is not null
  from public.idea_summaries s
  join public.ideas i on i.id = s.id
  left join public.profiles p on p.member_id = i.owner_id
  left join public.saved_ideas sv on sv.idea_id = s.id and sv.investor_id = auth.uid()
  where access.i_am_investor()
    and (investor_ideas.sector is null or s.sector_id = investor_ideas.sector)
    and (investor_ideas.stage is null or s.stage = investor_ideas.stage)
    and (investor_ideas.min_tzs is null
         or coalesce(s.investment_max_tzs, s.investment_min_tzs) >= investor_ideas.min_tzs)
    and (investor_ideas.max_tzs is null
         or coalesce(s.investment_min_tzs, s.investment_max_tzs) <= investor_ideas.max_tzs)
    and (investor_ideas.region is null or p.region_id = investor_ideas.region)
    and (not coalesce(investor_ideas.saved_only, false) or sv.idea_id is not null)
  order by s.published_at desc, s.id
  limit 20 offset greatest(coalesce(investor_ideas.page, 0), 0) * 20;
$$;

revoke all on function access.i_am_investor(), access.my_investor_status(),
  access.apply_for_investor_flag(uuid, text, text), access.invite_investor(uuid, uuid, text),
  access.decide_investor_application(uuid, boolean), access.revoke_investor_flag(uuid), access.investor_list(),
  access.investor_application_queue(), access.investor_invite_search(text), access.set_idea_saved(uuid, boolean),
  access.investor_ideas(uuid, text, bigint, bigint, uuid, boolean, int) from public, anon;
grant execute on function access.i_am_investor(), access.my_investor_status(),
  access.apply_for_investor_flag(uuid, text, text), access.invite_investor(uuid, uuid, text),
  access.decide_investor_application(uuid, boolean), access.revoke_investor_flag(uuid), access.investor_list(),
  access.investor_application_queue(), access.investor_invite_search(text), access.set_idea_saved(uuid, boolean),
  access.investor_ideas(uuid, text, bigint, bigint, uuid, boolean, int) to authenticated;

create function public.my_investor_status() returns text
language sql stable security invoker set search_path = '' as $$ select access.my_investor_status(); $$;
create function public.apply_for_investor_flag(sector uuid, band text, note text) returns text
language sql volatile security invoker set search_path = '' as $$ select access.apply_for_investor_flag(sector, band, note); $$;
create function public.invite_investor(member uuid, sector uuid, band text) returns text
language sql volatile security invoker set search_path = '' as $$ select access.invite_investor(member, sector, band); $$;
create function public.decide_investor_application(application uuid, approve boolean) returns text
language sql volatile security invoker set search_path = '' as $$ select access.decide_investor_application(application, approve); $$;
create function public.revoke_investor_flag(member uuid) returns text
language sql volatile security invoker set search_path = '' as $$ select access.revoke_investor_flag(member); $$;
create function public.investor_list()
returns table (member_id uuid, full_name text, username text, route text, sector_en text, sector_sw text,
               ticket_band text, granted_at timestamptz, granted_by_name text)
language sql stable security invoker set search_path = '' as $$ select * from access.investor_list(); $$;
create function public.investor_application_queue()
returns table (application_id uuid, member_id uuid, full_name text, username text, sector_en text,
               sector_sw text, ticket_band text, note text, applied_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from access.investor_application_queue(); $$;
create function public.investor_invite_search(query text)
returns table (member_id uuid, full_name text, username text, is_investor boolean)
language sql stable security invoker set search_path = '' as $$ select * from access.investor_invite_search(query); $$;
create function public.set_idea_saved(idea uuid, saved boolean) returns text
language sql volatile security invoker set search_path = '' as $$ select access.set_idea_saved(idea, saved); $$;
create function public.investor_ideas(sector uuid, stage text, min_tzs bigint, max_tzs bigint, region uuid,
                                      saved_only boolean, page int)
returns table (id uuid, title text, problem text, sector_id uuid, sector_en text, sector_sw text, stage text,
               seeking text, investment_min_tzs bigint, investment_max_tzs bigint, owner_id uuid, owner_name text,
               interest_count int, published_at timestamptz, is_mine boolean, saved boolean)
language sql stable security invoker set search_path = '' as $$
  select * from access.investor_ideas(sector, stage, min_tzs, max_tzs, region, saved_only, page);
$$;

revoke all on function public.my_investor_status(), public.apply_for_investor_flag(uuid, text, text),
  public.invite_investor(uuid, uuid, text), public.decide_investor_application(uuid, boolean),
  public.revoke_investor_flag(uuid), public.investor_list(), public.investor_application_queue(),
  public.investor_invite_search(text), public.set_idea_saved(uuid, boolean),
  public.investor_ideas(uuid, text, bigint, bigint, uuid, boolean, int) from public, anon;
grant execute on function public.my_investor_status(), public.apply_for_investor_flag(uuid, text, text),
  public.invite_investor(uuid, uuid, text), public.decide_investor_application(uuid, boolean),
  public.revoke_investor_flag(uuid), public.investor_list(), public.investor_application_queue(),
  public.investor_invite_search(text), public.set_idea_saved(uuid, boolean),
  public.investor_ideas(uuid, text, bigint, bigint, uuid, boolean, int) to authenticated;
