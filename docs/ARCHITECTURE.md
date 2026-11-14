# Architecture

Module-by-module map. Read this when a task touches more than one area; for
setup and day-to-day rules see `CLAUDE.md`. Security model: `docs/SECURITY.md`.

## Request / data flow

> **The first step below does not run in production.** `middleware.ts` sits in the repo root,
> but with `src/app` Next.js only loads `src/middleware.ts`. Pages, layouts and API routes do
> the auth checks and redirects themselves (`getSessionUser`, `requireSessionUser`,
> `redirectIfSignedIn`). The diagram shows the intended design once the file is moved.

```
Browser ──► middleware.ts → src/lib/supabase/middleware.ts (updateSession)
              │  refresh auth cookie, getUser(), load profiles(is_admin, suspended, archived)
              │  logged-out: public paths pass ("/" is the first screen); the rest → /login?next=…
              │  signed-in on an entry screen (/ /login /signup) → /chats or /chat
              │  suspended/archived → sign out → /expired
              │  admin-only prefixes (/chats /settings /admin /archive /rooms) ← non-admins → /chat
              │  /chat ← admins → /chats
              ▼
        Server Components (src/app/**/page.tsx, layout.tsx)
              │  getSessionUser() (React-cached per request) + supabaseServer() → RLS as the user
              ▼
        Client Components ──► fetch /api/** for every mutation
              │                  └─ route handler: auth check → zod parse → supabaseServer (RLS)
              │                     or supabaseAdmin (service role, only after explicit checks)
              └─ supabaseBrowser() for Realtime (postgres_changes, broadcast, presence)
```

## Route groups (`src/app`)

| Path | Who | What |
|---|---|---|
| `page.tsx` | signed-out | first screen: animated moji wall, Log in / Sign up (`components/auth/first-screen.tsx`); signed-in visitors are redirected by the page |
| `(auth)/login` | admin | username + password sign-in (`/api/auth/login`), inside `components/auth/auth-shell.tsx` |
| `(auth)/signup` | signed-out | sign-up with an invite code (`components/auth/signup-form.tsx` → `/api/auth/signup`); `?code=` pre-fills it |
| `(app)/layout.tsx` | admin | requires `is_admin`; loads chat list (`loadChatsForUser`) into `AppShell` |
| `(app)/chats`, `chats/[id]` | admin | chat list + thread (`components/chat/chat-thread.tsx`) |
| `(app)/admin` | admin | Members / Archive / Defaults / Account tabs (`components/admin-panel.tsx`) |
| `(app)/rooms`, `rooms/[id]` | admin | rooms dashboard + room management (`components/rooms/*`) |
| `(app)/settings` | admin | own profile |
| `(user)/chat` | member | single 1:1 chat with an admin (`components/user-chat.tsx`) |
| `(user)/expired` | anyone | dead-end page after suspension / sign-out |
| `i/[token]` | member | per-member invite link + gate password → session |
| `join`, `join/[code]` | guest | room access-code form (`components/rooms/join-form.tsx`) |
| `room/[id]` | guest | room chat view (`components/rooms/room-chat.tsx`) |
| `error.tsx` | — | error boundary; shows `Ref: <digest>` to match against Vercel logs |

## API routes (`src/app/api`)

- `auth/` — `login`, `logout`, `end-session` (beacon logout), `session`, `signup` (public;
  an invite code + username + password → a member account, signed in).
- `admin/signup-codes` — list / create (the code is returned once), `[id]` DELETE switches one off.
- `admin/` — `users` (list; create — bootstrap-token path when `profiles` is empty),
  `users/[id]` (archive / `?hard=1` delete), `.../suspend`, `.../restore`, `.../invite`
  (rotate/enable/revoke invite link), `.../settings` (per-user overrides), `.../chat`
  (open admin↔member chat), `settings` (global `app_settings`), `me` (own username/password).
