-- ============================================================================
--  Veil / MyVoxa — v8 migration
--  Run AFTER v2..v7.sql. Idempotent.
--
--  No new tables. Extends the call_sessions table so a completed/
--  missed/failed call can leave ONE minimal event in the chat timeline:
--   - kind now allows 'video' (voice/video share the same session)
--   - duration_seconds: computed server-side from connected_at → ended_at
--   - event_posted: idempotency guard so the timeline event is inserted once,
--     no matter how many terminal signals arrive
--
--  Call events are rendered by REUSING the existing `messages` system-message
--  type (a centered pill), so there is no second message system and no schema
--  change to messages. Still no audio/video/recording is ever stored.
-- ============================================================================

alter table public.call_sessions drop constraint if exists call_sessions_kind_check;
alter table public.call_sessions
  add constraint call_sessions_kind_check check (kind in ('voice', 'video'));

alter table public.call_sessions
  add column if not exists duration_seconds integer,
  add column if not exists event_posted boolean not null default false;
