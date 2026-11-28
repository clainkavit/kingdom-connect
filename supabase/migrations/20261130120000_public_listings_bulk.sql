-- O22: staff approve several public listings at once. Each is approved with its own suggestions (region and district,
-- sector, closing date, translation), no skills, a job as Full-time (decided 28 Nov 2026, #382). A listing that still
-- needs a region, a sector or a closing date is left waiting for staff to finish it one by one. Each approval writes
-- its own audit entry through approve_public_listing. The answer is each waiting listing with the result it got
-- (ok, closing_date or place_and_sector).

create function access.approve_public_listings(listings uuid[])
returns table (listing_id uuid, outcome text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  item public.public_listings;
begin
  if not (select access.is_staff()) then
    raise exception 'not_allowed';
  end if;
  for item in
    select l.* from public.public_listings l
    where l.id = any(coalesce(approve_public_listings.listings, '{}')) and l.status = 'waiting'
    order by l.created_at
  loop
    return query
    select item.id, a.result
    from access.approve_public_listing(item.id, item.suggested_region_id, item.suggested_district_id, false,
                                       item.suggested_sector_id, '{}', null, 'full_time') a;
  end loop;
end;
$$;
revoke all on function access.approve_public_listings(uuid[]) from public, anon;
grant execute on function access.approve_public_listings(uuid[]) to authenticated;

create function public.approve_public_listings(listings uuid[])
returns table (listing_id uuid, outcome text)
language sql volatile security invoker set search_path = '' as $$
  select * from access.approve_public_listings(listings);
$$;
revoke all on function public.approve_public_listings(uuid[]) from public, anon;
grant execute on function public.approve_public_listings(uuid[]) to authenticated;
