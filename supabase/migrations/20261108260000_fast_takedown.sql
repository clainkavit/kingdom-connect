-- O06: fast takedown and probation. Reporting an opportunity hides it at once, for every member. The admin's
-- decision on the report then settles it: no action restores the post, any upheld action removes it. A moderator
-- can also restore a hidden post from the moderation item. A poster whose post was removed after a report goes
-- back to having every post reviewed first, whatever their count of approved posts (section 13, criterion 5).

-- Whether a member has a report upheld against one of their opportunities.
create function private.has_upheld_post_report(member uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.reports r
                 where r.subject_id = member and r.target_type = 'opportunity' and r.status = 'action_taken');
$$;
revoke all on function private.has_upheld_post_report(uuid) from public, anon, authenticated;

create or replace function access.report(target_type text, target_id uuid, reason text, note text, screenshot_path text)
returns table (reference_no text, already_reported boolean)
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  existing text;
  created text;
  subject uuid;
begin
  if not (select access.is_member()) then
    raise exception 'not_allowed';
  end if;
  perform pg_advisory_xact_lock(hashtext('report:' || me::text));
  select r.reference_no into existing from public.reports r
  where r.reporter_id = me and r.target_type = report.target_type and r.target_id = report.target_id
    and r.status in ('open', 'under_review');
  if existing is not null then
    return query select existing, true;
    return;
  end if;
  if (select count(*) from public.reports r
      where r.reporter_id = me
        and r.created_at >= ((now() at time zone 'Africa/Dar_es_Salaam')::date::timestamp
                             at time zone 'Africa/Dar_es_Salaam')) >= 10 then
    raise exception 'daily_limit';
  end if;
  if report.target_type = 'profile' then
    if report.target_id = me
       or not exists (select 1 from public.members m where m.id = report.target_id and m.status = 'approved') then
      raise exception 'not_available';
    end if;
    subject := report.target_id;
  elsif report.target_type = 'thread' then
    select case when t.member_a = me then t.member_b else t.member_a end into subject
    from public.message_threads t
    where t.id = report.target_id and me in (t.member_a, t.member_b);
    if subject is null then
      raise exception 'not_available';
    end if;
  elsif report.target_type = 'plan' then
    select case when p.member_a = me then p.member_b else p.member_a end into subject
    from public.milestone_plans p
    where p.id = report.target_id and me in (p.member_a, p.member_b);
    if subject is null then
      raise exception 'not_available';
    end if;
  elsif report.target_type = 'opportunity' then
    select o.poster_member_id into subject from public.opportunities o
    where o.id = report.target_id and o.status in ('published', 'closed', 'expired')
      and o.poster_member_id is not null and o.poster_member_id <> me;
    if subject is null then
      raise exception 'not_available';
    end if;
  else
    raise exception 'not_available';
  end if;
  insert into public.reports (reporter_id, target_type, target_id, subject_id, reason, note, screenshot_path)
  values (me, report.target_type, report.target_id, subject, report.reason, nullif(btrim(report.note), ''),
          report.screenshot_path)
  returning reports.reference_no into created;
  if report.target_type = 'opportunity' then
    update public.opportunities set status = 'hidden' where id = report.target_id and status = 'published';
  end if;
  if report.target_type = 'thread' then
    update public.message_threads set status = 'reported', reported_at = now()
    where id = report.target_id and status <> 'reported';
  end if;
  return query select created, false;
