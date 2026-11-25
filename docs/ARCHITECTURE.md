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
| `(app)/admin`, `admin/[id]` | admin | Members: `admin/layout.tsx` → `components/members/members-shell.tsx` (list, data in `members-provider.tsx`) beside one person's screen (`member-screen.tsx`); "Add someone" (`add-someone-dialog.tsx`) |
| `(app)/rooms`, `rooms/[id]` | admin | rooms dashboard + room management (`components/rooms/*`) |
| `(app)/settings` | admin | own profile, sign-in, chat rules for everyone (`components/settings/settings-screen.tsx`) |
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
  `before=`, resync via `after=`), `[id]/read`, `[id]/members`, `[id]/vanish` (disappearing
  messages: "I am leaving, and had read up to this time").
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
- `vanish.ts` (server only: is this a disappearing chat, delete what was read),
  `read-cutoff.ts` and `attachment-path.ts` (its two pure rules: the cutoff time, and the
  storage path inside a signed link).
- `signup-code.ts` (shape of a sign-up code, shared with the form), `signup-codes.ts`
  (server only: generate, SHA-256 hash, hint).
- `password.ts` (PBKDF2), `invite-token.ts`, `url.ts` (app origin for links), `clipboard.ts`
  (`copyText`: copy buttons copy, they never open the share sheet), `utils.ts` (`cn`, `apiErrorMessage`, `normalizeUsernameInput`),
  `moji.ts` (emoji avatars: the catalog and the stable pick per user id).
- `webrtc/` — `ice.ts` (STUN + env TURN; no candidate pool, the file says why),
  `signaling.ts` (private broadcast channel; a message sent while it is joining waits),
  `codec.ts` (audio/video constraints, Opus preference), `stats.ts` (quality from getStats),
  `video-governor.ts` (how large a picture to send), `audio-level.ts`,
  `errors.ts` (error codes → friendly text), `ringtone.ts` (ring + buzz),
  `devices.ts` (which cameras / sound outputs can be switched), `types.ts`.

## Client state & hooks

- Zustand stores (`src/store`): `session-store` (current profile; `locked` while the screen
  lock covers the chat), `chat-store` (chats, messages by chat, optimistic `local-` ids; for
  disappearing messages `dropReadMessages`, `leftBehind`, `matchServer`), `presence-store`
  (online set, typing), `sync-store`, `call-store` (call + media state).
- `use-chat-realtime` — channel `chat:<chatId>`: message INSERT/DELETE, typing broadcast,
  and the server's `vanished` broadcast.
- `use-chat-list-realtime` — channel `chats:<userId>`: previews, unread, new memberships; a
  deleted message makes it load the list again. Joined once, not again on every message.
- `use-presence` — channel `blackfoxx-presence` (online dots only; never used for auth).
- `use-resume-sync` — 5 s poll while visible + immediate resync on focus/visibility/online.
  An empty chat asks for the newest page; `exact` mode (disappearing chats) also takes off
  the screen what the server no longer has.
- `use-vanish-on-leave` — disappearing messages, the screen's half (see below).
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
- **Member:** admin adds them in Members → Add someone → Personal link → invite link `/i/<token>` → gate password →
  `/api/i/[token]` rotates the auth password to a random value and signs the browser in →
  `/chat`. `SessionLock` (setting `screen_guard`) re-locks on tab hide; unlock via `/api/lock`.
- **Sign-up member:** admin makes a code in Members → Add someone → Sign-up code → the person opens
  `/signup` (or the shared `/signup?code=…` link), picks a username, password and avatar →
  `/api/auth/signup` checks the code, claims one use atomically (`claim_signup_code`), creates
  the auth user + profile and signs the browser in → `/chat`. Later they use `/login`. Their
  lock-screen password is their login password (`/api/lock` falls back to it).
- **Room guest:** admin creates room + invitation → `/join/<code>` → `/api/rooms/join`
  creates an ephemeral `is_room_guest` user, claims a seat, consumes one invite use →
  `/room/<id>`.

## Calling

- Only 1:1 direct chats. One `CallProvider` serves the whole app: `app-shell.tsx` mounts it
  for the admin with every direct chat from the chat list, `user-chat.tsx` for a member with
  their one chat. The engine joins the `call:` channel of each of those chats, so a call rings
  on any screen and keeps running across navigation; it runs one call at a time and answers
  `busy` on the other channels (the caller then logs a missed call). Header buttons start a
  call with `useCallActions().startVoice(chatId)`. Room-view call icons are placeholders.
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
- Camera (`startCamera` / `switchCamera` in `use-call.ts`): a phone can have one camera open
  at a time, so the one in use is let go before another is opened, and comes back if the other
  does not start. "Flip" asks a phone for the other *side* (front / back) and lets the browser
  pick the lens; stepping through device ids lands on the wide or the zoom lens. A computer's
  cameras do not report a side: there Flip takes the next device. Camera changes run one at a
  time, and a camera that opens after it was switched off (or after the call ended) is let go.
