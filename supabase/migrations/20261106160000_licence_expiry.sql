create or replace function access.member_level(member uuid) returns int
language sql stable security definer set search_path = '' as $$
  select case
    when not exists (select 1 from public.members m where m.id = member and m.status = 'approved') then 0
    else coalesce((select max(v.level) from public.verification_requests v
                   left join public.businesses b on b.id = v.business_id
                   where v.member_id = member and v.status = 'approved'
                     and (v.business_id is null or b.status = 'approved')), 1)
  end;
$$;

create function private.tanzania_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Africa/Dar_es_Salaam')::date;
$$;
grant execute on function private.tanzania_today() to authenticated;

create table public.licence_renewals (
  request_id uuid primary key references public.verification_requests (id) on delete cascade,
  member_id uuid not null references public.members (id),
  licence_no text not null check (char_length(licence_no) between 3 and 40),
  licence_expires_on date not null,
  created_at timestamptz not null default now()
);
create index licence_renewals_member on public.licence_renewals (member_id);
alter table public.licence_renewals enable row level security;
revoke all on public.licence_renewals from anon, authenticated;
grant select on public.licence_renewals to authenticated;
create policy "base rule" on public.licence_renewals as restrictive for all to authenticated
  using ((select access.is_member()) or (select access.is_staff()))
  with check ((select access.is_member()) or (select access.is_staff()));
create policy "owner or staff" on public.licence_renewals for select to authenticated
  using (member_id = (select auth.uid()) or (select access.is_staff()));

create table private.licence_reminders (
  business_id uuid not null references public.businesses (id) on delete cascade,
  expires_on date not null,
  reminder int not null check (reminder in (30, 7)),
  sent_at timestamptz not null default now(),
  primary key (business_id, expires_on, reminder)
);
revoke all on private.licence_reminders from public, anon, authenticated;

create function private.check_licence_expiry() returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  today date := private.tanzania_today();
  due record;
  lapsed record;
  sent int := 0;
begin
  for due in
    select b.id, b.member_id, b.level, p.licence_expires_on, p.licence_expires_on - today as days_left
    from public.businesses b join public.business_private p on p.business_id = b.id
    where b.status = 'approved' and b.level >= 2 and p.licence_expires_on - today between 1 and 30
      and not exists (select 1 from public.verification_requests v join public.licence_renewals lr on lr.request_id = v.id
                      where v.business_id = b.id and v.status = 'pending')
  loop
    insert into private.licence_reminders (business_id, expires_on, reminder)
    values (due.id, due.licence_expires_on, case when due.days_left <= 7 then 7 else 30 end)
    on conflict do nothing;
    if found then
      perform private.notify(due.member_id, 'B3', jsonb_build_object('days', due.days_left, 'level', due.level));
      sent := sent + 1;
    end if;
  end loop;

  for lapsed in
    update public.businesses b set status = 'expired'
    from public.business_private p
    where p.business_id = b.id and b.status = 'approved' and b.level >= 2 and p.licence_expires_on <= today
    returning b.id, b.member_id, b.level
  loop
    perform private.notify(lapsed.member_id, 'B4', jsonb_build_object('level', lapsed.level));
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;
revoke all on function private.check_licence_expiry() from public, anon, authenticated;

create function access.submit_licence_renewal(licence_no text, licence_expires_on date, licence_path text)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  today date := private.tanzania_today();
  clean_licence text := btrim(coalesce(licence_no, ''));
  owned public.businesses;
  current_expiry date;
  created uuid;
