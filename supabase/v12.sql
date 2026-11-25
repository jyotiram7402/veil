-- ============================================================================
--  BlackFoxx — v12 migration
--  Run AFTER v2..v11.sql. Idempotent.
--
--  Notifications for a closed app (web push).
--   1. push_subscriptions: one row per browser or phone that asked for
--      notifications. It holds the address the browser's push service gave
--      that device and the two keys a message for it is encrypted with.
--      seen_at is the last time the app was open and in front on that device;
--      a device that is looking at the app gets no notification.
--   2. push_keys: the one key pair this server signs its pushes with. The
--      server creates it the first time somebody turns notifications on, so
--      there is nothing to set up by hand. Do not empty this table: every
--      device would have to turn notifications on again.
--
--  Nothing here is reachable from the browser: both tables have RLS switched
--  on and no policies, so only the service role can read or write them. The
--  API routes do the checking (src/app/api/push and src/lib/push.ts).
--
--  The app keeps working if this file has not been run yet: "Turn on
--  notifications" then says they are not available.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Devices
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  seen_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- No policies on purpose: only the service role (which bypasses RLS) may read
-- or write this table. The revoke is a second lock on the same door.
revoke all on table public.push_subscriptions from anon, authenticated;
grant all on table public.push_subscriptions to service_role;

-- ---------------------------------------------------------------------------
-- 2. The server's key pair (always exactly one row)
-- ---------------------------------------------------------------------------
create table if not exists public.push_keys (
  id          smallint primary key default 1 check (id = 1),
  public_key  text not null,
  private_key text not null,
  created_at  timestamptz not null default now()
);

alter table public.push_keys enable row level security;

revoke all on table public.push_keys from anon, authenticated;
grant all on table public.push_keys to service_role;

commit;

-- Tell the API layer about the two new tables right away (Supabase normally
-- notices by itself; this makes sure).
notify pgrst, 'reload schema';
