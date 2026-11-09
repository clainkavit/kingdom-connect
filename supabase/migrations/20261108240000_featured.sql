-- O05: featured opportunities. An administrator features up to the slot limit (the platform setting
-- featured_slot_limit, 5 at the start) of published posts. A post stays featured until an administrator removes
-- it or the post stops being published (closed, expired, hidden or removed), which frees its slot at once.

-- A post that is no longer published is never featured.
create function private.clear_featured_when_unpublished() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status <> 'published' then
    new.featured_at := null;
  end if;
  return new;
end $$;
create trigger clear_featured before update on public.opportunities
  for each row when (new.featured_at is not null and new.status is distinct from 'published')
  execute function private.clear_featured_when_unpublished();

create function private.featured_slot_limit() returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((select (s.value #>> '{}')::int from public.platform_settings s where s.key = 'featured_slot_limit'), 5);
$$;
revoke all on function private.featured_slot_limit() from public, anon, authenticated;

-- Posts that count against the slots: featured, still published and not past their closing date.
create function private.featured_in_use() returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.opportunities o
  where o.featured_at is not null and o.status = 'published' and o.closing_at >= private.tanzania_today();
$$;
revoke all on function private.featured_in_use() from public, anon, authenticated;

-- A12: feature or unfeature a published post. A full set of slots refuses another.
create function access.set_opportunity_featured(opportunity uuid, featured boolean) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  post public.opportunities;
begin
  if not (select access.is_staff()) then
    return 'not_staff';
  end if;
  select * into post from public.opportunities o where o.id = opportunity for update;
  if not found then
    return 'not_found';
  end if;
  if coalesce(featured, false) then
    if post.status <> 'published' or post.closing_at < private.tanzania_today() then
      return 'not_published';
    end if;
    if post.featured_at is not null then
      return 'already_featured';
    end if;
    perform pg_advisory_xact_lock(hashtext('featured-slots'));
    if private.featured_in_use() >= private.featured_slot_limit() then
      return 'slots_full';
    end if;
    update public.opportunities set featured_at = now() where id = opportunity;
  else
    if post.featured_at is null then
      return 'not_featured';
    end if;
    update public.opportunities set featured_at = null where id = opportunity;
  end if;
  insert into private.audit_log (actor_staff_id, action, target_type, target_id, before, after, ip_address)
  values (auth.uid(), case when coalesce(featured, false) then 'opportunity.feature' else 'opportunity.unfeature' end,
          'opportunities', opportunity, jsonb_build_object('featured', post.featured_at is not null),
          jsonb_build_object('featured', coalesce(featured, false)), private.request_ip());
  return 'ok';
end;
$$;

-- A12: the slots in use and the limit.
create function access.featured_slots() returns table (used int, slot_limit int)
language sql stable security definer set search_path = '' as $$
  select private.featured_in_use(), private.featured_slot_limit() where (select access.is_staff());
$$;

-- A12: the featured posts, oldest pick first, for staff.
create function access.admin_featured()
returns table (id uuid, title text, type text, poster_name text, closing_at date, featured_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select o.id, o.title, o.type, c.poster_name, o.closing_at, o.featured_at
  from public.opportunities o join private.opportunity_cards c on c.id = o.id
  where o.featured_at is not null and o.status = 'published' and (select access.is_staff())
  order by o.featured_at;
$$;

-- A12: published posts that could be featured, newest first, optionally narrowed by a word in the title.
create function access.featurable_opportunities(query text default null)
returns table (id uuid, title text, type text, poster_name text, closing_at date, published_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select o.id, o.title, o.type, c.poster_name, o.closing_at, o.published_at
  from public.opportunities o join private.opportunity_cards c on c.id = o.id
  where o.status = 'published' and o.featured_at is null and o.closing_at >= private.tanzania_today()
    and (select access.is_staff())
    and (nullif(btrim(featurable_opportunities.query), '') is null
         or o.title ilike '%' || btrim(featurable_opportunities.query) || '%')
  order by o.published_at desc
  limit 20;
$$;

revoke all on function access.set_opportunity_featured(uuid, boolean), access.featured_slots(),
  access.admin_featured(), access.featurable_opportunities(text) from public, anon;
grant execute on function access.set_opportunity_featured(uuid, boolean), access.featured_slots(),
  access.admin_featured(), access.featurable_opportunities(text) to authenticated;

create function public.set_opportunity_featured(opportunity uuid, featured boolean) returns text
language sql volatile security invoker set search_path = '' as $$ select access.set_opportunity_featured(opportunity, featured); $$;
create function public.featured_slots() returns table (used int, slot_limit int)
language sql stable security invoker set search_path = '' as $$ select * from access.featured_slots(); $$;
create function public.admin_featured()
returns table (id uuid, title text, type text, poster_name text, closing_at date, featured_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from access.admin_featured(); $$;
create function public.featurable_opportunities(query text default null)
returns table (id uuid, title text, type text, poster_name text, closing_at date, published_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from access.featurable_opportunities(query); $$;
revoke all on function public.set_opportunity_featured(uuid, boolean), public.featured_slots(),
  public.admin_featured(), public.featurable_opportunities(text) from public, anon;
grant execute on function public.set_opportunity_featured(uuid, boolean), public.featured_slots(),
  public.admin_featured(), public.featurable_opportunities(text) to authenticated;
