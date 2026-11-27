-- ============================================================================
--  BlackFoxx — v16 migration
--  Run AFTER v2..v14.sql (v15 is the shared rate limit; either order is fine).
--  Idempotent.
--
--  Invite links that run out, direct links and "Forgot hashcode".
--   1. invite_tokens.expires_at: when a member's invite link stops letting
--      them sign in. A new link is open for 48 hours; the admin can keep it
--      open longer or for good (null). Links made before this file keep null,
--      so nobody is locked out by running it.
--   2. direct_links: a link the admin sends one member. It opens straight to
--      their hashcode, already filled in, and works once, for 48 hours. The
--      hashcode itself is never stored here: it travels in the part of the
--      link after "#", which browsers never send to a server.
--   3. hashcode_requests: "Forgot hashcode" from the sign-in screen. One open
--      request per member; the admin answers with a direct link or dismisses
--      it.
--
--  Nothing here is reachable from the browser: both new tables have RLS on and
--  no policies, so only the service role can read or write them. The API
--  routes do the checking (src/lib/member-access.ts).
--
--  Until this file has run, invite links never run out, and direct links and
--  hashcode requests answer that they are not available yet.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Invite links run out
-- ---------------------------------------------------------------------------
alter table public.invite_tokens
  add column if not exists expires_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Direct links
-- ---------------------------------------------------------------------------
create table if not exists public.direct_links (
  token      text primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz
);

create index if not exists direct_links_user_idx
  on public.direct_links (user_id);

alter table public.direct_links enable row level security;
revoke all on table public.direct_links from anon, authenticated;
grant all on table public.direct_links to service_role;

-- ---------------------------------------------------------------------------
-- 3. Forgot hashcode
-- ---------------------------------------------------------------------------
create table if not exists public.hashcode_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  typed_name  text not null check (char_length(typed_name) <= 60),
  device      text check (device is null or char_length(device) <= 60),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

create unique index if not exists hashcode_requests_one_open
  on public.hashcode_requests (user_id)
  where resolved_at is null;

alter table public.hashcode_requests enable row level security;
revoke all on table public.hashcode_requests from anon, authenticated;
grant all on table public.hashcode_requests to service_role;

commit;
