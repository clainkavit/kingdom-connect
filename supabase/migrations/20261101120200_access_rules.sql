create schema access;
revoke all on schema access from public, anon;
grant usage on schema access to authenticated, service_role;
alter default privileges in schema access revoke all on functions from public, anon;

create function access.otp_verified() returns boolean
language sql stable set search_path = '' as $$
  select coalesce((auth.jwt() ->> 'otp_verified')::boolean, false);
$$;

create function access.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select access.otp_verified()
     and exists (select 1 from public.members m where m.id = auth.uid() and m.status = 'approved');
$$;

create function access.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select access.otp_verified()
     and exists (select 1 from public.staff s where s.id = auth.uid() and s.active);
$$;

create function access.is_super_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select access.otp_verified()
     and exists (select 1 from public.staff s where s.id = auth.uid() and s.active and s.role = 'super_admin');
$$;

create function access.is_connected(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.connections c where c.member_a = least(a, b) and c.member_b = greatest(a, b));
$$;

create function access.is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.blocks bl
                 where (bl.blocker_id = a and bl.blocked_id = b) or (bl.blocker_id = b and bl.blocked_id = a));
$$;

create function access.member_level(member uuid) returns int
language sql stable security definer set search_path = '' as $$
  select case
    when not exists (select 1 from public.members m where m.id = member and m.status = 'approved') then 0
    else coalesce((select max(v.level) from public.verification_requests v
                   where v.member_id = member and v.status = 'approved'), 1)
  end;
$$;

grant execute on all functions in schema access to authenticated, service_role;

revoke all on public.members, public.staff, public.profiles, public.profile_skills, public.member_private,
  public.investor_flags, public.regions, public.districts, public.sectors, public.skills, public.skill_synonyms,
  public.platform_settings, public.connections, public.blocks, public.verification_requests
  from anon, authenticated;

grant select, update (status, posting_suspended_until, approved_at) on public.members to authenticated;
grant select, insert, update (full_name, role, active) on public.staff to authenticated;
grant select, update (full_name, headline, bio, photo_path, region_id, district_id, profession, experience,
  certifications, study_institution, study_course, study_year, hidden_from_directory) on public.profiles to authenticated;
grant select, insert, delete on public.profile_skills to authenticated;
grant select, update (email, phone, address, share_phone, share_email, share_address, language)
  on public.member_private to authenticated;
grant select, insert, update (sector_focus, ticket_band, revoked_at) on public.investor_flags to authenticated;
grant select, insert, update, delete on public.regions, public.districts, public.sectors, public.skills,
  public.skill_synonyms, public.platform_settings to authenticated;
grant select, delete on public.connections to authenticated;
grant select, insert, delete on public.blocks to authenticated;
grant select, update (status, reviewer_id, reason, duplicate_suspected_of, decided_at)
  on public.verification_requests to authenticated;

do $$
declare t text;
begin
  foreach t in array array['members', 'staff', 'profiles', 'profile_skills', 'member_private', 'investor_flags',
    'skills', 'skill_synonyms', 'connections', 'blocks', 'verification_requests']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy "base rule" on public.%I as restrictive for all to authenticated
      using ((select access.is_member()) or (select access.is_staff()))
      with check ((select access.is_member()) or (select access.is_staff()))$p$, t);
  end loop;

  foreach t in array array['regions', 'districts', 'sectors', 'platform_settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy "base rule: signed in to read" on public.%I as restrictive for select to authenticated
      using ((select auth.uid()) is not null)$p$, t);
    execute format($p$create policy "base rule: member or staff to insert" on public.%I as restrictive for insert to authenticated
      with check ((select access.is_member()) or (select access.is_staff()))$p$, t);
    execute format($p$create policy "base rule: member or staff to update" on public.%I as restrictive for update to authenticated
      using ((select access.is_member()) or (select access.is_staff()))
      with check ((select access.is_member()) or (select access.is_staff()))$p$, t);
    execute format($p$create policy "base rule: member or staff to delete" on public.%I as restrictive for delete to authenticated
      using ((select access.is_member()) or (select access.is_staff()))$p$, t);
  end loop;
end $$;

create policy "own row or staff" on public.members for select to authenticated
  using (id = (select auth.uid()) or (select access.is_staff()));
create policy "staff change status" on public.members for update to authenticated
  using ((select access.is_staff())) with check ((select access.is_staff()));

