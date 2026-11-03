drop index private.audit_log_created_at;
create index audit_log_newest on private.audit_log (created_at desc, id desc);

create function access.audit_log(actor_staff uuid default null, actor_username text default null,
                                 system_only boolean default false, action_name text default null,
                                 from_date date default null, to_date date default null,
                                 before_at timestamptz default null, before_id uuid default null,
                                 page_size int default 50)
returns table (id uuid, created_at timestamptz, actor_kind text, actor_id uuid, actor_name text, action text, target_type text,
               target_id uuid, before jsonb, after jsonb, ip_address text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select access.is_super_admin()) then
    raise exception 'not_allowed';
  end if;
  return query
  select l.id, l.created_at,
         case when l.actor_staff_id is not null then 'staff'
              when l.actor_member_id is not null then 'member'
              else 'system' end,
         coalesce(l.actor_staff_id, l.actor_member_id),
         coalesce(s.full_name, m.username::text, ''),
         l.action, l.target_type, l.target_id, l.before, l.after, host(l.ip_address)
  from private.audit_log l
  left join public.staff s on s.id = l.actor_staff_id
  left join public.members m on m.id = l.actor_member_id
  where (audit_log.actor_staff is null or l.actor_staff_id = audit_log.actor_staff)
    and (audit_log.actor_username is null or lower(m.username::text) = lower(audit_log.actor_username))
    and (not audit_log.system_only or (l.actor_staff_id is null and l.actor_member_id is null))
    and (audit_log.action_name is null or l.action = audit_log.action_name)
    and (audit_log.from_date is null
         or l.created_at >= (audit_log.from_date::timestamp at time zone 'Africa/Dar_es_Salaam'))
    and (audit_log.to_date is null
         or l.created_at < ((audit_log.to_date + 1)::timestamp at time zone 'Africa/Dar_es_Salaam'))
    and (audit_log.before_at is null or (l.created_at, l.id) < (audit_log.before_at,
                                                                coalesce(audit_log.before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff')))
  order by l.created_at desc, l.id desc
  limit least(greatest(audit_log.page_size, 1), 200);
end;
$$;

create function access.audit_actions() returns setof text
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select access.is_super_admin()) then
    raise exception 'not_allowed';
  end if;
  return query select distinct l.action from private.audit_log l order by 1;
end;
$$;

revoke all on function access.audit_log(uuid, text, boolean, text, date, date, timestamptz, uuid, int),
  access.audit_actions() from public, anon;
grant execute on function access.audit_log(uuid, text, boolean, text, date, date, timestamptz, uuid, int),
  access.audit_actions() to authenticated;

create function public.audit_log(actor_staff uuid default null, actor_username text default null,
                                 system_only boolean default false, action_name text default null,
                                 from_date date default null, to_date date default null,
                                 before_at timestamptz default null, before_id uuid default null,
                                 page_size int default 50)
returns table (id uuid, created_at timestamptz, actor_kind text, actor_id uuid, actor_name text, action text, target_type text,
               target_id uuid, before jsonb, after jsonb, ip_address text)
language sql stable security invoker set search_path = '' as $$
  select * from access.audit_log(actor_staff, actor_username, system_only, action_name, from_date, to_date,
                                 before_at, before_id, page_size);
$$;
create function public.audit_actions() returns setof text
language sql stable security invoker set search_path = '' as $$
  select * from access.audit_actions();
$$;
revoke all on function public.audit_log(uuid, text, boolean, text, date, date, timestamptz, uuid, int),
  public.audit_actions() from public, anon;
grant execute on function public.audit_log(uuid, text, boolean, text, date, date, timestamptz, uuid, int),
  public.audit_actions() to authenticated;