- `chats/` — list/create (admin), `[id]` (rename/delete), `[id]/messages` (page via
  `before=`, resync via `after=`), `[id]/read`, `[id]/members`.
- `messages/[id]` — delete. `upload` — avatars (public) / attachments (signed URLs).
- `i/[token]` — gate password check → rotate the member's auth password → sign in.
- `lock` — unlock `SessionLock` with the gate password.
- `rooms/` — list/create, `[id]` (detail / patch status+flags), `[id]/invites`,
  `[id]/invites/[inviteId]` (revoke), `[id]/participants/[userId]` (perms/block/remove),
  `[id]/me` (caller's effective permissions), `join` (public; access code → guest session).
- `calls/authorize?chatId=&feature=voice|video` — server-side call authorization.
- `calls/[id]/event` — caller posts one call-outcome system message (idempotent).
- `profile`, `profile/heartbeat` (last_seen), `users/search` (admin picker), `health`.

## Libraries (`src/lib`)

- `env.ts` — typed env access; throws if public Supabase vars missing. Direct `process.env`
  reads elsewhere: `next.config.ts`, `webrtc/ice.ts`, `app/api/health`.
- `supabase/client.ts` (browser), `server.ts` (cookies, RLS), `admin.ts` (service role),
  `middleware.ts` (route gating).
- `auth/session.ts` (`getSessionUser`, `requireSessionUser`), `auth/username.ts`
  (`<username>@INTERNAL_EMAIL_DOMAIN`).
- `api.ts` — `jsonError`, `parseBody(req, zodSchema)`, in-memory `rateLimit`, `clientKey`.
- `validations.ts` — all zod schemas (login, users, messages, rooms, invites, join, display name).
- `queries.ts` — chat list + message paging queries.
- `rooms.ts` — access codes (`selector.verifier`, PBKDF2-hashed verifier), `validateInvite`,
  `assertRoomAdmin`, `recordAudit`. `permissions.ts` — effective chat/voice/video model.
- `settings.ts` — `app_settings` defaults merged with `profiles.settings` overrides.
- `signup-code.ts` (shape of a sign-up code, shared with the form), `signup-codes.ts`
  (server only: generate, SHA-256 hash, hint).
- `password.ts` (PBKDF2), `invite-token.ts`, `url.ts` (app origin for links), `clipboard.ts`
  (`copyText`: copy buttons copy, they never open the share sheet), `utils.ts` (`cn`, `apiErrorMessage`, `normalizeUsernameInput`),
  `moji.ts` (emoji avatars: the catalog and the stable pick per user id).
- `webrtc/` — `ice.ts` (STUN + env TURN), `signaling.ts` (private broadcast channel),
  `codec.ts` (audio/video constraints, Opus preference), `stats.ts` (quality from getStats),
  `audio-level.ts`, `errors.ts` (error codes → friendly text), `ringtone.ts` (ring + buzz),
  `devices.ts` (which cameras / sound outputs can be switched), `types.ts`.

## Client state & hooks

- Zustand stores (`src/store`): `session-store` (current profile), `chat-store`
  (chats, messages by chat, optimistic `local-` ids), `presence-store` (online set, typing),
  `sync-store`, `call-store` (call + media state).
- `use-chat-realtime` — channel `chat:<chatId>`: message INSERT/DELETE + typing broadcast.
- `use-chat-list-realtime` — channel `chats:<userId>`: previews, unread, new memberships.
- `use-presence` — channel `blackfoxx-presence` (online dots only; never used for auth).
- `use-resume-sync` — 5 s poll while visible + immediate resync on focus/visibility/online.
- `use-heartbeat` — `last_seen_at` every 30 s. `use-ephemeral-session` — exists but is not
  mounted anywhere (V2_NOTES describes it as active; that's outdated).
- `use-call` — the WebRTC engine (see below). `use-media-devices` — the device list for the
  call screen.

## Database (`supabase/*.sql`, mirrored by hand in `src/types/database.ts`)

- Tables: `profiles` (1:1 `auth.users`; `is_admin`, `suspended`, `archived`, `is_room_guest`,
  `settings`), `chats` (`direct|group|room`; rooms add `status`, `expires_at`,
  `max_participants`, `chat/voice/video_enabled`), `chat_members` (`role`, `blocked`,
  `removed_at`, `can_chat/voice/video`, `last_read_at`), `messages` (`text|image|file|system`),
  `invite_tokens`, `app_settings`, `room_invites`, `room_audit_log`, `call_sessions`,
  `signup_codes` (v10; hash + hint only, RLS on with no policies, so service role only;
  `profiles.signup_code_id` says which code a member joined with).
- SECURITY DEFINER helpers used by RLS: `is_chat_member`, `is_chat_admin`, `is_admin`,
  `is_room_admin`, `can_access_chat`, `can_chat_in`, `shares_chat`; RPCs
  `claim_room_seat` (advisory-locked seat claim), `get_or_create_admin_user_chat`,
  `get_or_create_direct_chat` (admin-only since v9).
- `authenticated` may UPDATE only `chat_members.last_read_at` (column grant, v5).
- Storage buckets: `avatars` (public), `attachments` (private, per-chat path, signed URLs).

## Auth flows

- **Admin:** `/login` → `/api/auth/login` → `signInWithPassword(<username>@domain)`.
- **Member:** admin creates user in `/admin` → invite link `/i/<token>` → gate password →
  `/api/i/[token]` rotates the auth password to a random value and signs the browser in →
  `/chat`. `SessionLock` (setting `screen_guard`) re-locks on tab hide; unlock via `/api/lock`.
- **Sign-up member:** admin makes a code in `/admin` → "Sign-up codes" → the person opens
  `/signup` (or the shared `/signup?code=…` link), picks a username, password and avatar →
  `/api/auth/signup` checks the code, claims one use atomically (`claim_signup_code`), creates
  the auth user + profile and signs the browser in → `/chat`. Later they use `/login`. Their
  lock-screen password is their login password (`/api/lock` falls back to it).
- **Room guest:** admin creates room + invitation → `/join/<code>` → `/api/rooms/join`
  creates an ephemeral `is_room_guest` user, claims a seat, consumes one invite use →
  `/room/<id>`.

## Calling

- Only 1:1 direct chats: `CallProvider` wraps `user-chat.tsx` and `chat-thread.tsx`
  (`chatType === "direct"`). Room-view call icons are placeholders.
- Signaling: private Supabase broadcast channel `call:<chatId>`; `realtime.messages` RLS
  (v7) limits it to chat members. Events: `call_started` (+offer, +`media`: the caller's
  camera on means a video call), `call_accepted`, `call_rejected`, `call_cancelled`, `answer`,
  `ice_candidate`, `offer` (ICE restart), `call_ended`, `busy`, `media_state` (microphone and
  camera on/off; the only source for "their camera is on"). Messages carry `callId`; stale
  ones are ignored. Who is calling is shown from the chat's own member data, not the message.
- One `RTCPeerConnection` per call. The caller offers a video line with every call, so camera
  on/off is `replaceTrack` (no renegotiation). The side that answers takes over that same
  line after reading the offer (`adoptOfferedVideo`); a transceiver it added itself would
  never be negotiated and its camera would not be sent. Caller-only ICE restart with backoff.
- UI: `components/call/call-screen.tsx` (+ `call-stage`, `call-controls`, `call.module.css`)
  only reads `call-store` and calls the actions `use-call` returns. A closing state
  (`isCallOver`) keeps the screen up for 2.5 s; an error stays until closed (`dismiss`).
- `/api/calls/authorize` runs at start, accept, every reconnect and every 30 s.
- Outcome → caller POSTs `/api/calls/[id]/event` → one `system` message in the chat.
- Media is peer-to-peer; nothing is recorded or stored. TURN comes from `NEXT_PUBLIC_TURN_*`.
