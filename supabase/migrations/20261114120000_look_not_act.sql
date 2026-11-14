-- R27 (decided 14 Nov 2026, PRD section 3): someone who got in but is not verified looks, but does not act. A
-- signed-in, pending or rejected account that has accepted the current terms reads opportunity, idea, training,
-- event and news summaries. It never reaches profiles, the directory, connections, messages, responses or any
-- write, and never learns a poster's or owner's member id, a tender document or an online event's link. Every function that acts keeps checking is_member().

alter table public.members drop constraint members_status_check;
alter table public.members add constraint members_status_check
  check (status in ('signed_in', 'pending', 'approved', 'rejected', 'suspended', 'deactivated', 'deleted'));

create function access.is_looker() returns boolean
language sql stable security definer set search_path = '' as $$
  select access.otp_verified()
     and exists (select 1 from public.members m
                 where m.id = auth.uid() and m.status in ('signed_in', 'pending', 'rejected'));
$$;

create function access.can_look() returns boolean
language sql stable security definer set search_path = '' as $$
  select access.is_looker() and access.accepted_terms_and_privacy();
$$;

create function access.can_read_listings() returns boolean
language sql stable security definer set search_path = '' as $$
  select access.is_member() or access.can_look();
$$;

revoke all on function access.is_looker(), access.can_look(), access.can_read_listings() from public, anon;
grant execute on function access.is_looker(), access.can_look(), access.can_read_listings() to authenticated;

-- A looker reads and adds their own acceptances, so S07 asks only for what they have not accepted.
drop policy "base rule" on public.legal_acceptances;
create policy "base rule" on public.legal_acceptances as restrictive for all to authenticated
  using ((select access.is_approved_member()) or (select access.is_looker()) or (select access.is_staff()))
  with check ((select access.is_approved_member()) or (select access.is_looker()) or (select access.is_staff()));

create or replace function access.opportunity_list(kind text default null, region uuid default null,
                                                   district uuid default null, remote_only boolean default false,
                                                   sector uuid default null, employment text default null,
                                                   posted_within int default null, page int default 0,
                                                   best boolean default false, q text default null)
returns table (id uuid, type text, title text, role text, employment_type text, remote boolean, region_en text,
               region_sw text, district_en text, district_sw text, sector_id uuid, sector_en text, sector_sw text,
               closing_at date, published_at timestamptz, featured boolean, poster_id uuid, poster_name text,
               is_mine boolean, skills text[], skills_total int, skills_matched int, summary text,
               skills_mine text[])
language sql stable security definer set search_path = '' as $$
  select c.id, c.type, c.title, c.role, c.employment_type, c.remote, c.region_en, c.region_sw, c.district_en,
         c.district_sw, c.sector_id, c.sector_en, c.sector_sw, c.closing_at, c.published_at, c.featured,
         case when (select access.is_member()) then c.poster_id end,
         c.poster_name, c.is_mine, c.skills, m.total, m.matched,
         left(btrim(regexp_replace(coalesce(c.description, ''), '\s+', ' ', 'g')), 180), m.mine
  from private.opportunity_cards c
  cross join lateral (
    select count(*)::int as total,
           count(*) filter (where mine.has)::int as matched,
           coalesce(array_agg(sk.name::text order by sk.name) filter (where mine.has), '{}') as mine
    from public.opportunity_skills os
    join public.skills sk on sk.id = os.skill_id
    cross join lateral (
      select exists (select 1 from public.profile_skills ps
                     where ps.member_id = (select auth.uid()) and ps.skill_id = os.skill_id) as has) mine
    where os.opportunity_id = c.id) m
  where (select access.can_read_listings()) and c.status = 'published' and c.open_now
    and c.listable
    and (opportunity_list.kind is null or c.type = opportunity_list.kind)
    and (not coalesce(opportunity_list.remote_only, false) or c.remote)
    and (opportunity_list.region is null or c.region_id = opportunity_list.region)
    and (opportunity_list.district is null or c.district_id = opportunity_list.district)
    and (opportunity_list.sector is null or c.sector_id = opportunity_list.sector)
    and (opportunity_list.employment is null or c.employment_type = opportunity_list.employment)
    and (opportunity_list.posted_within is null
         or c.published_at >= now() - make_interval(days => greatest(opportunity_list.posted_within, 0)))
    and (btrim(coalesce(opportunity_list.q, '')) = ''
         or private.has_all_words(concat_ws(' ', c.title, c.role, c.description, c.poster_name, c.region_en,
                                            c.region_sw, c.district_en, c.district_sw,
                                            array_to_string(c.skills, ' ')), opportunity_list.q))
  order by case when coalesce(opportunity_list.best, false) then m.matched end desc nulls last,
           case when coalesce(opportunity_list.best, false) and m.total > 0
                then m.matched::numeric / m.total end desc nulls last,
           c.featured desc, c.published_at desc, c.id
  limit 20 offset greatest(coalesce(opportunity_list.page, 0), 0) * 20;
