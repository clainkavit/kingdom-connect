create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  kind text not null check (kind ~ '^[A-Z][0-9]{1,2}$'),
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default now()
);
create index notifications_member_newest on public.notifications (member_id, created_at desc);

create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  category text not null,
  email boolean not null default true,
  push boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, category)
);

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('android', 'ios')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.email_outbox (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'skipped', 'failed')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default clock_timestamp(),
  last_error text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  sent_at timestamptz
);
create index email_outbox_due on private.email_outbox (next_attempt_at) where status in ('pending', 'sending');

do $$
declare t text;
begin
  foreach t in array array['notifications', 'notification_preferences', 'push_tokens']
  loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', t);
  end loop;
end $$;
create trigger set_updated_at before update on private.email_outbox
  for each row execute function private.set_updated_at();

revoke all on public.notifications, public.notification_preferences, public.push_tokens from anon, authenticated;
grant select, update (read_at) on public.notifications to authenticated;
grant select, insert, update (member_id, category, email, push) on public.notification_preferences to authenticated;
grant select, insert, delete on public.push_tokens to authenticated;
revoke all on private.email_outbox from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['notifications', 'notification_preferences', 'push_tokens']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy "base rule" on public.%I as restrictive for all to authenticated
      using ((select access.is_member()) or (select access.is_staff()))
      with check ((select access.is_member()) or (select access.is_staff()))$p$, t);
  end loop;
end $$;

create policy "own" on public.notifications for select to authenticated
  using (member_id = (select auth.uid()));
create policy "own, mark read" on public.notifications for update to authenticated
  using (member_id = (select auth.uid())) with check (member_id = (select auth.uid()));

create policy "own" on public.notification_preferences for select to authenticated
  using (member_id = (select auth.uid()));
create policy "own, add" on public.notification_preferences for insert to authenticated
  with check (member_id = (select auth.uid()));
create policy "own, change" on public.notification_preferences for update to authenticated
  using (member_id = (select auth.uid())) with check (member_id = (select auth.uid()));

create policy "own" on public.push_tokens for select to authenticated
  using (member_id = (select auth.uid()));
create policy "own, add" on public.push_tokens for insert to authenticated
  with check (member_id = (select auth.uid()));
create policy "own, remove" on public.push_tokens for delete to authenticated
  using (member_id = (select auth.uid()));

create function private.holds_contact_details(payload jsonb) returns boolean
language sql immutable set search_path = '' as $$
  with fields as (
    select key, value from jsonb_each_text(payload) where key !~ '(^id|_id)$'
  )
  select exists (select 1 from fields
                 where key in ('email', 'phone', 'phone_number', 'address', 'contact')
                    or value ~* '[^[:space:]@]+@[^[:space:]@]+\.[a-z]{2,}'
                    or value ~ '(\+|00)?255[ -]?[0-9]{2,3}[ -]?[0-9]{3}[ -]?[0-9]{3}'
                    or value ~ '(^|[^0-9])0[67][0-9]{2}[ -]?[0-9]{3}[ -]?[0-9]{3}([^0-9]|$)');
$$;

create function private.notify(member uuid, kind text, payload jsonb default '{}')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare created uuid;
begin
  if kind !~ '^[A-Z][0-9]{1,2}$' then
    raise exception 'unknown notification kind %', kind;
  end if;
  if jsonb_typeof(payload) <> 'object'
     or exists (select 1 from jsonb_each(payload) where jsonb_typeof(value) not in ('string', 'number')) then
    raise exception 'notification % needs a flat payload of text and numbers', kind;
  end if;
  if private.holds_contact_details(payload) then
    raise exception 'notification % carries contact details', kind;
  end if;
  if kind = 'I2' and exists (select 1 from jsonb_object_keys(payload) k
                             where k not in ('idea_title', 'idea_id', 'sector', 'band')) then
    raise exception 'an anonymous interest carries only the idea, sector and band';
  end if;
  insert into public.notifications (member_id, kind, payload) values (member, kind, payload)
    returning id into created;
  insert into private.email_outbox (member_id, kind, payload) values (member, kind, payload);
  return created;
end;
$$;

create function private.queue_message_digests() returns int
language plpgsql security definer set search_path = '' as $$
declare queued int;
begin
  with due as (
    select n.member_id, count(*) as unread
    from public.notifications n
    where n.kind = 'C3' and n.read_at is null
      and n.created_at > coalesce(
        (select max(o.created_at) from private.email_outbox o
         where o.member_id = n.member_id and o.kind = 'C3' and o.payload ? 'digest'),
        '-infinity')
    group by n.member_id
  )
  insert into private.email_outbox (member_id, kind, payload)
  select member_id, 'C3', jsonb_build_object('digest', true, 'count', unread) from due;
  get diagnostics queued = row_count;
  return queued;
end;
$$;

create function private.claim_emails(batch int default 50)
returns setof private.email_outbox
language sql security definer set search_path = '' as $$
  update private.email_outbox o set status = 'sending', attempts = o.attempts + 1,
    next_attempt_at = clock_timestamp() + interval '10 minutes'
  where o.id in (select id from private.email_outbox
                 where status in ('pending', 'sending') and next_attempt_at <= clock_timestamp()
                 order by created_at limit batch for update skip locked)
  returning o.*;
$$;

revoke all on function private.holds_contact_details(jsonb), private.notify(uuid, text, jsonb),
  private.queue_message_digests(), private.claim_emails(int) from public, anon, authenticated;

select cron.schedule('send-notification-emails', '* * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'functions_url')
      || '/send-notification-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
    body := '{}'::jsonb)
  where exists (select 1 from private.email_outbox
                where status in ('pending', 'sending') and next_attempt_at <= clock_timestamp())
$job$);

select cron.schedule('message-digest', '0 4 * * *', $job$ select private.queue_message_digests() $job$);
