-- ============================================================================
--  BlackFoxx — v15 migration
--  Run AFTER v2..v14.sql. Idempotent. The app works with or without it: until
--  it has run, each server instance counts attempts on its own, as before.
--
--  A shared limit on guessing: Admin login, a member's name and hashcode, a
--  direct link's hashcode, the screen lock, room access codes and the
--  first-admin token. Every server instance takes from the same bucket, so a
--  new instance (cold start) no longer hands out a fresh allowance.
--
--  rate_limits holds one row per bucket. The key is a SHA-256 hash made by the
--  server, so no address, name or token is stored here. Rows idle for a day
--  are removed now and then by take_rate_token itself.
--
--  No policies and no grants: only the service role, through the function.
-- ============================================================================

create table if not exists public.rate_limits (
  key        text primary key,
  tokens     double precision not null,
  updated_at timestamptz not null default now()
);

create index if not exists rate_limits_updated_at on public.rate_limits (updated_at);

alter table public.rate_limits enable row level security;
revoke all on table public.rate_limits from anon, authenticated;

-- A token bucket: p_limit tokens, refilled evenly over p_per_ms milliseconds.
-- True when a token was taken. The row lock makes two requests at the same
-- moment wait for each other, so a bucket is never overdrawn.
create or replace function public.take_rate_token(p_key text, p_limit integer, p_per_ms integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now    timestamptz := clock_timestamp();
  v_tokens double precision;
begin
  if p_key is null or length(p_key) = 0 or p_limit is null or p_limit < 1
     or p_per_ms is null or p_per_ms < 1 then
    return false;
  end if;

  insert into public.rate_limits (key, tokens, updated_at)
  values (p_key, p_limit, v_now)
  on conflict (key) do nothing;

  select least(
           p_limit::double precision,
           r.tokens + extract(epoch from (v_now - r.updated_at)) * 1000.0 / p_per_ms * p_limit
         )
    into v_tokens
    from public.rate_limits r
   where r.key = p_key
     for update;

  if v_tokens < 1 then
    update public.rate_limits set tokens = v_tokens, updated_at = v_now where key = p_key;
    return false;
  end if;

  update public.rate_limits set tokens = v_tokens - 1, updated_at = v_now where key = p_key;

  if random() < 0.01 then
    delete from public.rate_limits where updated_at < v_now - interval '1 day';
  end if;

  return true;
end;
$$;

revoke all on function public.take_rate_token(text, integer, integer) from public, anon, authenticated;
grant execute on function public.take_rate_token(text, integer, integer) to service_role;