begin
  if not (select access.is_member()) then
    raise exception 'not_allowed';
  end if;
  perform pg_advisory_xact_lock(hashtext('business:' || me::text));
  select * into owned from public.businesses b where b.member_id = me for update;
  if not found or owned.status not in ('approved', 'expired')
     or not exists (select 1 from public.verification_requests v
                    where v.business_id = owned.id and v.level = 2 and v.status = 'approved') then
    return 'not_verified';
  end if;
  if exists (select 1 from public.verification_requests v join public.licence_renewals r on r.request_id = v.id
             where v.business_id = owned.id and v.status = 'pending') then
    return 'already_pending';
  end if;
  select p.licence_expires_on into current_expiry from public.business_private p where p.business_id = owned.id;
  if owned.status = 'approved' and current_expiry > today + 30 then
    return 'not_due';
  end if;
  if char_length(clean_licence) not between 3 and 40 then return 'invalid_number'; end if;
  if submit_licence_renewal.licence_expires_on is null or submit_licence_renewal.licence_expires_on <= today then
    return 'licence_expired';
  end if;
  if submit_licence_renewal.licence_expires_on <= current_expiry
     or submit_licence_renewal.licence_expires_on > today + interval '10 years' then
    return 'invalid_date';
  end if;
  if licence_path is null or split_part(licence_path, '/', 1) <> me::text
     or split_part(licence_path, '/', 2) = '' or split_part(licence_path, '/', 3) <> ''
     or not exists (select 1 from storage.objects o where o.bucket_id = 'business-documents' and o.name = licence_path)
     or exists (select 1 from public.verification_documents d where d.storage_path = licence_path) then
    return 'documents_missing';
  end if;

  insert into public.verification_requests (member_id, level, business_id)
  values (me, 2, owned.id) returning id into created;
  insert into public.verification_documents (request_id, kind, storage_path) values (created, 'licence', licence_path);
  insert into public.licence_renewals (request_id, member_id, licence_no, licence_expires_on)
  values (created, me, clean_licence, submit_licence_renewal.licence_expires_on);
  insert into private.audit_log (actor_member_id, action, target_type, target_id, after, ip_address)
  values (me, 'business.renewal_submitted', 'verification_requests', created,
          jsonb_build_object('business_id', owned.id, 'licence_no', clean_licence,
                             'licence_expires_on', submit_licence_renewal.licence_expires_on),
          private.request_ip());
  return 'ok';
end;
$$;