$$;

create or replace function access.opportunity_detail(opportunity uuid)
returns table (id uuid, type text, title text, role text, employment_type text, remote boolean, description text,
               status text, region_en text, region_sw text, district_en text, district_sw text, sector_id uuid,
               sector_en text, sector_sw text, closing_at date, published_at timestamptz, featured boolean,
               poster_id uuid, poster_name text, is_mine boolean, skills text[], read_only boolean)
language sql stable security definer set search_path = '' as $$
  select c.id, c.type, c.title, c.role, c.employment_type, c.remote, c.description, c.status, c.region_en,
         c.region_sw, c.district_en, c.district_sw, c.sector_id, c.sector_en, c.sector_sw, c.closing_at,
         c.published_at, c.featured, case when (select access.is_member()) then c.poster_id end, c.poster_name,
         c.is_mine, c.skills, c.status <> 'published' or not c.open_now
  from private.opportunity_cards c
  where c.id = opportunity_detail.opportunity and (select access.can_read_listings())
    and (c.is_mine or (c.listable and c.status in ('published', 'closed', 'expired')));
$$;

create or replace function access.opportunity_tender(opportunity uuid)
returns table (issuing_org text, reference_no text, scope text, eligibility text, required_documents text[],
               closing_time time, estimated_value_tzs bigint, document_path text)
language sql stable security definer set search_path = '' as $$
  select d.issuing_org, d.reference_no, d.scope, d.eligibility, d.required_documents, d.closing_time,
         d.estimated_value_tzs, case when access.can_see_opportunity(d.opportunity_id) then d.document_path end
  from public.tender_details d
  where d.opportunity_id = opportunity_tender.opportunity
    and (access.can_see_opportunity(d.opportunity_id)
         or ((select access.can_look())
             and exists (select 1 from private.opportunity_cards c
                         where c.id = d.opportunity_id and c.listable
                           and c.status in ('published', 'closed', 'expired'))));
$$;

