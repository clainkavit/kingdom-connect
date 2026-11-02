revoke update (full_name) on public.profiles from authenticated;
revoke insert, delete on public.profile_skills from authenticated;
revoke insert on public.skills from authenticated;
drop policy "members create" on public.skills;
drop policy "owner adds" on public.profile_skills;
drop policy "owner removes" on public.profile_skills;
create policy "staff create" on public.skills for insert to authenticated
  with check ((select access.is_staff()));
grant insert on public.skills to authenticated;

alter table public.profiles
  add constraint headline_length check (char_length(headline) <= 120),
  add constraint bio_length check (char_length(bio) <= 1500),
  add constraint profession_length check (char_length(profession) <= 100),
  add constraint experience_length check (char_length(experience) <= 1500),
  add constraint certifications_length check (char_length(certifications) <= 500),
  add constraint study_length check (char_length(study_institution) <= 150 and char_length(study_course) <= 150),
  add constraint photo_path_is_own check (photo_path is null or photo_path = member_id::text || '/photo');

create function private.normalize_skill(name text) returns text
language sql immutable set search_path = '' as $$
  select lower(regexp_replace(btrim(coalesce(name, '')), '\s+', ' ', 'g'));
$$;

create function private.set_skills(member uuid, names text[]) returns text
language plpgsql security definer set search_path = '' as $$
declare
  cleaned text[];
  tag text;
  skill uuid;
begin
  if not exists (select 1 from public.members where id = member and status = 'approved') then
    return 'not_a_member';
  end if;
  select coalesce(array_agg(distinct n), '{}') into cleaned
  from unnest(coalesce(names, '{}')) raw, private.normalize_skill(raw) n
  where n <> '';
  if cardinality(cleaned) > 20 then
    return 'too_many';
  end if;
  if exists (select 1 from unnest(cleaned) n where char_length(n) > 40) then
    return 'too_long';
  end if;

  delete from public.profile_skills where member_id = member;
  foreach tag in array cleaned loop
    select skill_id into skill from public.skill_synonyms where from_name = tag::extensions.citext;
    if skill is null then
      insert into public.skills (name) values (tag) on conflict (name) do nothing;
      select id into skill from public.skills where skills.name = tag::extensions.citext;
    end if;
    insert into public.profile_skills (member_id, skill_id) values (member, skill)
    on conflict (member_id, skill_id) do nothing;
    skill := null;
  end loop;
  return 'ok';
end $$;

create function private.merge_synonym() returns trigger
language plpgsql security definer set search_path = '' as $$
declare variant uuid;
begin
  if new.from_name = (select s.name from public.skills s where s.id = new.skill_id) then
    raise exception 'a skill cannot be a synonym of itself' using errcode = '22023';
  end if;
  select id into variant from public.skills where name = new.from_name;
  if variant is not null then
    insert into public.profile_skills (member_id, skill_id)
    select member_id, new.skill_id from public.profile_skills where skill_id = variant
    on conflict (member_id, skill_id) do nothing;
    update public.skill_synonyms set skill_id = new.skill_id where skill_id = variant;
    delete from public.skills where id = variant;
  end if;
  return new;
end $$;
create trigger merge_synonym before insert on public.skill_synonyms
  for each row execute function private.merge_synonym();
create trigger audit after insert or update or delete on public.skill_synonyms
  for each row execute function private.log_change();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "avatars: own photo, members only" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and name = (select auth.uid())::text || '/photo'
              and (select access.is_member()));
create policy "avatars: replace own photo" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and name = (select auth.uid())::text || '/photo'
         and (select access.is_member()));
create policy "avatars: remove own photo" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and name = (select auth.uid())::text || '/photo'
         and (select access.is_member()));
create policy "avatars: whoever can see the profile" on storage.objects for select to authenticated
  using (bucket_id = 'avatars'
         and ((select access.is_staff())
              or exists (select 1 from public.profiles p
                         where p.member_id::text = (storage.foldername(name))[1])));

revoke all on function private.normalize_skill(text), private.set_skills(uuid, text[])
  from public, anon, authenticated;

drop policy "staff update" on public.skill_synonyms;
revoke update on public.skill_synonyms from authenticated;
alter table public.skill_synonyms
  add constraint from_name_is_a_tag check (from_name::text = lower(regexp_replace(btrim(from_name::text), '\s+', ' ', 'g'))
                                           and char_length(from_name::text) <= 40);

create function private.resolve_synonym_target() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  select y.skill_id into target from public.skill_synonyms y
  join public.skills s on s.name = y.from_name
  where s.id = new.skill_id;
  if target is not null then
    new.skill_id := target;
  end if;
  return new;
end $$;
create trigger resolve_synonym_target before insert on public.skill_synonyms
  for each row execute function private.resolve_synonym_target();

create function private.guard_skill_name() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.skill_synonyms where from_name = new.name) then
    raise exception '% is a synonym; use the skill it stands for', new.name using errcode = '23505';
  end if;
  return new;
end $$;
create trigger guard_skill_name before insert on public.skills
  for each row execute function private.guard_skill_name();
create trigger audit after delete on public.skills
  for each row execute function private.log_change();
