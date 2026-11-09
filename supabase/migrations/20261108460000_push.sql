-- M03: push notifications for the Android and iOS apps (PRD section 14). A phone registers its Expo push token
-- after the member allows notifications. Push is on once allowed, with one master switch ('all') and one switch per
-- category in notification_preferences; no row means on. Every notification is queued for push by a trigger, and
-- the send-push-notifications function decides what is pushed: only kinds the catalogue marks for push, only when
-- the master and the category are on, and only with the push text, which for a new message is "You have a new
-- message" and never a preview. The function sends through Expo and removes tokens Expo reports as gone.

-- Register or move a phone's token to the signed-in member. A member keeps their 5 newest phones.
create function access.register_push_token(token text, platform text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  clean text := btrim(coalesce(token, ''));
begin
  if not (select access.is_member()) then
    return 'not_allowed';
  end if;
  if platform is null or platform not in ('android', 'ios') then
    return 'invalid_platform';
  end if;
  if clean !~ '^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]{10,60}\]$' then
    return 'invalid_token';
  end if;
  insert into public.push_tokens (member_id, token, platform) values (auth.uid(), clean, platform)
  on conflict on constraint push_tokens_token_key do update
  set member_id = excluded.member_id, platform = excluded.platform, updated_at = now();
  delete from public.push_tokens t
  where t.member_id = auth.uid()
    and t.id not in (select p.id from public.push_tokens p where p.member_id = auth.uid()
                     order by p.updated_at desc, p.created_at desc limit 5);
  return 'ok';
end;
$$;

-- The phone signs out or the member turns notifications off on it.
create function access.remove_push_token(token text) returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not (select access.is_member()) then
    return 'not_allowed';
  end if;
  delete from public.push_tokens t where t.member_id = auth.uid() and t.token = btrim(coalesce(remove_push_token.token, ''));
  return case when found then 'ok' else 'not_found' end;
end;
$$;

-- S46: the push master switch and the categories that can push, on unless switched off.
create function access.my_push_preferences() returns table (category text, enabled boolean)
language sql stable security definer set search_path = '' as $$
  select c.category, coalesce((select p.push from public.notification_preferences p
                               where p.member_id = auth.uid() and p.category = c.category), true)
  from unnest(array['all', 'account', 'connections', 'messages', 'opportunities', 'ideas', 'plans']) with ordinality as c (category, n)
  where (select access.is_member())
  order by c.n;
$$;

create function access.set_push_preference(category text, enabled boolean) returns text
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not (select access.is_member()) then
    return 'not_allowed';
  end if;
  if category is null or category not in ('all', 'account', 'connections', 'messages', 'opportunities', 'ideas', 'plans')
     or enabled is null then
    return 'invalid_category';
  end if;
  insert into public.notification_preferences (member_id, category, push) values (auth.uid(), category, enabled)
  on conflict on constraint notification_preferences_member_id_category_key do update set push = excluded.push;
  return 'ok';
end;
$$;

revoke all on function access.register_push_token(text, text), access.remove_push_token(text),
  access.my_push_preferences(), access.set_push_preference(text, boolean) from public, anon;
grant execute on function access.register_push_token(text, text), access.remove_push_token(text),
  access.my_push_preferences(), access.set_push_preference(text, boolean) to authenticated;

create function public.register_push_token(token text, platform text) returns text
language sql volatile security invoker set search_path = '' as $$ select access.register_push_token(token, platform); $$;
create function public.remove_push_token(token text) returns text
language sql volatile security invoker set search_path = '' as $$ select access.remove_push_token(token); $$;
create function public.my_push_preferences() returns table (category text, enabled boolean)
language sql stable security invoker set search_path = '' as $$ select * from access.my_push_preferences(); $$;
create function public.set_push_preference(category text, enabled boolean) returns text
language sql volatile security invoker set search_path = '' as $$ select access.set_push_preference(category, enabled); $$;
revoke all on function public.register_push_token(text, text), public.remove_push_token(text),
  public.my_push_preferences(), public.set_push_preference(text, boolean) from public, anon;
grant execute on function public.register_push_token(text, text), public.remove_push_token(text),
  public.my_push_preferences(), public.set_push_preference(text, boolean) to authenticated;

-- The queue the sender works from, one row per notification.
create table private.push_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'skipped', 'failed')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default clock_timestamp(),
  last_error text,
  created_at timestamptz not null default clock_timestamp(),
  sent_at timestamptz,
  unique (notification_id)
);
create index push_outbox_due on private.push_outbox (next_attempt_at) where status in ('pending', 'sending');
revoke all on private.push_outbox from public, anon, authenticated;

create function private.queue_push() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.push_outbox (notification_id, member_id, kind, payload)
  values (new.id, new.member_id, new.kind, new.payload);
  return null;
end;
$$;
create trigger queue_push after insert on public.notifications
  for each row execute function private.queue_push();
revoke all on function private.queue_push() from public, anon, authenticated;

create function private.claim_pushes(batch int default 50) returns setof private.push_outbox
language sql security definer set search_path = '' as $$
  update private.push_outbox o set status = 'sending', attempts = o.attempts + 1,
    next_attempt_at = clock_timestamp() + interval '10 minutes'
  where o.id in (select id from private.push_outbox
                 where status in ('pending', 'sending') and next_attempt_at <= clock_timestamp()
                 order by created_at limit batch for update skip locked)
  returning o.*;
$$;
revoke all on function private.claim_pushes(int) from public, anon, authenticated;

select cron.schedule('send-push-notifications', '* * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_url')
      || '/send-push-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
    body := '{}'::jsonb)
  where exists (select 1 from private.push_outbox
                where status in ('pending', 'sending') and next_attempt_at <= clock_timestamp())
$job$);