create or replace function access.dashboard_latest(tab text default 'all', max_rows int default 6)
returns table (item_kind text, item_id uuid, title text, subtype text, sector_en text, sector_sw text,
               published_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select x.item_kind, x.item_id, x.title, x.subtype, x.sector_en, x.sector_sw, x.published_at
  from (
    select 'opportunity'::text as item_kind, c.id as item_id, c.title, c.type as subtype, c.sector_en, c.sector_sw,
           c.published_at
    from private.opportunity_cards c
    where c.status = 'published' and c.open_now and c.listable
      and (dashboard_latest.tab = 'all' or (dashboard_latest.tab = 'jobs' and c.type = 'job')
           or (dashboard_latest.tab = 'tenders' and c.type = 'tender')
           or (dashboard_latest.tab = 'investments' and c.type = 'investment'))
    union all
    select 'training', tr.id, tr.title, tr.format, null, null, tr.published_at
    from public.trainings tr
    where tr.status = 'published' and (tr.starts_at is null or tr.starts_at > now() - interval '3 hours')
      and dashboard_latest.tab in ('all', 'training')
    union all
    select 'idea', s.id, s.title, s.stage, s.sector_en, s.sector_sw, s.published_at
    from public.idea_summaries s
    where dashboard_latest.tab in ('all', 'ideas')
  ) x
  where (select access.can_read_listings())
  order by x.published_at desc nulls last, x.item_id
  limit greatest(1, least(coalesce(max_rows, 6), 20));
$$;

create or replace function access.featured_for_members()
returns table (id uuid, type text, title text, sector_en text, sector_sw text, poster_name text, closing_at date)
language sql stable security definer set search_path = '' as $$
  select c.id, c.type, c.title, c.sector_en, c.sector_sw, c.poster_name, c.closing_at
  from private.opportunity_cards c
  where c.featured and c.status = 'published' and c.open_now and c.listable
    and (select access.can_read_listings())
  order by c.published_at desc
  limit 5;
$$;

create or replace function access.trainings_feed()
returns table (training_id uuid, title text, provider text, format text, details text, venue text,
               starts_at timestamptz, seats int, registered int, downloads_allowed boolean, status text,
               review_reason text, is_mine boolean, my_status text, my_waitlist_position int)
language sql stable security definer set search_path = '' as $$
  select tr.id, tr.title, tr.provider, tr.format, tr.details, tr.venue, tr.starts_at, tr.seats,
         (select count(*)::int from public.registrations r where r.training_id = tr.id and r.status = 'registered'),
         tr.downloads_allowed, tr.status, case when tr.poster_member_id = auth.uid() then tr.review_reason end,
         tr.poster_member_id = auth.uid(), mine.status, mine.waitlist_position
  from public.trainings tr
  left join public.registrations mine
    on mine.training_id = tr.id and mine.member_id = auth.uid() and mine.status in ('registered', 'waitlisted')
  where (select access.can_read_listings())
    and ((tr.status = 'published' and (tr.starts_at is null or tr.starts_at > now() - interval '3 hours'))
         or (tr.poster_member_id = auth.uid() and tr.status in ('draft', 'pending_review')))
  order by tr.starts_at nulls last, tr.published_at desc;
$$;

create or replace function access.events_feed()
returns table (event_id uuid, title text, details text, starts_at timestamptz, venue text, link text, capacity int,
               registered int, status text, review_reason text, is_mine boolean, my_status text,
               my_waitlist_position int)
language sql stable security definer set search_path = '' as $$
  select e.id, e.title, e.details, e.starts_at, e.venue,
         case when (select access.is_member()) or (select access.is_staff()) then e.link end, e.capacity,
         (select count(*)::int from public.registrations r where r.event_id = e.id and r.status = 'registered'),
         e.status, case when e.poster_member_id = auth.uid() then e.review_reason end,
         e.poster_member_id = auth.uid(), mine.status, mine.waitlist_position
  from public.events e
  left join public.registrations mine
    on mine.event_id = e.id and mine.member_id = auth.uid() and mine.status in ('registered', 'waitlisted')
  where (select access.can_read_listings())
    and ((e.status = 'published' and e.starts_at > now() - interval '3 hours')
         or (e.poster_member_id = auth.uid() and e.status in ('draft', 'pending_review')))
  order by e.starts_at;
$$;

create or replace view public.idea_summaries with (security_barrier = true) as
  select i.id, i.title, i.problem, i.sector_id, s.name_en as sector_en, s.name_sw as sector_sw, i.stage, i.seeking,
         i.investment_min_tzs, i.investment_max_tzs,
         case when i.show_owner and ((select access.is_member()) or (select access.is_staff())) then i.owner_id end
           as owner_id,
         case when i.show_owner then coalesce(p.full_name, m.username::text) end as owner_name,
         (select count(*)::int from public.idea_access_requests r where r.idea_id = i.id) as interest_count,
         i.published_at,
         i.owner_id = (select auth.uid()) as is_mine
  from public.ideas i
  join public.sectors s on s.id = i.sector_id
  join public.members m on m.id = i.owner_id
  left join public.profiles p on p.member_id = i.owner_id
  where i.status = 'published' and m.status = 'approved'
    and ((select access.can_read_listings()) or (select access.is_staff()))
    and not access.is_blocked(i.owner_id, (select auth.uid()));

drop policy "base rule" on public.news_items;
create policy "base rule" on public.news_items as restrictive for all to authenticated
  using ((select access.can_read_listings()) or (select access.is_staff()))
  with check ((select access.is_member()) or (select access.is_staff()));
drop policy "published to members, everything to staff" on public.news_items;
create policy "published to members, everything to staff" on public.news_items for select to authenticated
  using ((status = 'published' and (select access.can_read_listings())) or (select access.is_staff()));

create policy "public media: lookers read news images" on storage.objects for select to authenticated
  using (bucket_id = 'public-media' and name like 'news/%' and (select access.can_look()));