- Picture quality: the video sender is told to hold the resolution (`keepResolution` in
  `codec.ts`, `degradationPreference: "maintain-resolution"`). Left alone, Chromium began a
  call at 180×320 and was still at 360×640 a quarter of a minute later, on a perfect
  connection; told to hold, it sends 720p from the first second and pays in frames per second
  when it must. `video-governor.ts` is the safety valve: fed by the 3 s stats sample, it
  steps the sent size down (`scaleResolutionDownBy` 1 → 1.5 → 2 → 3) when the frame rate
  has collapsed, and back up after a good stretch. The same sample fills "call details".
- UI: `components/call/call-screen.tsx` (+ `call-stage`, `call-controls`, `call.module.css`)
  only reads `call-store` and calls the actions `use-call` returns. A closing state
  (`isCallOver`) keeps the screen up for 2.5 s; an error stays until closed (`dismiss`).
  "Chat" shrinks the call to a pill and, for the admin, opens that chat (`onOpenChat`).
- Limits: the app has to be open to ring (no push notifications). The admin holds one Realtime
  channel per person; Supabase caps channels per connection (100 by default, unverified).
- `/api/calls/authorize` runs at start, accept, every reconnect and every 30 s.
- Outcome → caller POSTs `/api/calls/[id]/event` → one `system` message in the chat.
- Media is peer-to-peer; nothing is recorded or stored. TURN comes from `NEXT_PUBLIC_TURN_*`.

## Disappearing messages

- The rule: a message is deleted for both people once the person it was sent to has read it
  and then leaves the chat. An unread message stays. Deleted means the row is gone from
  `messages` and its file from the `attachments` bucket: no soft delete, no undo.
- The switch is the setting `disappearing_messages` (`settings.ts`), off by default: for
  everyone in `app_settings`, or per person in `profiles.settings`. Only the admin routes
  write either; no migration was needed. For a chat, the member's value counts
  (`chatIsDisappearing`); 1:1 chats only. A screen learns the setting when its page loads, so
  a change reaches an open chat the next time it is opened. The server checks every request.
- "Read" is decided on the screen (`use-vanish-on-leave.ts`): the chat is mounted, the page
  is visible, and the screen lock is not covering it. The hook keeps the time of the newest
  message received in that state. "Leaving" is the chat screen unmounting, or the page being
  hidden (`visibilitychange`) or unloaded (`pagehide`).
- On leaving, the screen drops those messages from the store at once and remembers the
  cutoff (`dropReadMessages(…, remember)` → `leftBehind`), then tells the server:
  `POST /api/chats/[id]/vanish { upTo }`, by `sendBeacon` when the page is going, else `fetch`.
- The server (`vanish.ts`): session → `can_access_chat` → setting on → delete the rows with
  this `chat_id`, a `sender_id` that is not the caller (or none: call notes) and
  `created_at <= cutoff`. Rounds of 300, files first, at most 3000 per request (the answer
  says `more` and the screen asks again). Then one broadcast `vanished { reader, upTo }` on
  `chat:<chatId>` through Realtime's HTTP endpoint; open chats drop the same messages.
  So a caller can only ever delete what was sent *to them*, in a chat they are in.
- Each of these was a bug found while testing:
  - The cutoff runs to the end of its millisecond (`read-cutoff.ts`). Postgres counts in
    microseconds, JavaScript in milliseconds: cut down, the newest message, the one the time
    was taken from, lay just past the cutoff and was never deleted.
  - The lock says it is closed in a layout effect, and at once when it closes again
    (`session-lock.tsx` → `session-store.locked`); the hook takes its first look a tick
    later. Otherwise messages behind the lock counted as read whenever the hook's effect ran
    before the lock's.
  - A closed chat screen is believed a tick later, and not at all if the same chat is back by
    then. React's development mode opens every screen twice; that deleted messages on opening.
  - `leftBehind` stops an answer that was already on its way (the 5 s poll, a page from the
    router) from putting the messages back during the moment the server needs.
  - A leave the server has not confirmed is told again: when the chat is next on screen, when
    the page is hidden again, and when the browser reports `online`. A beacon has no answer,
    so a leave sent by beacon is confirmed once on return.
  - `use-resume-sync` runs in `exact` mode in these chats: every round fetches the newest
    page and `matchServer` takes off the screen what the server no longer has. Without it, a
    sender whose page was in the background while the other person read and left kept seeing
    their own deleted messages. It is also what makes the feature work where the live
    connection is blocked.
- Known simplifications: a chat that is scrolled up, or covered by the call screen, still
  counts as on screen. `matchServer` judges only the newest page (40 messages). Not yet seen
  on the live site: the broadcast request and the change feed's DELETE events (both only make
  it faster; the 5 s check covers for them).
