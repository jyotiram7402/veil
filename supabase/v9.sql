-- ============================================================================
--  Veil / MyVoxa — v9 migration
--  Run AFTER v2..v8.sql. Idempotent.
--
--  Fixes found during the audit:
--   1. PRIVILEGE BYPASS: get_or_create_direct_chat() is SECURITY DEFINER and was
--      granted to every authenticated user, so any signed-in user (including an
--      ephemeral room guest) could create a direct chat with any profile,
--      bypassing the v2 "chats insert by admin only" model — callable straight
--      from the browser via supabase.rpc(). Now it requires an admin caller.
--   2. PROFILE ENUMERATION: profiles SELECT used `using (true)`, letting any
--      signed-in user read EVERY profile (usernames, is_admin, bio, settings).
--      Tightened to self OR admin OR someone you share a chat with.
--   3. REALTIME EXPOSURE: invite_tokens (contains gate_password_hash) and
--      app_settings were in the realtime publication, protected only by RLS.
--      No client subscribes to them — removed from the publication to shrink the
--      attack surface.
--
--  RLS is re-asserted (idempotent) on all sensitive tables. Nothing here relaxes
--  an existing policy.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Lock get_or_create_direct_chat() to admins (defense in depth: the API
--    route also checks, but the RPC is directly callable by any authenticated
--    browser client, so the guard MUST live in the function too).
-- ---------------------------------------------------------------------------
create or replace function public.get_or_create_direct_chat(p_other uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me      uuid := auth.uid();
  v_chat_id uuid;
begin
  if v_me is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_admin(v_me) then
    raise exception 'admin only';
  end if;
  if v_me = p_other then
    raise exception 'cannot create direct chat with self';
  end if;

  select c.id into v_chat_id
    from public.chats c
    join public.chat_members a on a.chat_id = c.id and a.user_id = v_me
    join public.chat_members b on b.chat_id = c.id and b.user_id = p_other
   where c.type = 'direct'
   limit 1;

  if v_chat_id is not null then
    return v_chat_id;
  end if;

  insert into public.chats (type, created_by)
    values ('direct', v_me)
    returning id into v_chat_id;

  insert into public.chat_members (chat_id, user_id, role)
    values (v_chat_id, v_me, 'admin'),
           (v_chat_id, p_other, 'member');

  return v_chat_id;
end;
$$;

revoke all on function public.get_or_create_direct_chat(uuid) from public;
grant execute on function public.get_or_create_direct_chat(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Profile-read hardening. Helper avoids RLS recursion on chat_members.
-- ---------------------------------------------------------------------------
create or replace function public.shares_chat(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_members x
    join public.chat_members y on x.chat_id = y.chat_id
    where x.user_id = p_a and y.user_id = p_b
  );
$$;

revoke all on function public.shares_chat(uuid, uuid) from public;
grant execute on function public.shares_chat(uuid, uuid) to authenticated, service_role;

drop policy if exists "profiles read all signed-in" on public.profiles;
drop policy if exists "profiles read self admin or shared" on public.profiles;
create policy "profiles read self admin or shared"
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or public.is_admin(auth.uid())
    or public.shares_chat(auth.uid(), id)
  );

-- ---------------------------------------------------------------------------
-- 3. Shrink realtime surface: no client needs to stream these, and one carries
--    a password hash. Guarded so re-runs / fresh installs don't error.
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime drop table public.invite_tokens;
  exception when others then null;
  end;
  begin
    alter publication supabase_realtime drop table public.app_settings;
  exception when others then null;
  end;
end$$;

-- ---------------------------------------------------------------------------
-- Re-assert RLS on every sensitive table (idempotent; enabling an already-
-- enabled table is a no-op). No policy is relaxed here.
-- ---------------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.chats          enable row level security;
alter table public.chat_members   enable row level security;
alter table public.messages       enable row level security;
alter table public.invite_tokens  enable row level security;
alter table public.app_settings   enable row level security;
alter table public.room_invites   enable row level security;
alter table public.room_audit_log enable row level security;
alter table public.call_sessions  enable row level security;
