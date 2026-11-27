-- R13b: the audit log reads in plain language. Each entry carries its kind of change and whether it is a
-- routine system job, both decided here so filters and paging agree, and staff can turn ids into names.

create function access.audit_kind(action text) returns text
language sql immutable set search_path = '' as $$
  select case
    when head in ('members', 'member', 'member_private', 'profiles', 'application', 'registration', 'id',
                  'recovery', 'email_recoveries') then 'people'
    when head = 'investor_flags' then 'investors'
    when head in ('business', 'businesses') then 'business'
    when head in ('opportunity', 'opportunities', 'picks', 'pick_requests', 'responses', 'tenders') then 'opportunities'
    when head in ('ideas', 'idea_details', 'idea_access_requests', 'idea_views', 'milestones', 'milestone_plans',
                  'plan_documents') then 'ideas'
    when head in ('trainings', 'training_materials', 'registrations', 'events') then 'training'
    when head in ('reports', 'moderation_actions', 'security_alerts') then 'moderation'
    when head in ('staff', 'login', 'password') then 'staff'
    when head in ('platform_settings', 'matching_settings', 'skill_synonyms') then 'settings'
    else 'other'
  end
  from (select split_part(audit_kind.action, '.', 1) as head) h;
$$;

create function access.audit_routine(actor_staff_id uuid, actor_member_id uuid, target_type text, row_values jsonb)
returns boolean
language sql immutable set search_path = '' as $$
  select actor_staff_id is null and actor_member_id is null and target_type = 'platform_settings'
         and coalesce(row_values ->> 'key', '') like '%\_last\_run';
$$;

drop function public.audit_log(uuid, text, boolean, text, date, date, timestamptz, uuid, int);
drop function access.audit_log(uuid, text, boolean, text, date, date, timestamptz, uuid, int);

create function access.audit_log(actor_staff uuid default null, actor_username text default null,
                                 system_only boolean default false, action_name text default null,
                                 from_date date default null, to_date date default null,
                                 before_at timestamptz default null, before_id uuid default null,
                                 page_size int default 50, kinds text[] default null,
                                 show_routine boolean default true)
returns table (id uuid, created_at timestamptz, actor_kind text, actor_id uuid, actor_name text, action text, target_type text,
               target_id uuid, before jsonb, after jsonb, ip_address text, kind text, routine boolean)
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
         coalesce(s.full_name, case when m.status = 'deleted' then '' else m.username::text end, ''),
         l.action, l.target_type, l.target_id, l.before, l.after, host(l.ip_address),
         access.audit_kind(l.action),
         access.audit_routine(l.actor_staff_id, l.actor_member_id, l.target_type, coalesce(l.after, l.before))
  from private.audit_log l
  left join public.staff s on s.id = l.actor_staff_id
  left join public.members m on m.id = l.actor_member_id
  where (audit_log.actor_staff is null or l.actor_staff_id = audit_log.actor_staff)
    and (audit_log.actor_username is null or lower(m.username::text) = lower(audit_log.actor_username))
    and (not audit_log.system_only or (l.actor_staff_id is null and l.actor_member_id is null))
    and (audit_log.action_name is null or l.action = audit_log.action_name)
    and (audit_log.kinds is null or access.audit_kind(l.action) = any (audit_log.kinds))
    and (audit_log.show_routine
         or not access.audit_routine(l.actor_staff_id, l.actor_member_id, l.target_type, coalesce(l.after, l.before)))
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

create function access.audit_names(ids uuid[]) returns table (id uuid, name text, kind text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (select access.is_super_admin()) then
    raise exception 'not_allowed';
  end if;
  return query
  select s.id, s.full_name, 'staff' from public.staff s where s.id = any (audit_names.ids)
  union all
  select m.id, coalesce(nullif(p.full_name, ''), '@' || m.username::text), 'member'
  from public.members m left join public.profiles p on p.member_id = m.id
  where m.id = any (audit_names.ids) and m.status <> 'deleted'
  union all
  select b.id, b.name, 'business' from public.businesses b where b.id = any (audit_names.ids)
  union all
  select o.id, o.title, 'opportunity' from public.opportunities o where o.id = any (audit_names.ids)
  union all
  select i.id, i.title, 'idea' from public.ideas i where i.id = any (audit_names.ids)
  union all
  select t.id, t.title, 'training' from public.trainings t where t.id = any (audit_names.ids);
end;
$$;

revoke all on function access.audit_kind(text), access.audit_routine(uuid, uuid, text, jsonb) from public, anon;
revoke all on function access.audit_log(uuid, text, boolean, text, date, date, timestamptz, uuid, int, text[], boolean),
  access.audit_names(uuid[]) from public, anon;
grant execute on function access.audit_kind(text), access.audit_routine(uuid, uuid, text, jsonb) to authenticated;
grant execute on function access.audit_log(uuid, text, boolean, text, date, date, timestamptz, uuid, int, text[], boolean),
  access.audit_names(uuid[]) to authenticated;

create function public.audit_log(actor_staff uuid default null, actor_username text default null,
                                 system_only boolean default false, action_name text default null,
                                 from_date date default null, to_date date default null,
                                 before_at timestamptz default null, before_id uuid default null,
                                 page_size int default 50, kinds text[] default null,
                                 show_routine boolean default true)
returns table (id uuid, created_at timestamptz, actor_kind text, actor_id uuid, actor_name text, action text, target_type text,
               target_id uuid, before jsonb, after jsonb, ip_address text, kind text, routine boolean)
language sql stable security invoker set search_path = '' as $$
  select * from access.audit_log(actor_staff, actor_username, system_only, action_name, from_date, to_date,
                                 before_at, before_id, page_size, kinds, show_routine);
$$;
create function public.audit_names(ids uuid[]) returns table (id uuid, name text, kind text)
language sql stable security invoker set search_path = '' as $$
  select * from access.audit_names(ids);
$$;
revoke all on function public.audit_log(uuid, text, boolean, text, date, date, timestamptz, uuid, int, text[], boolean),
  public.audit_names(uuid[]) from public, anon;
grant execute on function public.audit_log(uuid, text, boolean, text, date, date, timestamptz, uuid, int, text[], boolean),
  public.audit_names(uuid[]) to authenticated;
