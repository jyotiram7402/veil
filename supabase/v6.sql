-- ============================================================================
--  Veil / MyVoxa — v6 migration
--  Run AFTER v2..v5.sql. Idempotent.
--
--  1. Corrects LOCKED-room semantics: a locked room must keep its EXISTING
--     participants connected (only new joins are refused). v5's can_access_chat
--     denied chat whenever status <> 'active', which wrongly cut off existing
--     participants when a room was locked. Now active AND locked both allow
--     access for existing members; ended/expired revoke it.
--  2. Adds claim_room_seat(): an ATOMIC, race-safe seat claim used by the join
--     endpoint. A per-room advisory lock serializes concurrent joins so the
--     participant limit can never be exceeded by simultaneous requests.
--
--  No new tables. No RLS weakened. Non-room chats are unaffected (they are
--  never 'locked').
-- ============================================================================

-- ---------------------------------------------------------------------------
-- can_access_chat: allow existing members of a LOCKED room to keep chatting.
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
      and (c.type <> 'room' or c.status in ('active', 'locked'))
  );
$$;

revoke all on function public.can_access_chat(uuid, uuid) from public;
grant execute on function public.can_access_chat(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- claim_room_seat(room, user): atomic capacity check + membership insert.
--
-- Only new joins go through here (the room must be 'active' — locked/ended
-- rooms refuse new participants). A transaction-scoped advisory lock keyed on
-- the room id serializes concurrent joiners, so `count < max` and the insert
-- happen without a TOCTOU race. Returns true when the seat was granted.
-- ---------------------------------------------------------------------------
create or replace function public.claim_room_seat(p_room uuid, p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_max    integer;
  v_count  integer;
begin
  -- Serialize all joins to this room.
  perform pg_advisory_xact_lock(hashtext(p_room::text));

  select status, max_participants
    into v_status, v_max
    from public.chats
   where id = p_room and type = 'room';

  if v_status is null or v_status <> 'active' then
    return false;
  end if;

  -- Idempotent: an existing membership (e.g. rejoin) never consumes a new seat.
  if exists (
    select 1 from public.chat_members where chat_id = p_room and user_id = p_user
  ) then
    return true;
  end if;

  if v_max is not null then
    select count(*)
      into v_count
      from public.chat_members
     where chat_id = p_room
       and role = 'member'
       and blocked = false
       and removed_at is null;
    if v_count >= v_max then
      return false;
    end if;
  end if;

  insert into public.chat_members (chat_id, user_id, role)
    values (p_room, p_user, 'member');
  return true;
end;
$$;

revoke all on function public.claim_room_seat(uuid, uuid) from public;
grant execute on function public.claim_room_seat(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- can_chat_in(chat, user): may this user SEND a message here right now?
--
-- Enforces the effective CHAT permission server-side (not just in the UI):
-- for a room the sender must be an active member of an active/locked room with
-- BOTH the room-level chat flag and their own can_chat on. For non-room chats
-- it reduces exactly to can_access_chat (chat_enabled/can_chat default true and
-- the type<>'room' branch short-circuits), so existing chat is unchanged.
-- Reading history stays governed by can_access_chat; only sending is gated here.
-- ---------------------------------------------------------------------------
create or replace function public.can_chat_in(p_chat uuid, p_user uuid)
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
      and (
        c.type <> 'room'
        or (c.status in ('active', 'locked') and c.chat_enabled and m.can_chat)
      )
  );
$$;

revoke all on function public.can_chat_in(uuid, uuid) from public;
grant execute on function public.can_chat_in(uuid, uuid) to authenticated, service_role;

-- Message insert must satisfy the effective chat permission.
drop policy if exists "messages insert by active member" on public.messages;
create policy "messages insert by active member"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.can_chat_in(chat_id, auth.uid())
    and not exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and (p.suspended or p.archived)
    )
  );
