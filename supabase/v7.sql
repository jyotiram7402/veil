-- ============================================================================
--  Veil / MyVoxa — v7 migration
--  Run AFTER v2..v6.sql. Idempotent.
--
--  Voice audio itself is peer-to-peer WebRTC and never touches the database.
--  This migration only adds:
--   1. SECURE SIGNALING AUTHORIZATION — RLS on realtime.messages so that a
--      PRIVATE broadcast channel named 'call:<chatId>' can only be used by the
--      authenticated members of that chat. This is what stops an arbitrary user
--      from injecting offer/answer/ICE into someone else's call. It affects
--      ONLY private channels whose topic starts with 'call:'; every existing
--      PUBLIC channel (chat typing, presence, admin dashboards) is untouched.
--   2. call_sessions — a lightweight call-history / state row (no media, no
--      SDP, no ICE). Reuses chats + profiles; adds no user/chat duplication.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Private-channel signaling authorization (realtime.messages RLS)
--
--    realtime.topic() returns the channel name for the row being authorized.
--    We gate broadcast/presence on 'call:' topics to members of that chat.
--    Non-'call:' topics are not matched here, so public channels are unaffected.
-- ---------------------------------------------------------------------------
-- NOTE: realtime.messages already has RLS enabled by Supabase (its table is
-- owned by an internal role, so ENABLE ROW LEVEL SECURITY here would fail with
-- "must be owner" and isn't needed). We only add the authorization policies.

drop policy if exists "call signaling: members can read" on realtime.messages;
create policy "call signaling: members can read"
  on realtime.messages for select
  to authenticated
  using (
    extension in ('broadcast', 'presence')
    and starts_with((select realtime.topic()), 'call:')
    and public.is_chat_member(
      nullif(split_part((select realtime.topic()), ':', 2), '')::uuid,
      auth.uid()
    )
  );

drop policy if exists "call signaling: members can send" on realtime.messages;
create policy "call signaling: members can send"
  on realtime.messages for insert
  to authenticated
  with check (
    extension in ('broadcast', 'presence')
    and starts_with((select realtime.topic()), 'call:')
    and public.is_chat_member(
      nullif(split_part((select realtime.topic()), ':', 2), '')::uuid,
      auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 2. call_sessions: 1-to-1 call history / state. No audio, no SDP, no ICE.
-- ---------------------------------------------------------------------------
create table if not exists public.call_sessions (
  id           uuid primary key default gen_random_uuid(),
  chat_id      uuid not null references public.chats(id) on delete cascade,
  caller_id    uuid not null references public.profiles(id) on delete cascade,
  callee_id    uuid not null references public.profiles(id) on delete cascade,
  kind         text not null default 'voice' check (kind in ('voice')),
  status       text not null default 'ringing'
                 check (status in ('ringing','connected','ended','rejected','cancelled','missed','busy','failed')),
  created_at   timestamptz not null default now(),
  connected_at timestamptz,
  ended_at     timestamptz,
  end_reason   text
);

create index if not exists call_sessions_chat_idx
  on public.call_sessions (chat_id, created_at desc);

alter table public.call_sessions enable row level security;

-- Visible to the two chat members only.
drop policy if exists "call_sessions select if member" on public.call_sessions;
create policy "call_sessions select if member"
  on public.call_sessions for select
  to authenticated
  using (public.is_chat_member(chat_id, auth.uid()));

-- Only the caller can open a session, and only for a chat they belong to.
drop policy if exists "call_sessions insert by caller" on public.call_sessions;
create policy "call_sessions insert by caller"
  on public.call_sessions for insert
  to authenticated
  with check (
    caller_id = auth.uid()
    and public.is_chat_member(chat_id, auth.uid())
  );

-- Either participant can update status (accept / end / etc.).
drop policy if exists "call_sessions update by participant" on public.call_sessions;
create policy "call_sessions update by participant"
  on public.call_sessions for update
  to authenticated
  using (
    (caller_id = auth.uid() or callee_id = auth.uid())
    and public.is_chat_member(chat_id, auth.uid())
  )
  with check (
    (caller_id = auth.uid() or callee_id = auth.uid())
    and public.is_chat_member(chat_id, auth.uid())
  );

-- Realtime (RLS still scopes rows to the two members).
do $$
begin
  begin
    alter publication supabase_realtime add table public.call_sessions;
  exception when duplicate_object then null;
  end;
end$$;
