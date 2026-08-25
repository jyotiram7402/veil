-- ============================================================================
--  Veil / MyVoxa — v5 migration
--  Run AFTER schema.sql + policies.sql + storage.sql + v2.sql + v3.sql + v4.sql.
--  Idempotent: safe to re-run.
--
--  Adds:
--    - per-participant permission flags on chat_members (can_chat/voice/video)
--    - a soft-remove marker (removed_at) so "removed" participants are retained
--      for the admin view and reliably rejected on reconnect
--    - can_access_chat() now also denies removed participants
--    - COLUMN-LEVEL update lock-down: authenticated users may only ever update
--      chat_members.last_read_at. This closes the self-escalation gap
--      (a member could previously flip their own role/permissions via RLS) and
--      satisfies "a participant must not modify their own permissions".
--    - an owner index on rooms for the admin room list
--
--  Backward compatible: new permission columns default true, removed_at
--  defaults null, so existing direct/group/room members behave exactly as
--  before.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- chat_members: per-participant permissions + soft-remove marker
-- ---------------------------------------------------------------------------
alter table public.chat_members
  add column if not exists can_chat   boolean not null default true,
  add column if not exists can_voice  boolean not null default true,
  add column if not exists can_video  boolean not null default true,
  add column if not exists removed_at timestamptz;

-- ---------------------------------------------------------------------------
-- Redefine can_access_chat to also exclude removed participants. Still exactly
-- equivalent to is_chat_member for non-room chats (removed_at/blocked default
-- to null/false there).
-- ---------------------------------------------------------------------------
create or replace function public.can_access_chat(p_chat uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_members m
    join public.chats c on c.id = m.chat_id
    where m.chat_id = p_chat
      and m.user_id = p_user
      and m.blocked = false
      and m.removed_at is null
      and (c.type <> 'room' or c.status = 'active')
  );
$$;

revoke all on function public.can_access_chat(uuid, uuid) from public;
grant execute on function public.can_access_chat(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Column-level update lock-down on chat_members.
--
-- The existing RLS policy "members update last_read by self" gates WHICH rows
-- an authenticated user may update (their own). This restricts WHICH COLUMNS
-- they may touch to last_read_at only. Admin mutations (blocked / can_* /
-- removed_at) all run through the service role, which bypasses column grants.
-- ---------------------------------------------------------------------------
revoke update on public.chat_members from authenticated;
grant update (last_read_at) on public.chat_members to authenticated;

-- ---------------------------------------------------------------------------
-- Index: fast lookup of an admin's own rooms.
-- ---------------------------------------------------------------------------
create index if not exists chats_created_by_room_idx
  on public.chats (created_by) where type = 'room';
