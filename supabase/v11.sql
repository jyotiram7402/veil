-- ============================================================================
--  BlackFoxx — v11 migration
--  Run AFTER v2..v10.sql. Idempotent. The app needs no change with it.
--
--  Closes three doors that row-level security left open. RLS decides WHICH
--  ROWS a signed-in person may change; it says nothing about WHICH COLUMNS.
--  Anyone who is signed in can talk to the database directly (its address and
--  the public key are in the page), so every column they may write to has to
--  be allowed on purpose.
--
--   1. profiles: a person could change every column of their own row. That
--      included is_admin (make themselves the admin), suspended / archived
--      (lift their own suspension), settings (switch off what the admin set
--      for them) and is_room_guest. Now: display_name, bio, avatar_url and
--      last_seen_at, nothing else.
--   2. messages: a sender could rewrite their own messages in every column,
--      including chat_id (move one into a chat they are not in) and type.
--      The app never edits a message, so UPDATE is taken away. INSERT is
--      limited to the kinds a person can send: "system" notes (call results)
--      are written by the server only.
--   3. call_sessions: the two people of a call may change its state, and
--      nothing else (not who called, not whether its note was posted).
--
--  Everything the admin does, and everything the server does, goes through
--  the service role. These limits do not apply to it.
--
--  All or nothing: if any statement fails, nothing is changed.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. profiles
-- ---------------------------------------------------------------------------
revoke update on public.profiles from anon, authenticated;
grant update (display_name, bio, avatar_url, last_seen_at)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 2. messages
-- ---------------------------------------------------------------------------
drop policy if exists "messages update by sender" on public.messages;
revoke update on public.messages from anon, authenticated;

drop policy if exists "messages insert by active member" on public.messages;
create policy "messages insert by active member"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and type in ('text', 'image', 'file')
    and public.can_chat_in(chat_id, auth.uid())
    and not exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and (p.suspended or p.archived)
    )
  );

-- ---------------------------------------------------------------------------
-- 3. call_sessions
-- ---------------------------------------------------------------------------
revoke update on public.call_sessions from anon, authenticated;
grant update (status, connected_at, ended_at, end_reason)
  on public.call_sessions to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Afterwards, look once at who is an admin. Only your own account should be
-- listed. (This only reads; run it as a separate query.)
--
--   select username, display_name, created_at from public.profiles where is_admin;
-- ---------------------------------------------------------------------------
