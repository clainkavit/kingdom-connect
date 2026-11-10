-- D05: the admin Ideas overview (A17, decided 10 Nov 2026, #186). Staff see ideas in brief: counts, ideas by stage
-- and by industry, interest to NDA this month, and a list of every idea with search and filters. It shows who
-- posted each idea, also one shared without a name, but never the confidential details (those stay in moderation,
-- or open after a report) and never who is interested: interest and access are counts only. Staff only. The ideas
-- waiting for moderation come from idea_review_queue() (I01).

create function access.admin_ideas_overview()
returns table (published int, waiting int, hidden int, archived int, by_stage jsonb, by_industry jsonb,
               interest_sent int, owner_approved int, nda_accepted int)
language sql stable security definer set search_path = '' as $$
  with month_start as (
    select (date_trunc('month', now() at time zone 'Africa/Dar_es_Salaam') at time zone 'Africa/Dar_es_Salaam') as at
  )
  select (select count(*)::int from public.ideas i where i.status = 'published'),
         (select count(*)::int from public.ideas i where i.status = 'pending_moderation'),
         (select count(*)::int from public.ideas i where i.status = 'hidden'),
         (select count(*)::int from public.ideas i where i.status = 'archived'),
         (select coalesce(jsonb_object_agg(x.stage, x.n), '{}') from (
            select i.stage, count(*)::int as n from public.ideas i where i.status = 'published' group by i.stage) x),
         (select coalesce(jsonb_agg(jsonb_build_object('sector_en', x.name_en, 'sector_sw', x.name_sw, 'ideas', x.n)
                                    order by x.n desc, x.name_en), '[]') from (
            select s.name_en, s.name_sw, count(*)::int as n from public.ideas i join public.sectors s on s.id = i.sector_id
            where i.status = 'published' group by s.name_en, s.name_sw) x),
         (select count(*)::int from public.idea_access_requests r, month_start m where r.created_at >= m.at),
         (select count(*)::int from public.idea_access_requests r, month_start m
          where r.decided_at >= m.at and r.status in ('approved', 'nda_accepted', 'revoked')),
         (select count(*)::int from public.idea_access_requests r
          join public.legal_acceptances a on a.id = r.nda_acceptance_id, month_start m
          where a.accepted_at >= m.at)
  where (select access.is_staff());
$$;

-- A17: every idea in brief, newest activity first, 25 a page. Filters: a word in the title or the poster's name,
-- status, industry and stage.
create function access.admin_ideas_list(query text default null, status text default null, sector uuid default null,
                                        stage text default null, page int default 0)
returns table (idea_id uuid, title text, posted_by text, shared_without_name boolean, sector_en text, sector_sw text,
               stage text, status text, interested int, with_access int, last_activity timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.id, i.title, coalesce(nullif(btrim(p.full_name), ''), m.username::text), not i.show_owner,
         s.name_en, s.name_sw, i.stage, i.status,
         (select count(*)::int from public.idea_access_requests r where r.idea_id = i.id),
         (select count(*)::int from public.idea_access_requests r where r.idea_id = i.id and r.status = 'nda_accepted'),
         greatest(i.updated_at, (select max(r.updated_at) from public.idea_access_requests r where r.idea_id = i.id))
  from public.ideas i
  join public.members m on m.id = i.owner_id
  join public.sectors s on s.id = i.sector_id
  left join public.profiles p on p.member_id = i.owner_id
  where (select access.is_staff()) and i.status <> 'draft'
    and (nullif(btrim(admin_ideas_list.query), '') is null
         or i.title ilike access.like_pattern(btrim(admin_ideas_list.query))
         or p.full_name ilike access.like_pattern(btrim(admin_ideas_list.query))
         or m.username::text ilike access.like_pattern(btrim(admin_ideas_list.query)))
    and (admin_ideas_list.status is null or i.status = admin_ideas_list.status)
    and (admin_ideas_list.sector is null or i.sector_id = admin_ideas_list.sector)
    and (admin_ideas_list.stage is null or i.stage = admin_ideas_list.stage)
  order by greatest(i.updated_at, (select max(r.updated_at) from public.idea_access_requests r where r.idea_id = i.id)) desc,
           i.id
  limit 25 offset greatest(coalesce(admin_ideas_list.page, 0), 0) * 25;
$$;

revoke all on function access.admin_ideas_overview(), access.admin_ideas_list(text, text, uuid, text, int) from public, anon;
grant execute on function access.admin_ideas_overview(), access.admin_ideas_list(text, text, uuid, text, int) to authenticated;

create function public.admin_ideas_overview()
returns table (published int, waiting int, hidden int, archived int, by_stage jsonb, by_industry jsonb,
               interest_sent int, owner_approved int, nda_accepted int)
language sql stable security invoker set search_path = '' as $$ select * from access.admin_ideas_overview(); $$;
create function public.admin_ideas_list(query text default null, status text default null, sector uuid default null,
                                        stage text default null, page int default 0)
returns table (idea_id uuid, title text, posted_by text, shared_without_name boolean, sector_en text, sector_sw text,
               stage text, status text, interested int, with_access int, last_activity timestamptz)
language sql stable security invoker set search_path = '' as $$
  select * from access.admin_ideas_list(query, status, sector, stage, page);
$$;
revoke all on function public.admin_ideas_overview(), public.admin_ideas_list(text, text, uuid, text, int) from public, anon;
grant execute on function public.admin_ideas_overview(), public.admin_ideas_list(text, text, uuid, text, int) to authenticated;