end;
$$;
create or replace function access.decide_report(report uuid, action text, note text, member_message text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  picked public.reports;
  closed uuid[];
  clean_note text := nullif(btrim(coalesce(decide_report.note, '')), '');
  message text := nullif(btrim(coalesce(decide_report.member_message, '')), '');
  upheld int;
  subject_member public.members;
  r record;
begin
  if not (select access.is_staff()) then
    raise exception 'not_allowed';
  end if;
  if decide_report.action not in ('no_action', 'warn', 'suspend_posting', 'suspend_account') then
    raise exception 'invalid_action';
  end if;
  if clean_note is null then
    raise exception 'note_required';
  end if;
  if decide_report.action <> 'no_action' and message is null then
    raise exception 'message_required';
  end if;
  select * into picked from public.reports where id = report;
  if not found then
    raise exception 'not_found';
  end if;
  if picked.status not in ('open', 'under_review') then
    raise exception 'already_decided';
  end if;
  perform pg_advisory_xact_lock(hashtext('moderate:' || picked.subject_id::text));
  select array_agg(x.id) into closed from (
    select rr.id from public.reports rr
    where rr.target_type = picked.target_type and rr.target_id = picked.target_id
      and rr.subject_id = picked.subject_id and rr.status in ('open', 'under_review')
    order by rr.created_at for update) x;
  if closed is null then
    raise exception 'already_decided';
  end if;

  update public.reports rr
  set status = case when decide_report.action = 'no_action' then 'no_action' else 'action_taken' end,
      decided_by = me, decided_at = now()
  where rr.id = any (closed);
  for r in select rr.reporter_id, rr.reference_no from public.reports rr where rr.id = any (closed) loop
    perform private.notify(r.reporter_id, case when decide_report.action = 'no_action' then 'R2' else 'R1' end,
                           jsonb_build_object('ref', r.reference_no));
  end loop;

  if picked.target_type = 'opportunity' then
    update public.opportunities
    set status = case when decide_report.action = 'no_action' then 'published' else 'removed' end,
        closed_at = case when decide_report.action = 'no_action' then closed_at else now() end
    where id = picked.target_id and status = 'hidden';
  end if;

  perform private.moderate(me, picked.subject_id, decide_report.action, clean_note,
                           case when decide_report.action <> 'no_action' then message end,
                           picked.target_type, picked.target_id, closed);
  if decide_report.action = 'no_action' then
    return;
  end if;

  upheld := access.upheld_decisions(picked.subject_id);
  select * into subject_member from public.members where id = picked.subject_id;
  if upheld >= 3 and subject_member.status = 'approved' then
    perform private.moderate(me, picked.subject_id, 'suspend_account',
                             'Automatic: ' || upheld || ' upheld decisions in 12 months', message, automatic => true);
  elsif upheld = 2 and subject_member.status = 'approved'
        and subject_member.posting_suspended_until is distinct from 'infinity' then
    perform private.moderate(me, picked.subject_id, 'suspend_posting',
                             'Automatic: 2 upheld decisions in 12 months', message, automatic => true);
  end if;
end;
$$;
create or replace function access.moderate_opportunity(opportunity uuid, action text, reason_code text, note text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  post public.opportunities;
  reason_row public.rejection_reasons;
  clean_note text := nullif(btrim(coalesce(note, '')), '');
  member_language text;
  reason_text text;
begin
  if not (select access.is_staff()) then
    raise exception 'not_allowed';
  end if;
  select * into post from public.opportunities o where o.id = opportunity for update;
  if not found then
    return 'not_found';
  end if;
  if action = 'approve' then
    if post.status <> 'pending_review' then return 'already_decided'; end if;
    update public.opportunities
    set status = 'published', approved_at = now(), published_at = now(), reviewed_by = auth.uid(),
        reason_code = null, reason_note = null, reason = null
    where id = opportunity;
    if post.poster_member_id is not null then
      perform private.notify(post.poster_member_id, 'O5', jsonb_build_object('title', post.title));
    end if;
  elsif action = 'restore' then
    if post.status <> 'hidden' then return 'already_decided'; end if;
    update public.opportunities set status = 'published', reviewed_by = auth.uid() where id = opportunity;
    if post.poster_member_id is not null then
      perform private.notify(post.poster_member_id, 'O5', jsonb_build_object('title', post.title));
    end if;
  elsif action in ('reject', 'remove') then
    if action = 'reject' and post.status <> 'pending_review' then return 'already_decided'; end if;
    if action = 'remove' and post.status not in ('pending_review', 'published', 'hidden', 'closed') then
      return 'already_decided';
    end if;
    select * into reason_row from public.rejection_reasons rr
    where rr.code = moderate_opportunity.reason_code and rr.for_post;
    if not found or (reason_row.needs_note and clean_note is null) then
      return 'reason_required';
    end if;
    if clean_note is not null and private.holds_contact_details(jsonb_build_object('note', clean_note)) then
      return 'note_has_contact_details';
    end if;
    select coalesce(p.language, 'en') into member_language
    from public.member_private p where p.member_id = post.poster_member_id;
    reason_text := case when member_language = 'sw' then reason_row.label_sw else reason_row.label_en end;
    if clean_note is not null then reason_text := reason_text || '. ' || clean_note; end if;
    update public.opportunities
    set status = case when action = 'reject' then 'draft' else 'removed' end, reviewed_by = auth.uid(),
        reason_code = reason_row.code, reason_note = clean_note, reason = reason_text,
        closed_at = case when action = 'remove' then now() else closed_at end
    where id = opportunity;
    if post.poster_member_id is not null then
      perform private.notify(post.poster_member_id, case when action = 'reject' then 'O6' else 'O8' end,
                             jsonb_build_object('title', post.title, 'reason', reason_text));
    end if;
  else
    return 'invalid_action';
  end if;
  insert into private.audit_log (actor_staff_id, action, target_type, target_id, before, after, ip_address)
  values (auth.uid(), 'opportunity.' || action, 'opportunities', opportunity,
          jsonb_build_object('status', post.status),
          jsonb_build_object('reason_code', moderate_opportunity.reason_code, 'note', clean_note),
          private.request_ip());
  return 'ok';
end;
$$;
create or replace function access.save_opportunity(
  opportunity uuid, kind text, title text, role text, employment_type text, region uuid, district uuid,
  remote boolean, sector uuid, description text, closing_on date, skills text[], no_fee boolean, send boolean,
  tender jsonb default null
) returns table (result text, opportunity_id uuid)
language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  staff_poster boolean := (select access.is_staff());
  today date := private.tanzania_today();
  clean_title text := btrim(coalesce(title, ''));
  clean_role text := nullif(btrim(coalesce(role, '')), '');
  clean_description text := btrim(coalesce(description, ''));
  is_remote boolean := coalesce(save_opportunity.remote, false);
  tags text[];
  tag text;
  skill uuid;
  approvals int;
  sent_back boolean := false;
  next_status text;
  saved uuid;
  tender_ref text;
  tender_scope text;
  tender_eligibility text;
  tender_docs text[];
  tender_time time;
  tender_value bigint;
  tender_path text;
  tender_org text;
begin
  if not staff_poster then
    if not (select access.is_member()) then
      raise exception 'not_allowed';
    end if;
    if access.member_level(me) < 3 then
      return query select 'level3_required', null::uuid; return;
    end if;
    if exists (select 1 from public.members m where m.id = me and m.posting_suspended_until > now()) then
      return query select 'posting_paused', null::uuid; return;
    end if;
  end if;
  if opportunity is not null and not exists (
       select 1 from public.opportunities o
       where o.id = opportunity and o.status = 'draft'
         and (o.poster_member_id = me or (staff_poster and o.poster_staff_id is not null))) then
    return query select 'not_editable', null::uuid; return;
  end if;

  if opportunity is not null then
    select o.reason_code is not null into sent_back from public.opportunities o where o.id = opportunity;
  end if;
  if kind is null or kind not in ('job', 'partnership', 'collaboration', 'investment', 'tender') then
    return query select 'invalid_type', null::uuid; return;
  end if;
  if char_length(clean_title) not between 5 and 120 or char_length(clean_role) > 120 then
    return query select 'invalid_title', null::uuid; return;
  end if;
  if (kind = 'job') <> (employment_type is not null)
     or (employment_type is not null and employment_type not in ('full_time', 'part_time', 'contract', 'internship')) then
    return query select 'invalid_employment', null::uuid; return;
  end if;
  if not is_remote and (region is null or not exists (select 1 from public.regions r where r.id = region))
     or (district is not null and not exists (select 1 from public.districts d where d.id = district and d.region_id = region)) then
    return query select 'invalid_location', null::uuid; return;
  end if;
  if not exists (select 1 from public.sectors s where s.id = sector) then
    return query select 'invalid_sector', null::uuid; return;
  end if;
  if char_length(clean_description) < 100 then return query select 'too_short', null::uuid; return; end if;
  if char_length(clean_description) > 5000 then return query select 'too_long', null::uuid; return; end if;
  if closing_on is null or closing_on <= today or closing_on > today + 90 then
    return query select 'invalid_closing', null::uuid; return;
  end if;
  select coalesce(array_agg(distinct n), '{}') into tags
  from unnest(coalesce(skills, '{}')) raw, private.normalize_skill(raw) n where n <> '';
  if cardinality(tags) > 5 or exists (select 1 from unnest(tags) n where char_length(n) > 40) then
    return query select 'too_many_skills', null::uuid; return;
  end if;
  if cardinality(tags) = 0 and kind in ('job', 'collaboration') then
    return query select 'skills_required', null::uuid; return;
  end if;
  if private.holds_contact_details(jsonb_build_object('title', clean_title, 'role', coalesce(clean_role, ''),
                                                      'text', clean_description,
                                                      'skills', array_to_string(tags, ' '))) then
    return query select 'contact_details', null::uuid; return;
  end if;
  if kind = 'tender' then
    tender_ref := btrim(coalesce(tender ->> 'reference_no', ''));
    tender_scope := btrim(coalesce(tender ->> 'scope', ''));
    tender_eligibility := btrim(coalesce(tender ->> 'eligibility', ''));
    tender_path := nullif(btrim(coalesce(tender ->> 'document_path', '')), '');
    begin
      tender_time := coalesce(nullif(tender ->> 'closing_time', ''), '17:00')::time;
      tender_value := nullif(tender ->> 'estimated_value_tzs', '')::bigint;
      select coalesce(array_agg(btrim(x.d) order by x.n), '{}') into tender_docs
      from jsonb_array_elements_text(coalesce(tender -> 'required_documents', '[]'::jsonb)) with ordinality as x(d, n)
      where btrim(x.d) <> '';
    exception when others then
      return query select 'invalid_tender', null::uuid; return;
    end;
    if char_length(tender_ref) not between 2 and 60 or char_length(tender_scope) not between 30 and 3000
       or char_length(tender_eligibility) > 2000 or cardinality(tender_docs) > 10
       or exists (select 1 from unnest(tender_docs) d where char_length(d) > 120)
       or (tender_value is not null and tender_value not between 0 and 10000000000000) then
      return query select 'invalid_tender', null::uuid; return;
    end if;
    if private.holds_contact_details(jsonb_build_object('reference', tender_ref, 'scope', tender_scope,
         'eligibility', tender_eligibility, 'documents', array_to_string(tender_docs, ' '))) then
      return query select 'contact_details', null::uuid; return;
    end if;
    if tender_path is not null and (tender_path !~ ('^' || me::text || '/[0-9a-f-]{36}\.pdf$')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'tender-documents' and o.name = tender_path)) then
      return query select 'invalid_tender_file', null::uuid; return;
    end if;
    tender_org := case
      when staff_poster then (select s.value #>> '{}' from public.platform_settings s where s.key = 'platform_name')
      else coalesce((select b.name from public.businesses b where b.member_id = me and b.status = 'approved'),
                    (select m.username::text from public.members m where m.id = me)) end;
  end if;
  if not staff_poster and not coalesce(no_fee, false) then
    return query select 'no_fee_required', null::uuid; return;
  end if;

  if not coalesce(send, false) then
    next_status := 'draft';
  elsif staff_poster then
    next_status := 'published';
  else
    select count(*) into approvals from public.opportunities o
    where o.poster_member_id = me and o.approved_at is not null;
    next_status := case
      when sent_back or approvals < 3 or private.has_upheld_post_report(me)
           or private.holds_link(clean_title || ' ' || coalesce(clean_role, '') || ' ' || clean_description
                                 || ' ' || array_to_string(tags, ' '))
        then 'pending_review'
      else 'published' end;
  end if;

  if opportunity is null then
    insert into public.opportunities (poster_member_id, poster_staff_id, type, title, role, employment_type, region_id,
                                      district_id, remote, sector_id, description, closing_at, no_fee_declared, status,
                                      published_at)
    values (case when staff_poster then null else me end, case when staff_poster then me end, kind, clean_title,
            clean_role, employment_type, case when is_remote then null else region end,
            case when is_remote then null else district end, is_remote, sector,
            clean_description, closing_on, coalesce(no_fee, false) and not staff_poster, next_status,
            case when next_status = 'published' then now() end)
    returning id into saved;
  else
    update public.opportunities o
    set type = kind, title = clean_title, role = clean_role, employment_type = save_opportunity.employment_type,
        region_id = case when is_remote then null else region end,
        district_id = case when is_remote then null else district end,
        remote = is_remote, sector_id = sector, description = clean_description,
        closing_at = closing_on, no_fee_declared = coalesce(no_fee, false) and not staff_poster, status = next_status,
        published_at = case when next_status = 'published' then now() end
    where o.id = opportunity
    returning o.id into saved;
  end if;

  if kind = 'tender' then
    insert into public.tender_details (opportunity_id, issuing_org, reference_no, scope, eligibility, required_documents,
                                       closing_time, estimated_value_tzs, document_path)
    values (saved, tender_org, tender_ref, tender_scope, tender_eligibility, tender_docs, tender_time, tender_value,
            tender_path)
    on conflict on constraint tender_details_pkey do update
    set issuing_org = excluded.issuing_org, reference_no = excluded.reference_no, scope = excluded.scope,
        eligibility = excluded.eligibility, required_documents = excluded.required_documents,
        closing_time = excluded.closing_time, estimated_value_tzs = excluded.estimated_value_tzs,
        document_path = excluded.document_path;
  else
    delete from public.tender_details where tender_details.opportunity_id = saved;
  end if;

  delete from public.opportunity_skills os where os.opportunity_id = saved;
  foreach tag in array tags loop
    select y.skill_id into skill from public.skill_synonyms y where y.from_name = tag::extensions.citext;
    if skill is null then
      insert into public.skills (name) values (tag) on conflict (name) do nothing;
      select s.id into skill from public.skills s where s.name = tag::extensions.citext;
    end if;
    insert into public.opportunity_skills (opportunity_id, skill_id) values (saved, skill) on conflict do nothing;
    skill := null;
  end loop;

  if next_status <> 'draft' then
    insert into private.audit_log (actor_member_id, actor_staff_id, action, target_type, target_id, after, ip_address)
    values (case when staff_poster then null else me end, case when staff_poster then me end,
            'opportunity.sent', 'opportunities', saved, jsonb_build_object('status', next_status, 'type', kind),
            private.request_ip());
  end if;
  return query select 'ok', saved;
end;
$$;