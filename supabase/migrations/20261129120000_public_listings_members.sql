-- O21: what members see of an approved public listing. The poster is the source (NeST, Ajira, a company), the
-- detail carries the official link and the fee note, and nobody can respond in the app: members apply on the
-- official site. Every verified member gets the link, tenders included (decided 28 Nov 2026, #375).

create or replace view private.opportunity_cards as
  select o.id, o.type, o.title, o.role, o.employment_type, o.remote, o.description, o.status, o.closing_at,
         o.published_at, o.created_at, o.featured_at is not null as featured, o.sector_id, o.region_id, o.district_id,
         o.poster_member_id = (select auth.uid()) as is_mine,
         sec.name_en as sector_en, sec.name_sw as sector_sw,
         reg.name_en as region_en, reg.name_sw as region_sw, dis.name_en as district_en, dis.name_sw as district_sw,
         case when o.poster_member_id is null then null
              when seen.visible then o.poster_member_id end as poster_id,
         case when pls.name is not null then pls.name
              when o.poster_member_id is null
                then (select s.value #>> '{}' from public.platform_settings s where s.key = 'platform_name')
              when seen.visible then coalesce(b.name, nullif(btrim(p.full_name), ''), m.username::text)
              else m.username::text end as poster_name,
         coalesce((select array_agg(sk.name::text order by sk.name)
                   from public.opportunity_skills os join public.skills sk on sk.id = os.skill_id
                   where os.opportunity_id = o.id), '{}') as skills,
         (not exists (select 1 from public.reports r
                      where r.target_type = 'opportunity' and r.target_id = o.id and r.status in ('open', 'under_review'))
          and (o.poster_member_id is null
               or (m.status = 'approved' and not access.is_blocked(o.poster_member_id, (select auth.uid()))))) as listable,
         (o.closing_at > private.tanzania_today()
          or (o.closing_at = private.tanzania_today()
              and (o.type <> 'tender'
                   or (now() at time zone 'Africa/Dar_es_Salaam')::time
                      <= coalesce((select td.closing_time from public.tender_details td where td.opportunity_id = o.id),
                                  time '23:59:59')))) as open_now,
         pls.name as public_source, pl.original_url as official_url, pl.fee_note
  from public.opportunities o
  left join public.sectors sec on sec.id = o.sector_id
  left join public.regions reg on reg.id = o.region_id
  left join public.districts dis on dis.id = o.district_id
  left join public.members m on m.id = o.poster_member_id
  left join public.profiles p on p.member_id = o.poster_member_id
  left join public.businesses b on b.member_id = o.poster_member_id and b.status = 'approved'
  left join public.public_listings pl on pl.opportunity_id = o.id
  left join public.public_listing_sources pls on pls.id = pl.source_id
  cross join lateral (
    select o.poster_member_id is not null
       and (not coalesce(p.hidden_from_directory, false) or access.is_connected(o.poster_member_id, (select auth.uid())))
       as visible) seen;


-- The list, detail and Search say which source a public listing came from.
drop function public.opportunity_list(text, uuid, uuid, boolean, uuid, text, int, int, boolean, text);
drop function access.opportunity_list(text, uuid, uuid, boolean, uuid, text, int, int, boolean, text);
drop function public.opportunity_detail(uuid);
drop function access.opportunity_detail(uuid);
drop function public.search_opportunities(text);
drop function access.search_opportunities(text);

create function access.opportunity_list(kind text default null, region uuid default null,
                                        district uuid default null, remote_only boolean default false,
                                        sector uuid default null, employment text default null,
                                        posted_within int default null, page int default 0,
                                        best boolean default false, q text default null)
returns table (id uuid, type text, title text, role text, employment_type text, remote boolean, region_en text,
               region_sw text, district_en text, district_sw text, sector_id uuid, sector_en text, sector_sw text,
               closing_at date, published_at timestamptz, featured boolean, poster_id uuid, poster_name text,
               is_mine boolean, skills text[], skills_total int, skills_matched int, summary text,
               skills_mine text[], poster_verified boolean, reasons jsonb, public_source text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.type, p.title, p.role, p.employment_type, p.remote, p.region_en, p.region_sw, p.district_en,
         p.district_sw, p.sector_id, p.sector_en, p.sector_sw, p.closing_at, p.published_at, p.featured,
         case when (select access.is_member()) then p.poster_id end,
         p.poster_name, p.is_mine, p.skills, p.total, p.matched,
         left(btrim(regexp_replace(coalesce(p.description, ''), '\s+', ' ', 'g')), 180), p.mine,
         exists (select 1 from public.businesses b
                 where b.member_id = p.poster_id and b.status = 'approved' and b.level >= 2),
         x.reasons, p.public_source
  from (
    select c.*, m.total, m.matched, m.mine,
           row_number() over (
             order by case when coalesce(opportunity_list.best, false) then m.matched end desc nulls last,
                      case when coalesce(opportunity_list.best, false) and m.total > 0
                           then m.matched::numeric / m.total end desc nulls last,
                      c.featured desc, c.published_at desc, c.id) as ord
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
    order by ord
    limit 20 offset greatest(coalesce(opportunity_list.page, 0), 0) * 20
  ) p
  left join lateral (
    select o.reasons from private.opportunity_match(p.id, (select auth.uid())) o
    where (select access.is_member()) and not p.is_mine and o.listed) x on true
  order by p.ord;
$$;
revoke all on function access.opportunity_list(text, uuid, uuid, boolean, uuid, text, int, int, boolean, text)
  from public, anon;
grant execute on function access.opportunity_list(text, uuid, uuid, boolean, uuid, text, int, int, boolean, text)
  to authenticated;

create function public.opportunity_list(kind text default null, region uuid default null, district uuid default null,
                                        remote_only boolean default false, sector uuid default null,
                                        employment text default null, posted_within int default null,
                                        page int default 0, best boolean default false, q text default null)
returns table (id uuid, type text, title text, role text, employment_type text, remote boolean, region_en text,
               region_sw text, district_en text, district_sw text, sector_id uuid, sector_en text, sector_sw text,
               closing_at date, published_at timestamptz, featured boolean, poster_id uuid, poster_name text,
               is_mine boolean, skills text[], skills_total int, skills_matched int, summary text,
               skills_mine text[], poster_verified boolean, reasons jsonb, public_source text)
language sql stable security invoker set search_path = '' as $$
  select * from access.opportunity_list(kind, region, district, remote_only, sector, employment, posted_within, page,
                                        best, q);
$$;
revoke all on function public.opportunity_list(text, uuid, uuid, boolean, uuid, text, int, int, boolean, text)
  from public, anon;
grant execute on function public.opportunity_list(text, uuid, uuid, boolean, uuid, text, int, int, boolean, text)
  to authenticated;

-- The official link goes only to verified members: someone who only looks reads the post but does not act.
create function access.opportunity_detail(opportunity uuid)
returns table (id uuid, type text, title text, role text, employment_type text, remote boolean, description text,
               status text, region_en text, region_sw text, district_en text, district_sw text, sector_id uuid,
               sector_en text, sector_sw text, closing_at date, published_at timestamptz, featured boolean,
               poster_id uuid, poster_name text, is_mine boolean, skills text[], read_only boolean,
               public_source text, official_url text, fee_note text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.type, c.title, c.role, c.employment_type, c.remote, c.description, c.status, c.region_en,
         c.region_sw, c.district_en, c.district_sw, c.sector_id, c.sector_en, c.sector_sw, c.closing_at,
         c.published_at, c.featured, case when (select access.is_member()) then c.poster_id end, c.poster_name,
         c.is_mine, c.skills, c.status <> 'published' or not c.open_now,
         c.public_source, case when (select access.is_member()) then c.official_url end, c.fee_note
  from private.opportunity_cards c
  where c.id = opportunity_detail.opportunity and (select access.can_read_listings())
    and (c.is_mine or (c.listable and c.status in ('published', 'closed', 'expired')));
$$;
revoke all on function access.opportunity_detail(uuid) from public, anon;
grant execute on function access.opportunity_detail(uuid) to authenticated;

create function public.opportunity_detail(opportunity uuid)
returns table (id uuid, type text, title text, role text, employment_type text, remote boolean, description text,
               status text, region_en text, region_sw text, district_en text, district_sw text, sector_id uuid,
               sector_en text, sector_sw text, closing_at date, published_at timestamptz, featured boolean,
               poster_id uuid, poster_name text, is_mine boolean, skills text[], read_only boolean,
               public_source text, official_url text, fee_note text)
language sql stable security invoker set search_path = '' as $$ select * from access.opportunity_detail(opportunity); $$;
revoke all on function public.opportunity_detail(uuid) from public, anon;
grant execute on function public.opportunity_detail(uuid) to authenticated;

create function access.search_opportunities(q text)
returns table (id uuid, type text, title text, role text, employment_type text, remote boolean, region_en text,
               region_sw text, district_en text, district_sw text, sector_id uuid, sector_en text, sector_sw text,
               closing_at date, published_at timestamptz, featured boolean, poster_id uuid, poster_name text,
               is_mine boolean, skills text[], public_source text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.type, c.title, c.role, c.employment_type, c.remote, c.region_en, c.region_sw, c.district_en,
         c.district_sw, c.sector_id, c.sector_en, c.sector_sw, c.closing_at, c.published_at, c.featured, c.poster_id,
         c.poster_name, c.is_mine, c.skills, c.public_source
  from private.opportunity_cards c
  where (select access.is_member()) and c.status = 'published' and c.open_now and c.listable
    and char_length(btrim(coalesce(search_opportunities.q, ''))) >= 2
    and private.has_all_words(concat_ws(' ', c.title, c.role, c.description, c.poster_name,
                                        array_to_string(c.skills, ' ')), search_opportunities.q)
  order by c.featured desc, c.published_at desc, c.id
  limit 20;
$$;
revoke all on function access.search_opportunities(text) from public, anon;
grant execute on function access.search_opportunities(text) to authenticated;

create function public.search_opportunities(q text)
returns table (id uuid, type text, title text, role text, employment_type text, remote boolean, region_en text,
               region_sw text, district_en text, district_sw text, sector_id uuid, sector_en text, sector_sw text,
               closing_at date, published_at timestamptz, featured boolean, poster_id uuid, poster_name text,
               is_mine boolean, skills text[], public_source text)
language sql stable security invoker set search_path = '' as $$ select * from access.search_opportunities(q); $$;
revoke all on function public.search_opportunities(text) from public, anon;
grant execute on function public.search_opportunities(text) to authenticated;

-- Nobody responds to a public listing in the app; the answer is public_listing.
create or replace function access.respond_to_opportunity(opportunity uuid, note text, attachment_path text)
returns table (result text, response_id uuid)
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  post private.opportunity_cards;
  poster uuid;
  clean_note text := btrim(coalesce(note, ''));
  stored_size bigint;
  saved uuid;
  response_kind text;
begin
  if not (select access.is_member()) then
    raise exception 'not_allowed';
  end if;
  select * into post from private.opportunity_cards c where c.id = opportunity;
  if not found or post.status <> 'published' or not post.open_now or not post.listable then
    return query select 'not_open'::text, null::uuid; return;
  end if;
  if exists (select 1 from public.public_listings l where l.opportunity_id = opportunity) then
    return query select 'public_listing'::text, null::uuid; return;
  end if;
  select o.poster_member_id into poster from public.opportunities o where o.id = opportunity;
  if poster = me then
    return query select 'own_post'::text, null::uuid; return;
  end if;
  if exists (select 1 from public.opportunities o where o.id = opportunity and o.find_mode = 'pick') then
    return query select 'picked_post'::text, null::uuid; return;
  end if;
  if post.type = 'tender' and access.member_level(me) < 2 then
    return query select 'level2_required'::text, null::uuid; return;
  end if;
  if exists (select 1 from public.responses r where r.opportunity_id = opportunity and r.member_id = me) then
    return query select 'already_responded'::text, null::uuid; return;
  end if;
  if char_length(clean_note) > 2000 then
    return query select 'invalid_note'::text, null::uuid; return;
  end if;
  if private.holds_contact_details(jsonb_build_object('note', clean_note)) then
    return query select 'contact_details'::text, null::uuid; return;
  end if;
  if attachment_path is not null then
    select nullif(o.metadata ->> 'size', '')::bigint into stored_size
    from storage.objects o where o.bucket_id = 'response-files' and o.name = attachment_path;
    if attachment_path !~ ('^' || me::text || '/[0-9a-f-]{36}\.pdf$') or stored_size is null
       or stored_size not between 1 and 5242880 then
      return query select 'invalid_attachment'::text, null::uuid; return;
    end if;
  end if;
  response_kind := case when post.type = 'job' then 'application' else 'interest' end;
  begin
    insert into public.responses (opportunity_id, member_id, kind, note, attachment_path)
    values (opportunity, me, response_kind, clean_note, attachment_path) returning id into saved;
  exception when unique_violation then
    return query select 'already_responded'::text, null::uuid; return;
  end;
  if poster is not null then
    insert into public.message_threads (member_a, member_b, opportunity_id)
    values (least(me, poster), greatest(me, poster), opportunity)
    on conflict do nothing;
    perform private.notify(poster, case when response_kind = 'application' then 'O1' else 'O2' end,
      jsonb_build_object('name', private.viewer_name(me), 'title', post.title, 'opportunity_id', opportunity::text,
                         'response_id', saved::text));
  end if;
  return query select 'ok'::text, saved;
end;
$$;

