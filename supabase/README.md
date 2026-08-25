# Supabase setup

Run these files in order in **Supabase Studio → SQL Editor → New query**:

1. `schema.sql` — tables, indexes, helper functions, triggers, realtime publication
2. `policies.sql` — row-level security policies for every table
3. `storage.sql` — `avatars` (public) and `attachments` (private) buckets + policies
4. `v2.sql` — invite tokens, app settings, admin-only chat policies, suspended flag
5. `v3.sql` — per-token gate password + per-user settings overrides
6. `v4.sql` — secure rooms & invitations: room lifecycle/permission
   columns on `chats`, `chat_members.blocked`, `profiles.is_room_guest`, `room_invites`,
   `room_audit_log`, `is_room_admin()` / `can_access_chat()` helpers, and the RLS updates
7. `v5.sql` — per-participant permissions (`chat_members.can_chat/
   can_voice/can_video`), soft-remove (`chat_members.removed_at`), `can_access_chat()` update,
   column-level UPDATE lock-down on `chat_members` (only `last_read_at` for authenticated), and
   an owner index for the admin room list
8. `v6.sql` — locked-room fix in `can_access_chat()` (existing
   participants stay), atomic `claim_room_seat()` (race-safe participant limit), and
   `can_chat_in()` which enforces the effective chat permission on message insert server-side
9. `v7.sql` — 1-to-1 voice calling: RLS on `realtime.messages`
   so only chat members can use the private `call:<chatId>` signaling channel, and a
   `call_sessions` history table (no audio/SDP/ICE stored). Voice audio is peer-to-peer WebRTC.
10. `v8.sql` — call/chat integration: `call_sessions.kind` now
    allows `'video'`, plus `duration_seconds` and an idempotent `event_posted` flag so a
    completed/missed/failed call leaves exactly one `system` message in the chat timeline.
11. `v9.sql` — admin-gates the
    `get_or_create_direct_chat` RPC, tightens `profiles` SELECT (self/admin/shares-a-chat),
    removes `invite_tokens`/`app_settings` from the realtime publication, and re-asserts RLS.

Run `security-tests.sql` afterwards (see its header) to verify the RLS negative cases.
Each file is idempotent, so it is safe to re-run if you tweak something.

After that, in **Authentication → Providers**:

- Disable everything except **Email**.
- Under **Email**, turn **off** the "Confirm email" toggle. Users created via
  the service role can sign in immediately, which is the flow Rooms uses.

Then create your first user from the running app:

```bash
curl -X POST https://YOUR_DEPLOYMENT/api/admin/users \
  -H "Content-Type: application/json" \
  -H "x-admin-token: $ADMIN_BOOTSTRAP_TOKEN" \
  -d '{"username":"jay","password":"a-strong-password","isAdmin":true}'
```

That account is your admin. Subsequent users are created from `/admin` in the
UI; for regular (non-admin) users you don't need to set a password — the app
auto-generates an invite link instead.
