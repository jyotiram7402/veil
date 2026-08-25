# Veil / MyVoxa — Security Model

_This documents the security posture; it is not a guarantee. Security cannot be
certified — see “Remaining risks”._

## Threat model

The client is **untrusted**. We assume an attacker may know/guess room and chat
IDs, brute-force invitation codes, modify frontend JS / localStorage / cookies /
request bodies / URLs, replay old requests, signaling, or invitations, open
multiple tabs, and attempt cross-room access, impersonation, privilege
escalation, and admin-API access. All security decisions are made server-side or
in the database (RLS), never from client-supplied role/permission/identity.

## Authentication

- Supabase Auth (email+password grant) over httpOnly SSR cookies; usernames map
  to synthetic internal emails. No custom JWT/session table.
- **Admins** sign in with username+password. **Participants** never hold a known
  password: they open a per-user invite link (`/i/<token>`) or a room invite
  (`/join/<selector.verifier>`), pass a gate/verifier, and the server mints an
  ephemeral Supabase session. No email/phone/PII.
- Middleware refreshes the session and gates route prefixes; suspended/archived
  users are signed out. `getSessionUser()` is the server-side source of identity.

## Authorization

- **Admin**: every admin mutation checks `session.profile.is_admin` server-side
  and, for room-scoped actions, `assertRoomAdmin(room, user, isAdmin)` before
  using the service-role client. Participants cannot reach admin functionality by
  editing client state.
- **Rooms/chats**: gated by RLS via SECURITY DEFINER predicates
  `is_chat_member`, `can_access_chat` (membership + not blocked/removed + room
  active|locked), `can_chat_in` (adds room+participant chat permission), and
  `is_room_admin`. Effective voice/video permission lives in
  `src/lib/permissions.ts` and the `/api/calls/authorize` endpoint.
- **Column lock-down**: `authenticated` may UPDATE only `chat_members.last_read_at`
  (v5), so a participant cannot self-promote role or self-grant permissions.

## Row Level Security

| Table | RLS | Notes |
|---|---|---|
| profiles | on | SELECT = self OR admin OR shares-a-chat (v9, was `true`); self-UPDATE only |
| chats | on | SELECT members; INSERT/UPDATE/DELETE admin-only |
| chat_members | on | SELECT members; writes admin (service role); UPDATE column-locked to last_read_at |
| messages | on | SELECT `can_access_chat`; INSERT `can_chat_in`; UPDATE/DELETE sender or chat admin |
| invite_tokens | on | admin-only SELECT; writes service-role; removed from realtime (v9) |
| app_settings | on | admin-only; removed from realtime (v9) |
| room_invites | on | admin-only SELECT; writes service-role after `is_room_admin` |
| room_audit_log | on | admin-only SELECT; writes service-role |
| call_sessions | on | SELECT members; INSERT caller; UPDATE participant |
| realtime.messages | on | private `call:<chatId>` broadcast limited to chat members (v7) |

Negative RLS tests: `supabase/security-tests.sql`.

## Invitation security

- Room invites: split token `selector.verifier`; only a PBKDF2 hash of the
  verifier is stored; the raw code is shown once and never logged. Per-room,
  expiring, revocable, one-time/limited-use enforced by compare-and-set +
  atomic seat claim (`claim_room_seat`). Join is IP-rate-limited and returns a
  single generic error (`Invalid or expired invitation.`) — no room/token
  enumeration.
- Legacy per-user `invite_tokens.token` is still stored in plaintext as the URL
  path secret (256-bit random). It is no longer streamed over realtime (v9).
  Recommended future work: migrate to the selector/verifier hashed scheme (a
  non-destructive dual-read migration).

## WebRTC / calling security

- Signaling rides a **private** Supabase Realtime channel `call:<chatId>`;
  `realtime.messages` RLS restricts send/receive to chat members. Client-supplied
  caller/callee/room IDs are not trusted; every message carries the `callId` and
  stale/ended-call messages are ignored.
- Authorization is re-checked server-side at call start, on accept, on every
  reconnection, and every 30s while connected. Removed/blocked/suspended
  participants and ended rooms cannot start or keep a call; disabling room video
  stops the camera while voice continues.
- No audio/video is recorded, stored, uploaded, or transcribed. `call_sessions`
  holds metadata only.

## Privacy

No phone, email, legal name, address, DOB, social login, or location is required
for participants. Identities are temporary. No call recording/storage, no
analytics on invite URLs, `Referrer-Policy` limits leakage and join pages send
`referrer: no-referrer`.

## Secrets management

- `SUPABASE_SERVICE_ROLE_KEY` is server-only (never `NEXT_PUBLIC_`), used by
  `supabaseAdmin()` in route handlers/server components only.
- TURN is **not configured**; if added, use short-lived credentials — never
  commit provider master secrets. `.env.example` holds placeholders only.
- Secrets must never be logged. Errors returned to clients are generic.

## Security headers

HSTS; `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'`;
`X-Content-Type-Options: nosniff`; `Referrer-Policy: strict-origin-when-cross-origin`;
`Permissions-Policy: camera=(self), microphone=(self), geolocation=()`; CSP with
`default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`,
and a `connect-src` pinned to self + the Supabase project (https+wss). Script/style
still allow `'unsafe-inline'` (matches Next's inline bootstrap) — a nonce-based
CSP is recommended future work.

## Rate limiting / abuse

In-memory token-bucket (`src/lib/api.ts`) on login, invite gate, room join,
message send, room/invite creation, and lock. It is per-instance (resets on
cold start, not shared across serverless instances) and keys on a spoofable
`x-forwarded-for` — adequate as a speed bump, not a hard control. A shared store
(e.g. Postgres/Upstash) is recommended before public launch.

## Data retention

Messages, call events (system messages), and `call_sessions`/`room_audit_log`
persist until the room/user is deleted (cascades on FK delete). Ephemeral room
guests are flagged `is_room_guest` and are candidates for a future cleanup job.
No automatic purging is implemented; document and revisit per product needs.

## Remaining risks

- Distributed rate limiting not implemented (in-memory only).
- Legacy `invite_tokens` stored in plaintext (path secret).
- CSP allows `'unsafe-inline'` for scripts/styles (no nonce yet).
- Public chat realtime channels (`chat:<id>`, presence) are not private —
  typing/presence could be observed/spoofed by someone who knows the random
  chat UUID (low severity; IDs are unguessable).
- Browser calls cannot run while the page is fully suspended/terminated.
- No automated test runner in the repo (see the manual matrix in the report).