create function access.my_licence_renewal()
returns table (request_status text, reason text, licence_no text, licence_expires_on date, submitted_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select v.status, v.reason, r.licence_no, r.licence_expires_on, v.submitted_at
  from public.licence_renewals r
  join public.verification_requests v on v.id = r.request_id
  where r.member_id = auth.uid() and (select access.is_member())
  order by v.submitted_at desc
  limit 1;
$$;

create or replace function access.decide_business_verification(request uuid, approve boolean, reason_code text, note text)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  req public.verification_requests;
  renewal public.licence_renewals;
  reason_row public.rejection_reasons;
  clean_note text := nullif(btrim(coalesce(note, '')), '');
  member_language text;
  reason_text text;
  held int;
begin
  if not (select access.is_staff()) then
    raise exception 'not_allowed';
  end if;
  perform set_config('kc.business_review', 'on', true);
  select * into req from public.verification_requests r
  where r.id = request and r.level in (2, 3) and r.business_id is not null for update;
  if not found then
    return 'not_found';
  end if;
  if req.status <> 'pending' then
    return 'already_decided';
  end if;
  select * into renewal from public.licence_renewals lr where lr.request_id = request;
  if approve then
    update public.verification_requests
    set status = 'approved', reviewer_id = auth.uid(), decided_at = now() where id = request;
    if renewal.request_id is not null then
      if not exists (select 1 from public.businesses b
                     where b.id = req.business_id and b.status in ('approved', 'expired')) then
        return 'not_found';
      end if;
      update public.business_private
      set licence_no = renewal.licence_no, licence_expires_on = renewal.licence_expires_on
      where business_id = req.business_id;
      update public.businesses set status = 'approved' where id = req.business_id returning level into held;
    else
      update public.businesses
      set level = req.level, status = case when req.level = 2 then 'approved' else status end
      where id = req.business_id;
      held := req.level;
    end if;
    perform private.notify(req.member_id, 'B1', jsonb_build_object('level', held));
    insert into private.audit_log (actor_staff_id, action, target_type, target_id, before, after, ip_address)
    values (auth.uid(),
            case when renewal.request_id is not null then 'business.renewal_approved' else 'business.verification_approved' end,
            'verification_requests', request,
            jsonb_build_object('status', 'pending'),
            jsonb_build_object('status', 'approved', 'level', held, 'business_id', req.business_id),
            private.request_ip());
    return 'ok';
  end if;

  select * into reason_row from public.rejection_reasons rr
  where rr.code = decide_business_verification.reason_code
    and case when req.level = 3 then rr.for_poster else rr.for_business end;
  if not found or (reason_row.needs_note and clean_note is null) then
    return 'reason_required';
  end if;
  if clean_note is not null and private.holds_contact_details(jsonb_build_object('note', clean_note)) then
    return 'note_has_contact_details';
  end if;
  select coalesce(p.language, 'en') into member_language from public.member_private p where p.member_id = req.member_id;
  reason_text := case when member_language = 'sw' then reason_row.label_sw else reason_row.label_en end;
  if clean_note is not null then
    reason_text := reason_text || '. ' || clean_note;
  end if;
  update public.verification_requests
  set status = 'rejected', reviewer_id = auth.uid(), decided_at = now(),
      reason_code = reason_row.code, reason_note = clean_note, reason = reason_text
  where id = request;
  if req.level = 2 and renewal.request_id is null then
    update public.businesses set status = 'rejected' where id = req.business_id;
  end if;
  perform private.notify(req.member_id, 'B2', jsonb_build_object('reason', reason_text));
  insert into private.audit_log (actor_staff_id, action, target_type, target_id, before, after, ip_address)
  values (auth.uid(),
          case when renewal.request_id is not null then 'business.renewal_rejected' else 'business.verification_rejected' end,
          'verification_requests', request,
          jsonb_build_object('status', 'pending'),
          jsonb_build_object('status', 'rejected', 'level', req.level, 'reason_code', reason_row.code,
                             'business_id', req.business_id),
          private.request_ip());
  return 'ok';
end;
$$;

revoke all on function access.submit_licence_renewal(text, date, text), access.my_licence_renewal() from public, anon;
grant execute on function access.submit_licence_renewal(text, date, text), access.my_licence_renewal() to authenticated;

create function public.submit_licence_renewal(licence_no text, licence_expires_on date, licence_path text)
returns text
language sql volatile security invoker set search_path = '' as $$
  select access.submit_licence_renewal(licence_no, licence_expires_on, licence_path);
$$;
create function public.my_licence_renewal()
returns table (request_status text, reason text, licence_no text, licence_expires_on date, submitted_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select * from access.my_licence_renewal();
$$;
revoke all on function public.submit_licence_renewal(text, date, text), public.my_licence_renewal() from public, anon;
grant execute on function public.submit_licence_renewal(text, date, text), public.my_licence_renewal() to authenticated;

select cron.schedule('check-licence-expiry', '5 21 * * *', $job$ select private.check_licence_expiry() $job$);

create or replace function access.my_business()
returns table (business_id uuid, name text, sector_id uuid, size text, description text, brela_no text, tin text,
               licence_no text, licence_expires_on date, level int, business_status text, request_status text,
               reason text, submitted_at timestamptz, decided_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.id, b.name, b.sector_id, b.size, b.description, p.brela_no, p.tin, p.licence_no, p.licence_expires_on,
         b.level, b.status, v.status, v.reason, v.submitted_at, v.decided_at
  from public.businesses b
  join public.business_private p on p.business_id = b.id
  left join lateral (select r.status, r.reason, r.submitted_at, r.decided_at from public.verification_requests r
                     where r.business_id = b.id and r.level = 2
                       and not exists (select 1 from public.licence_renewals lr where lr.request_id = r.id)
                     order by r.submitted_at desc limit 1) v on true
  where b.member_id = auth.uid() and (select access.is_member());
$$;