create policy "staff read" on public.staff for select to authenticated
  using ((select access.is_staff()));
create policy "super admin creates" on public.staff for insert to authenticated
  with check ((select access.is_super_admin()));
create policy "super admin changes" on public.staff for update to authenticated
  using ((select access.is_super_admin())) with check ((select access.is_super_admin()));

create policy "owner, staff, or visible to members" on public.profiles for select to authenticated
  using (
    member_id = (select auth.uid())
    or (select access.is_staff())
    or (
      (select access.is_member())
      and access.member_level(member_id) >= 1
      and not access.is_blocked(member_id, (select auth.uid()))
      and (not hidden_from_directory or access.is_connected(member_id, (select auth.uid())))
    )
  );
create policy "owner edits" on public.profiles for update to authenticated
  using (member_id = (select auth.uid())) with check (member_id = (select auth.uid()));

create policy "same as the profile" on public.profile_skills for select to authenticated
  using (exists (select 1 from public.profiles p where p.member_id = profile_skills.member_id));
create policy "owner adds" on public.profile_skills for insert to authenticated
  with check (member_id = (select auth.uid()));
create policy "owner removes" on public.profile_skills for delete to authenticated
  using (member_id = (select auth.uid()));

create policy "owner or staff" on public.member_private for select to authenticated
  using (member_id = (select auth.uid()) or (select access.is_staff()));
create policy "owner edits" on public.member_private for update to authenticated
  using (member_id = (select auth.uid())) with check (member_id = (select auth.uid()));

create policy "the investor or staff" on public.investor_flags for select to authenticated
  using (member_id = (select auth.uid()) or (select access.is_staff()));
create policy "staff grant, as themselves" on public.investor_flags for insert to authenticated
  with check ((select access.is_staff()) and granted_by = (select auth.uid()));
create policy "staff change" on public.investor_flags for update to authenticated
  using ((select access.is_staff())) with check ((select access.is_staff()));

create policy "everyone signed in" on public.regions for select to authenticated using (true);
create policy "everyone signed in" on public.districts for select to authenticated using (true);
create policy "everyone signed in" on public.sectors for select to authenticated using (true);
create policy "everyone signed in" on public.platform_settings for select to authenticated using (true);

do $$
declare t text;
begin
  foreach t in array array['regions', 'districts', 'sectors', 'skill_synonyms']
  loop
    execute format('create policy "staff insert" on public.%I for insert to authenticated with check ((select access.is_staff()))', t);
    execute format('create policy "staff update" on public.%I for update to authenticated using ((select access.is_staff())) with check ((select access.is_staff()))', t);
    execute format('create policy "staff delete" on public.%I for delete to authenticated using ((select access.is_staff()))', t);
  end loop;
end $$;

create policy "super admin insert" on public.platform_settings for insert to authenticated
  with check ((select access.is_super_admin()));
create policy "super admin update" on public.platform_settings for update to authenticated
  using ((select access.is_super_admin())) with check ((select access.is_super_admin()));
create policy "super admin delete" on public.platform_settings for delete to authenticated
  using ((select access.is_super_admin()));

create policy "members and staff read" on public.skills for select to authenticated using (true);
create policy "members create" on public.skills for insert to authenticated
  with check ((select access.is_member()) or (select access.is_staff()));
create policy "staff update" on public.skills for update to authenticated
  using ((select access.is_staff())) with check ((select access.is_staff()));
create policy "staff delete" on public.skills for delete to authenticated
  using ((select access.is_staff()));

create policy "members and staff read" on public.skill_synonyms for select to authenticated using (true);

create policy "the two members" on public.connections for select to authenticated
  using ((select auth.uid()) in (member_a, member_b));
create policy "either member removes" on public.connections for delete to authenticated
  using ((select auth.uid()) in (member_a, member_b));

create policy "the blocker" on public.blocks for select to authenticated
  using (blocker_id = (select auth.uid()));
create policy "the blocker adds" on public.blocks for insert to authenticated
  with check (blocker_id = (select auth.uid()));
create policy "the blocker removes" on public.blocks for delete to authenticated
  using (blocker_id = (select auth.uid()));

create policy "staff read" on public.verification_requests for select to authenticated
  using ((select access.is_staff()));
create policy "staff decide" on public.verification_requests for update to authenticated
  using ((select access.is_staff())) with check ((select access.is_staff()));
