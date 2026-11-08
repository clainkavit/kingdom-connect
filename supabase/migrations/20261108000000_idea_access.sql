-- I03: members ask to see an idea's details, named (as investor, partner or both) or, with an investor flag,
-- anonymously. The owner approves or declines and can revoke access later. An anonymous investor is never
-- named to the owner before accepting the NDA (I04): the owner sees "A verified investor", the sector focus
-- and the ticket band only. Silent browsing by investors is counted, never named.

create table public.idea_access_requests (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.ideas (id) on delete cascade,
  requester_id uuid not null references public.members (id) on delete cascade,
  role text not null check (role in ('investor', 'partner', 'both')),
  anonymous boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'nda_accepted', 'revoked')),
  nda_acceptance_id uuid references public.legal_acceptances (id),
  decided_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idea_id, requester_id),
  check (not anonymous or role = 'investor')
);
create index idea_access_requests_idea on public.idea_access_requests (idea_id, status);

create table public.idea_views (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.ideas (id) on delete cascade,
  viewer_id uuid not null references public.members (id) on delete cascade,
  kind text not null check (kind in ('summary', 'detail', 'download')),
  viewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idea_views_idea on public.idea_views (idea_id, kind);

do $$
declare t text;
begin
  foreach t in array array['idea_access_requests', 'idea_views'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format($p$create policy "base rule" on public.%I as restrictive for all to authenticated
      using ((select access.is_member()) or (select access.is_staff()))
      with check ((select access.is_member()) or (select access.is_staff()))$p$, t);
  end loop;
end $$;
create trigger audit after insert or update or delete on public.idea_access_requests
  for each row execute function private.log_change();

-- The requester reads their own requests; staff read all. The owner only through requests_for_my_idea().
grant select (id, idea_id, requester_id, role, anonymous, status, decided_at, revoked_at, created_at, updated_at)
  on public.idea_access_requests to authenticated;
create policy "the requester and staff" on public.idea_access_requests for select to authenticated
  using (requester_id = (select auth.uid()) or (select access.is_staff()));
-- Views: staff only. The owner gets a count through investor_view_count().
grant select (id, idea_id, viewer_id, kind, viewed_at) on public.idea_views to authenticated;
create policy "staff only" on public.idea_views for select to authenticated using ((select access.is_staff()));

-- Whether a member holds a live investor flag.
create function access.is_investor(member uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.investor_flags f where f.member_id = member and f.revoked_at is null);
$$;
revoke all on function access.is_investor(uuid) from public, anon, authenticated;

-- An idea the caller may see in the pool: published, its owner approved and not blocked either way.
create function access.idea_visible(idea uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ideas i join public.members m on m.id = i.owner_id
                 where i.id = idea and i.status = 'published' and m.status = 'approved'
                   and not access.is_blocked(i.owner_id, auth.uid()))
     and (select access.is_member());
$$;
revoke all on function access.idea_visible(uuid) from public, anon, authenticated;

create function private.band_label(band text) returns text
language sql immutable set search_path = '' as $$
  select case band when 'under_10m' then 'under TZS 10M' when '10m_to_50m' then 'TZS 10M to 50M'
                   when 'over_50m' then 'over TZS 50M' end;
$$;

create function access.express_interest(idea uuid, role text, anonymous boolean) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  post public.ideas;
  flag public.investor_flags;
  hidden boolean := coalesce(anonymous, false);
  existing public.idea_access_requests;
  my_name text;
begin
  if not access.idea_visible(idea) then
    return 'not_found';
  end if;
  select * into post from public.ideas i where i.id = idea;
  if post.owner_id = me then
    return 'own_idea';
  end if;
  if role is null or role not in ('investor', 'partner', 'both') then
    return 'invalid_role';
  end if;
  if hidden then
    select * into flag from public.investor_flags f where f.member_id = me and f.revoked_at is null;
    if not found then
      return 'not_investor';
    end if;
    if role <> 'investor' then
      return 'invalid_role';
    end if;
  end if;
  select * into existing from public.idea_access_requests r where r.idea_id = idea and r.requester_id = me;
  if found then
    return 'already_requested';
  end if;

  insert into public.idea_access_requests (idea_id, requester_id, role, anonymous)
  values (idea, me, role, hidden);

  if hidden then
    perform private.notify(post.owner_id, 'I2', jsonb_build_object(
      'idea_title', post.title, 'idea_id', post.id::text,
      'sector', coalesce((select s.name_en from public.sectors s where s.id = flag.sector_focus), 'Any sector'),
      'band', coalesce(private.band_label(flag.ticket_band), 'Not given')));
  else
    select coalesce(p.full_name, m.username::text) into my_name
    from public.members m left join public.profiles p on p.member_id = m.id where m.id = me;
    perform private.notify(post.owner_id, 'I1', jsonb_build_object(
      'name', my_name, 'idea_title', post.title, 'idea_id', post.id::text,
      'role', case role when 'investor' then 'investor' when 'partner' then 'partner' else 'investor and partner' end));
  end if;
  return 'ok';
end;
$$;

-- The owner's request cards. An anonymous requester stays "A verified investor" with sector and band only,
-- with no id, name or headline, until they accept the NDA.
create function access.requests_for_my_idea(idea uuid)
returns table (request_id uuid, status text, role text, anonymous boolean, requester_id uuid, requester_name text,
               requester_headline text, sector_focus_en text, sector_focus_sw text, ticket_band text,
               requested_at timestamptz, decided_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.status, r.role, r.anonymous,
         case when r.anonymous and r.status <> 'nda_accepted' then null else r.requester_id end,
         case when r.anonymous and r.status <> 'nda_accepted' then null
              else coalesce(p.full_name, m.username::text) end,
         case when r.anonymous and r.status <> 'nda_accepted' then null else p.headline end,
         case when r.anonymous then s.name_en end, case when r.anonymous then s.name_sw end,
         case when r.anonymous then f.ticket_band end,
         r.created_at, r.decided_at
  from public.idea_access_requests r
  join public.ideas i on i.id = r.idea_id
  join public.members m on m.id = r.requester_id
  left join public.profiles p on p.member_id = r.requester_id
  left join public.investor_flags f on f.member_id = r.requester_id and f.revoked_at is null and r.anonymous
  left join public.sectors s on s.id = f.sector_focus
  where r.idea_id = idea and i.owner_id = auth.uid() and (select access.is_member())
  order by (r.status = 'pending') desc, r.created_at desc;
$$;

-- The owner approves (I3) or declines with a neutral notice (I4) a pending request.
create function access.decide_idea_request(request uuid, approve boolean) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  found_request public.idea_access_requests;
  post public.ideas;
begin
  select * into found_request from public.idea_access_requests r where r.id = request for update;
  if not found then
    return 'not_found';
  end if;
  select * into post from public.ideas i where i.id = found_request.idea_id;
  if post.owner_id <> auth.uid() or not (select access.is_member()) then
    return 'not_found';
  end if;
  if found_request.status <> 'pending' then
    return 'already_decided';
  end if;
  update public.idea_access_requests
  set status = case when approve then 'approved' else 'declined' end, decided_at = now()
  where id = request;
  perform private.notify(found_request.requester_id, case when approve then 'I3' else 'I4' end,
                         jsonb_build_object('idea_title', post.title, 'idea_id', post.id::text));
  return 'ok';
end;
$$;

-- The owner removes access at once, from an approved request or one past the NDA (I6). It is logged.
create function access.revoke_idea_access(request uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  found_request public.idea_access_requests;
  post public.ideas;
begin
  select * into found_request from public.idea_access_requests r where r.id = request for update;
  if not found then
    return 'not_found';
  end if;
  select * into post from public.ideas i where i.id = found_request.idea_id;
  if post.owner_id <> auth.uid() or not (select access.is_member()) then
    return 'not_found';
  end if;
  if found_request.status not in ('approved', 'nda_accepted') then
    return 'no_access';
  end if;
  update public.idea_access_requests set status = 'revoked', revoked_at = now() where id = request;
  perform private.notify(found_request.requester_id, 'I6',
                         jsonb_build_object('idea_title', post.title, 'idea_id', post.id::text));
  return 'ok';
end;
$$;

-- A member opening an idea's summary: logged for staff, so the owner can see how many investors looked.
create function access.record_idea_view(idea uuid) returns void
language sql volatile security definer set search_path = '' as $$
  insert into public.idea_views (idea_id, viewer_id, kind)
  select idea, auth.uid(), 'summary'
  where access.idea_visible(idea)
    and not exists (select 1 from public.ideas i where i.id = idea and i.owner_id = auth.uid());
$$;

-- "Viewed by N investors": a number only, for the owner.
create function access.investor_view_count(idea uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(distinct v.viewer_id)::int
  from public.idea_views v
  where v.idea_id = idea and access.is_investor(v.viewer_id)
    and exists (select 1 from public.ideas i where i.id = idea and i.owner_id = auth.uid())
    and (select access.is_member());
$$;

-- The pool's interest count is every request made, whatever became of it.
create or replace view public.idea_summaries with (security_barrier = true) as
  select i.id, i.title, i.problem, i.sector_id, s.name_en as sector_en, s.name_sw as sector_sw, i.stage, i.seeking,
         i.investment_min_tzs, i.investment_max_tzs,
         case when i.show_owner then i.owner_id end as owner_id,
         case when i.show_owner then coalesce(p.full_name, m.username::text) end as owner_name,
         (select count(*)::int from public.idea_access_requests r where r.idea_id = i.id) as interest_count,
         i.published_at,
         i.owner_id = (select auth.uid()) as is_mine
  from public.ideas i
  join public.sectors s on s.id = i.sector_id
  join public.members m on m.id = i.owner_id
  left join public.profiles p on p.member_id = i.owner_id
  where i.status = 'published' and m.status = 'approved'
    and ((select access.is_member()) or (select access.is_staff()))
    and not access.is_blocked(i.owner_id, (select auth.uid()));

revoke all on function access.express_interest(uuid, text, boolean), access.requests_for_my_idea(uuid),
  access.decide_idea_request(uuid, boolean), access.revoke_idea_access(uuid), access.record_idea_view(uuid),
  access.investor_view_count(uuid) from public, anon;
grant execute on function access.express_interest(uuid, text, boolean), access.requests_for_my_idea(uuid),
  access.decide_idea_request(uuid, boolean), access.revoke_idea_access(uuid), access.record_idea_view(uuid),
  access.investor_view_count(uuid) to authenticated;

create function public.express_interest(idea uuid, role text, anonymous boolean) returns text
language sql volatile security invoker set search_path = '' as $$ select access.express_interest(idea, role, anonymous); $$;
create function public.requests_for_my_idea(idea uuid)
returns table (request_id uuid, status text, role text, anonymous boolean, requester_id uuid, requester_name text,
               requester_headline text, sector_focus_en text, sector_focus_sw text, ticket_band text,
               requested_at timestamptz, decided_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from access.requests_for_my_idea(idea); $$;
create function public.decide_idea_request(request uuid, approve boolean) returns text
language sql volatile security invoker set search_path = '' as $$ select access.decide_idea_request(request, approve); $$;
create function public.revoke_idea_access(request uuid) returns text
language sql volatile security invoker set search_path = '' as $$ select access.revoke_idea_access(request); $$;
create function public.record_idea_view(idea uuid) returns void
language sql volatile security invoker set search_path = '' as $$ select access.record_idea_view(idea); $$;
create function public.investor_view_count(idea uuid) returns int
language sql stable security invoker set search_path = '' as $$ select access.investor_view_count(idea); $$;

revoke all on function public.express_interest(uuid, text, boolean), public.requests_for_my_idea(uuid),
  public.decide_idea_request(uuid, boolean), public.revoke_idea_access(uuid), public.record_idea_view(uuid),
  public.investor_view_count(uuid) from public, anon;
grant execute on function public.express_interest(uuid, text, boolean), public.requests_for_my_idea(uuid),
  public.decide_idea_request(uuid, boolean), public.revoke_idea_access(uuid), public.record_idea_view(uuid),
  public.investor_view_count(uuid) to authenticated;
