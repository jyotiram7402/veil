-- ============================================================================
--  BlackFoxx — v10 migration
--  Run AFTER v2..v9.sql. Idempotent.
--
--  Sign-up with an invite code.
--   1. signup_codes: the codes the admin hands out. Only a SHA-256 hash of each
--      code is stored, plus its last 4 characters so the admin can tell codes
--      apart in the list. The code itself is shown once, when it is created.
--   2. profiles.signup_code_id: which code a member joined with.
--   3. claim_signup_code() / release_signup_code(): count a use atomically, so
--      two people can never both take the last use of a code.
--
--  Nothing here is reachable from the browser: the table has RLS switched on
--  and no policies, and the functions can only be run by the service role. The
--  API routes do the checking (src/app/api/auth/signup and
--  src/app/api/admin/signup-codes).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Codes
-- ---------------------------------------------------------------------------
create table if not exists public.signup_codes (
  id           uuid primary key default gen_random_uuid(),
  code_hash    text not null unique,
  code_hint    text not null,
  label        text,
  max_uses     integer not null default 1 check (max_uses between 1 and 1000),
  use_count    integer not null default 0 check (use_count >= 0),
  expires_at   timestamptz,
  revoked_at   timestamptz,
  last_used_at timestamptz,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

alter table public.signup_codes enable row level security;

-- No policies on purpose: only the service role (which bypasses RLS) may read
-- or write this table. The revoke is a second lock on the same door.
revoke all on table public.signup_codes from anon, authenticated;
grant all on table public.signup_codes to service_role;

-- ---------------------------------------------------------------------------
-- 2. Which code a member joined with
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists signup_code_id uuid
  references public.signup_codes(id) on delete set null;

create index if not exists profiles_signup_code_idx
  on public.profiles (signup_code_id)
  where signup_code_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Atomic use counting
-- ---------------------------------------------------------------------------
-- Takes one use of a code. Returns the code's id, or NULL when the code does
-- not exist, is revoked, has expired or has no uses left.
create or replace function public.claim_signup_code(p_code_hash text)
returns uuid
language sql
set search_path = public
as $$
  update public.signup_codes
     set use_count    = use_count + 1,
         last_used_at = now()
   where code_hash = p_code_hash
     and revoked_at is null
     and (expires_at is null or expires_at > now())
     and use_count < max_uses
  returning id;
$$;

-- Gives a use back when the account could not be created after all.
create or replace function public.release_signup_code(p_id uuid)
returns void
language sql
set search_path = public
as $$
  update public.signup_codes
     set use_count = greatest(use_count - 1, 0)
   where id = p_id;
$$;

revoke all on function public.claim_signup_code(text)   from public, anon, authenticated;
revoke all on function public.release_signup_code(uuid) from public, anon, authenticated;
grant execute on function public.claim_signup_code(text)   to service_role;
grant execute on function public.release_signup_code(uuid) to service_role;
