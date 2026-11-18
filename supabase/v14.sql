-- ============================================================================
--  BlackFoxx — v14 migration
--  Run AFTER v2..v13.sql. Idempotent. The app works with or without it: until
--  it has run, the Mute switch answers "Muting isn't available yet".
--
--  Mute one chat: chat_members.muted. A person who mutes a chat gets no
--  notification for new messages in it; calls in it still ring.
--
--  No grant: people do not write this column themselves. The app changes it
--  through PATCH /api/chats/<id>/mute, with the service role, only on the
--  caller's own membership. They can read it, like the rest of their row.
-- ============================================================================

alter table public.chat_members
  add column if not exists muted boolean not null default false;
