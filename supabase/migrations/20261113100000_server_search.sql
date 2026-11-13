-- R23: the Search page finds opportunities and training on the server. A search needs at least 2 letters and
-- every word must appear somewhere in the post or training (case ignored, matched as plain text). What a member
-- can see is the same as in opportunity_list and trainings_feed.

create function private.has_all_words(haystack text, q text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(bool_and(position(w in lower(coalesce(has_all_words.haystack, ''))) > 0), false)
  from regexp_split_to_table(lower(btrim(coalesce(has_all_words.q, ''))), '\s+') w
  where w <> '';
$$;
revoke all on function private.has_all_words(text, text) from public, anon, authenticated;

create function access.search_opportunities(q text)
returns table (id uuid, type text, title text, role text, employment_type text, remote boolean, region_en text,
               region_sw text, district_en text, district_sw text, sector_id uuid, sector_en text, sector_sw text,
               closing_at date, published_at timestamptz, featured boolean, poster_id uuid, poster_name text,
               is_mine boolean, skills text[])
language sql stable security definer set search_path = '' as $$
  select c.id, c.type, c.title, c.role, c.employment_type, c.remote, c.region_en, c.region_sw, c.district_en,
         c.district_sw, c.sector_id, c.sector_en, c.sector_sw, c.closing_at, c.published_at, c.featured, c.poster_id,
         c.poster_name, c.is_mine, c.skills
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
               is_mine boolean, skills text[])
language sql stable security invoker set search_path = '' as $$ select * from access.search_opportunities(q); $$;
revoke all on function public.search_opportunities(text) from public, anon;
grant execute on function public.search_opportunities(text) to authenticated;

create function access.search_trainings(q text)
returns table (training_id uuid, title text, provider text, format text, details text, venue text,
               starts_at timestamptz, seats int, registered int, downloads_allowed boolean, status text,
               review_reason text, is_mine boolean, my_status text, my_waitlist_position int)
language sql stable security definer set search_path = '' as $$
  select f.training_id, f.title, f.provider, f.format, f.details, f.venue, f.starts_at, f.seats, f.registered,
         f.downloads_allowed, f.status, f.review_reason, f.is_mine, f.my_status, f.my_waitlist_position
  from access.trainings_feed() f
  where f.status = 'published'
    and char_length(btrim(coalesce(search_trainings.q, ''))) >= 2
    and private.has_all_words(concat_ws(' ', f.title, f.provider, f.details, f.venue), search_trainings.q)
  limit 20;
$$;
revoke all on function access.search_trainings(text) from public, anon;
grant execute on function access.search_trainings(text) to authenticated;

create function public.search_trainings(q text)
returns table (training_id uuid, title text, provider text, format text, details text, venue text,
               starts_at timestamptz, seats int, registered int, downloads_allowed boolean, status text,
               review_reason text, is_mine boolean, my_status text, my_waitlist_position int)
language sql stable security invoker set search_path = '' as $$ select * from access.search_trainings(q); $$;
revoke all on function public.search_trainings(text) from public, anon;
grant execute on function public.search_trainings(text) to authenticated;
