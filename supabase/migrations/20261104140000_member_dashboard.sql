create function access.member_dashboard()
returns table (full_name text, region_en text, region_sw text, district_en text, district_sw text, level int,
               posting_paused boolean)
language sql stable security definer set search_path = '' as $$
  select coalesce(p.full_name, m.username::text), r.name_en, r.name_sw, d.name_en, d.name_sw,
         access.member_level(m.id), coalesce(m.posting_suspended_until > now(), false)
  from public.members m
  left join public.profiles p on p.member_id = m.id
  left join public.regions r on r.id = p.region_id
  left join public.districts d on d.id = p.district_id
  where m.id = auth.uid() and (select access.is_member());
$$;
revoke all on function access.member_dashboard() from public, anon;
grant execute on function access.member_dashboard() to authenticated;

create function public.member_dashboard()
returns table (full_name text, region_en text, region_sw text, district_en text, district_sw text, level int,
               posting_paused boolean)
language sql stable security invoker set search_path = '' as $$
  select * from access.member_dashboard();
$$;
revoke all on function public.member_dashboard() from public, anon;
grant execute on function public.member_dashboard() to authenticated;
