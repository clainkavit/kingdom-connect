-- I01: members submit ideas with a public summary and confidential details. Every idea passes moderation.
-- Members see summaries only through idea_summaries, which blanks the owner of an idea posted without a name.
-- Details stay with the owner and staff; access requests and the NDA (I03, I04) open them to others later.

create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.members (id),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  problem text not null check (char_length(btrim(problem)) between 20 and 600),
  sector_id uuid not null references public.sectors (id),
  stage text not null check (stage in ('idea', 'prototype', 'early_revenue', 'growing')),
  seeking text not null check (seeking in ('investor', 'partner', 'both')),
  investment_min_tzs bigint check (investment_min_tzs > 0),
  investment_max_tzs bigint check (investment_max_tzs > 0),
  show_owner boolean not null default true,
  status text not null default 'draft'
    check (status in ('draft', 'pending_moderation', 'published', 'archived', 'hidden', 'removed')),
  review_reason text check (char_length(review_reason) <= 600),
  submitted_at timestamptz,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (investment_min_tzs is null or investment_max_tzs is null or investment_min_tzs <= investment_max_tzs)
);
create index ideas_status_published on public.ideas (status, published_at desc);
create index ideas_owner on public.ideas (owner_id);

create table public.idea_details (
  idea_id uuid primary key references public.ideas (id) on delete cascade,
  description text not null check (char_length(btrim(description)) between 50 and 5000),
  business_model text check (char_length(business_model) <= 3000),
  market text check (char_length(market) <= 3000),
  financials text check (char_length(financials) <= 3000),
  team text check (char_length(team) <= 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['ideas', 'idea_details'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format($p$create policy "base rule" on public.%I as restrictive for all to authenticated
      using ((select access.is_member()) or (select access.is_staff()))
      with check ((select access.is_member()) or (select access.is_staff()))$p$, t);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function private.log_change()', t);
  end loop;
end $$;

-- The tables themselves: the owner and staff only. Writes go through the functions below.
grant select (id, owner_id, title, problem, sector_id, stage, seeking, investment_min_tzs, investment_max_tzs,
              show_owner, status, review_reason, submitted_at, published_at, archived_at, created_at, updated_at)
  on public.ideas to authenticated;
grant select (idea_id, description, business_model, market, financials, team, created_at, updated_at)
  on public.idea_details to authenticated;
create policy "the owner and staff" on public.ideas for select to authenticated
  using (owner_id = (select auth.uid()) or (select access.is_staff()));
create policy "the owner and staff" on public.idea_details for select to authenticated
  using ((select access.is_staff())
         or exists (select 1 from public.ideas i where i.id = idea_id and i.owner_id = (select auth.uid())));

-- What every approved member may see of a published idea. The owner is blank when posted without a name.
-- Interest counts arrive with I03.
create view public.idea_summaries with (security_barrier = true) as
  select i.id, i.title, i.problem, i.sector_id, s.name_en as sector_en, s.name_sw as sector_sw, i.stage, i.seeking,
         i.investment_min_tzs, i.investment_max_tzs,
         case when i.show_owner then i.owner_id end as owner_id,
         case when i.show_owner then coalesce(p.full_name, m.username::text) end as owner_name,
         0 as interest_count, i.published_at
  from public.ideas i
  join public.sectors s on s.id = i.sector_id
  join public.members m on m.id = i.owner_id
  left join public.profiles p on p.member_id = i.owner_id
  where i.status = 'published' and m.status = 'approved'
    and ((select access.is_member()) or (select access.is_staff()));
revoke all on public.idea_summaries from anon, authenticated;
grant select on public.idea_summaries to authenticated;

create function access.save_idea(
  idea uuid, title text, problem text, sector uuid, stage text, seeking text, investment_min bigint,
  investment_max bigint, show_owner boolean, description text, business_model text, market text,
  financials text, team text, submit boolean
) returns table (result text, idea_id uuid)
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  existing public.ideas;
  clean_title text := btrim(coalesce(title, ''));
  clean_problem text := btrim(coalesce(problem, ''));
  clean_description text := btrim(coalesce(description, ''));
  clean_model text := nullif(btrim(coalesce(business_model, '')), '');
  clean_market text := nullif(btrim(coalesce(market, '')), '');
  clean_financials text := nullif(btrim(coalesce(financials, '')), '');
  clean_team text := nullif(btrim(coalesce(team, '')), '');
  next_status text;
  saved uuid;
begin
  if not (select access.is_member()) then
    return query select 'not_allowed'::text, null::uuid; return;
  end if;
  if exists (select 1 from public.members m where m.id = me
             and m.posting_suspended_until is not null and m.posting_suspended_until > now()) then
    return query select 'posting_paused'::text, null::uuid; return;
  end if;

  if idea is not null then
    select * into existing from public.ideas i where i.id = idea for update;
    if not found or existing.owner_id <> me then
      return query select 'not_found'::text, null::uuid; return;
    end if;
    if existing.status <> 'draft' then
      return query select 'not_editable'::text, existing.id; return;
    end if;
  end if;

  if char_length(clean_title) not between 3 and 120 then
    return query select 'invalid_title'::text, null::uuid; return;
  end if;
  if char_length(clean_problem) not between 20 and 600 then
    return query select 'invalid_problem'::text, null::uuid; return;
  end if;
  if not exists (select 1 from public.sectors s where s.id = sector) then
    return query select 'invalid_sector'::text, null::uuid; return;
  end if;
  if stage is null or stage not in ('idea', 'prototype', 'early_revenue', 'growing') then
    return query select 'invalid_stage'::text, null::uuid; return;
  end if;
  if seeking is null or seeking not in ('investor', 'partner', 'both') then
    return query select 'invalid_seeking'::text, null::uuid; return;
  end if;
  if (investment_min is not null and investment_min <= 0) or (investment_max is not null and investment_max <= 0)
     or (investment_min is not null and investment_max is not null and investment_min > investment_max) then
    return query select 'invalid_range'::text, null::uuid; return;
  end if;
  if char_length(clean_description) not between 50 and 5000 then
    return query select 'invalid_description'::text, null::uuid; return;
  end if;
  if greatest(char_length(coalesce(clean_model, '')), char_length(coalesce(clean_market, '')),
              char_length(coalesce(clean_financials, '')), char_length(coalesce(clean_team, ''))) > 3000 then
    return query select 'detail_too_long'::text, null::uuid; return;
  end if;
  if private.holds_contact_details(jsonb_build_object(
       'title', clean_title, 'problem', clean_problem, 'description', clean_description,
       'business_model', coalesce(clean_model, ''), 'market', coalesce(clean_market, ''),
       'financials', coalesce(clean_financials, ''), 'team', coalesce(clean_team, ''))) then
    return query select 'contact_details'::text, null::uuid; return;
  end if;

  next_status := case when coalesce(submit, false) then 'pending_moderation' else 'draft' end;

  if idea is null then
    insert into public.ideas (owner_id, title, problem, sector_id, stage, seeking, investment_min_tzs,
                              investment_max_tzs, show_owner, status, submitted_at)
    values (me, clean_title, clean_problem, sector, stage, seeking, investment_min, investment_max,
            coalesce(show_owner, true), next_status, case when next_status <> 'draft' then now() end)
    returning id into saved;
    insert into public.idea_details (idea_id, description, business_model, market, financials, team)
    values (saved, clean_description, clean_model, clean_market, clean_financials, clean_team);
  else
    update public.ideas i
    set title = clean_title, problem = clean_problem, sector_id = sector, stage = save_idea.stage,
        seeking = save_idea.seeking, investment_min_tzs = investment_min, investment_max_tzs = investment_max,
        show_owner = coalesce(save_idea.show_owner, true), status = next_status,
        review_reason = case when next_status = 'draft' then i.review_reason end,
        submitted_at = case when next_status <> 'draft' then now() end
    where i.id = idea;
    update public.idea_details d
    set description = clean_description, business_model = clean_model, market = clean_market,
        financials = clean_financials, team = clean_team
    where d.idea_id = idea;
    saved := idea;
  end if;

  return query select next_status, saved;
end;
$$;

-- Staff decide an idea waiting for moderation. A rejected idea goes back to Draft with the reason.
create function access.decide_idea(idea uuid, approve boolean, reason text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  post public.ideas;
  clean_reason text := nullif(btrim(coalesce(reason, '')), '');
begin
  if not (select access.is_staff()) then
    raise exception 'not_allowed';
  end if;
  select * into post from public.ideas i where i.id = idea for update;
  if not found then
    return 'not_found';
  end if;
  if post.status <> 'pending_moderation' then
    return 'already_decided';
  end if;
  if approve then
    update public.ideas set status = 'published', published_at = now(), review_reason = null where id = idea;
    perform private.notify(post.owner_id, 'O5', jsonb_build_object('title', post.title, 'idea_id', post.id::text));
    return 'ok';
  end if;
  if clean_reason is null or char_length(clean_reason) > 600 then
    return 'reason_required';
  end if;
  if private.holds_contact_details(jsonb_build_object('reason', clean_reason)) then
    return 'reason_has_contact_details';
  end if;
  update public.ideas set status = 'draft', review_reason = clean_reason, submitted_at = null where id = idea;
  perform private.notify(post.owner_id, 'O6',
                         jsonb_build_object('title', post.title, 'reason', clean_reason, 'idea_id', post.id::text));
  return 'ok';
end;
$$;

-- The owner archives a published idea: it leaves the pool. Archiving is final; a new idea can be shared.
create function access.archive_idea(idea uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  post public.ideas;
begin
  select * into post from public.ideas i where i.id = idea for update;
  if not found or post.owner_id <> auth.uid() or not (select access.is_member()) then
    return 'not_found';
  end if;
  if post.status not in ('published', 'draft') then
    return 'not_archivable';
  end if;
  update public.ideas set status = 'archived', archived_at = now() where id = idea;
  return 'ok';
end;
$$;

-- Ideas waiting for moderation, with their details, for staff.
create function access.idea_review_queue()
returns table (idea_id uuid, title text, problem text, sector_en text, sector_sw text, stage text, seeking text,
               investment_min_tzs bigint, investment_max_tzs bigint, show_owner boolean, description text,
               business_model text, market text, financials text, team text, owner_username text,
               submitted_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.id, i.title, i.problem, s.name_en, s.name_sw, i.stage, i.seeking, i.investment_min_tzs,
         i.investment_max_tzs, i.show_owner, d.description, d.business_model, d.market, d.financials, d.team,
         m.username::text, i.submitted_at
  from public.ideas i
  join public.sectors s on s.id = i.sector_id
  join public.idea_details d on d.idea_id = i.id
  join public.members m on m.id = i.owner_id
  where i.status = 'pending_moderation' and (select access.is_staff())
  order by i.submitted_at;
$$;

revoke all on function access.save_idea(uuid, text, text, uuid, text, text, bigint, bigint, boolean, text, text, text,
                                        text, text, boolean),
  access.decide_idea(uuid, boolean, text), access.archive_idea(uuid), access.idea_review_queue()
  from public, anon;
grant execute on function access.save_idea(uuid, text, text, uuid, text, text, bigint, bigint, boolean, text, text,
                                           text, text, text, boolean),
  access.decide_idea(uuid, boolean, text), access.archive_idea(uuid), access.idea_review_queue()
  to authenticated;

create function public.save_idea(
  idea uuid, title text, problem text, sector uuid, stage text, seeking text, investment_min bigint,
  investment_max bigint, show_owner boolean, description text, business_model text, market text,
  financials text, team text, submit boolean
) returns table (result text, idea_id uuid)
language sql volatile security invoker set search_path = '' as $$
  select * from access.save_idea(idea, title, problem, sector, stage, seeking, investment_min, investment_max,
                                 show_owner, description, business_model, market, financials, team, submit);
$$;
create function public.decide_idea(idea uuid, approve boolean, reason text) returns text
language sql volatile security invoker set search_path = '' as $$ select access.decide_idea(idea, approve, reason); $$;
create function public.archive_idea(idea uuid) returns text
language sql volatile security invoker set search_path = '' as $$ select access.archive_idea(idea); $$;
create function public.idea_review_queue()
returns table (idea_id uuid, title text, problem text, sector_en text, sector_sw text, stage text, seeking text,
               investment_min_tzs bigint, investment_max_tzs bigint, show_owner boolean, description text,
               business_model text, market text, financials text, team text, owner_username text,
               submitted_at timestamptz)
language sql stable security invoker set search_path = '' as $$ select * from access.idea_review_queue(); $$;

revoke all on function public.save_idea(uuid, text, text, uuid, text, text, bigint, bigint, boolean, text, text, text,
                                        text, text, boolean),
  public.decide_idea(uuid, boolean, text), public.archive_idea(uuid), public.idea_review_queue()
  from public, anon;
grant execute on function public.save_idea(uuid, text, text, uuid, text, text, bigint, bigint, boolean, text, text,
                                           text, text, text, boolean),
  public.decide_idea(uuid, boolean, text), public.archive_idea(uuid), public.idea_review_queue()
  to authenticated;
