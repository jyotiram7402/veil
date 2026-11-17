# Architecture

Module-by-module map. Read this when a task touches more than one area. Setup is in
`docs/SETUP.md`, the security model in `docs/SECURITY.md`; the rules to follow when changing
the code are at the end of this file (Conventions, Things that bite).

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

### Speed

Measured on the live site (2026-11-16, from India through `bom1` to the function in `sin1`):
a request that touches no database takes about 150 ms, every database call adds a round
trip of 20–60 ms, and a function that has been idle adds about 0.6 s once (a cold start).
So what a page or route costs is mostly how many calls it makes *one after another*.

- Calls that do not need each other's answer start together (`Promise.all`). A chat page is
  two steps deep (it was six), the member's page three (was six), the admin shell three.
- `getAuthUserId()` checks the session with Supabase Auth and stops there. Routes that only
  need to know who is asking use it (messages, read, heartbeat, vanish, upload, calls, the
  chat list). `getSessionUser()` adds the `profiles` row: for pages, and for anything that
  checks `is_admin`. Both are verified by Supabase on every request; nothing trusts the cookie.
- A read that row-level security already guards runs alongside the session check (the 5 s
  message poll is one step instead of three). A write waits for the session check.
- In the browser: the log-in and sign-up forms check their fields with `entry-checks.ts`
  (no validation library is shipped to them; the server still validates with zod), dates are
  formatted by `format.ts` without a library, the image viewer animates with CSS, and the
  image compressor is fetched only when a large photo is attached.

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

- `auth/` — `login`, `logout`, `signup` (public; an invite code + username + password → a
  member account, signed in).
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
  `join` (public; access code → guest session).
- `calls/authorize?chatId=&feature=voice|video` — server-side call authorization.
- `calls/ice?chatId=` — the relay servers for a call in that chat: short-lived Cloudflare
  credentials, only for somebody who may be in the chat. The admin may ask without a chat
  (the relay check). `relay: false` is a normal answer: the call is then tried without one.
- `calls/[id]/event` — caller posts one call-outcome system message (idempotent).
- `profile`, `profile/heartbeat` (last_seen), `users/search` (admin picker), `health`.

## Libraries (`src/lib`)

- `env.ts` — typed env access; throws if public Supabase vars missing. Direct `process.env`
  reads elsewhere: `next.config.ts`, `webrtc/ice.ts`, `app/api/health`.
- `supabase/client.ts` (browser), `server.ts` (cookies, RLS), `admin.ts` (service role),
  `middleware.ts` (route gating).
- `auth/session.ts` (`getAuthUserId`, `getSessionUser`, `requireSessionUser`,
  `redirectIfSignedIn`), `auth/username.ts` (`<username>@INTERNAL_EMAIL_DOMAIN`).
- `entry-checks.ts` (field checks for the log-in and sign-up forms), `format.ts` (times and
  dates as the chat shows them).
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
- `turn.ts` (server only: trades the Cloudflare TURN key for short-lived relay credentials).
- `webrtc/` — `ice.ts` (the servers a call uses: the relay from `/api/calls/ice`, else public
  STUN; no candidate pool, see Things that bite), `relay-check.ts` (the admin's relay test),
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
- `use-heartbeat` — `last_seen_at` every 30 s.
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
- Column grants say what a signed-in person may write: `chat_members.last_read_at` (v5); on
  their own profile `display_name`, `bio`, `avatar_url`, `last_seen_at`; on their calls the
  state columns; nothing on messages except inserting text / image / file (v11). A new
  column that the browser's own session must write needs a grant in its migration.
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
- The relay (TURN, Cloudflare Realtime). Two devices on different networks usually cannot
  reach each other directly, so the call passes through a relay. The owner's Cloudflare key
  (`CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN`) stays on the server; `turn.ts`
  trades it for credentials that work for 12 hours (longer than any call: a relay drops a
  call whose credentials run out), and `/api/calls/ice` hands those to a signed-in member
  of the chat. Of Cloudflare's addresses three are passed on: UDP 3478, TCP 80 and TLS 443
  (more only make the browser open more connections; port 53 is blocked by browsers).
  The browser asks for them together with the permission check when a call starts, and
  already while the phone rings on the side that answers, so the relay adds no waiting. An
  answer with a relay is reused for 10 minutes; an answer without one is asked again. The
  browser never waits longer than 4 seconds: without an answer the call uses public STUN
  only, which is enough on one network. Not set up yet in production, so not yet seen
  working with real credentials (unverified).
- A call that has not connected 30 seconds after it was answered ends on both sides with
  "Couldn't connect the call…" (`expectConnection`). Before, it said "Connecting…" for
  ever. A call that never connected keeps saying "Connecting…" while it retries;
  "Reconnecting…" is for a call that was connected.
- Media is end-to-end between the two browsers, direct or through the relay (the relay only
  passes encrypted packets on); nothing is recorded or stored. "Call details" (tap the
  timer) ends with "direct" or "via relay".

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

## Conventions

- Never trust a role or an id sent by the browser. Every route checks the session again;
  admin means `profiles.is_admin`; room actions also call `assertRoomAdmin()`.
  `supabaseAdmin()` (service role) only after those checks, and only on the server.
- Server-only modules start with `import "server-only"` (`rooms`, `permissions`, `queries`,
  `settings`, `invite-token`, `signup-codes`, `vanish`).
- Environment variables are read through `src/lib/env.ts`. The exceptions: `next.config.ts`
  (the Supabase host) and `src/app/api/health` (booleans only).
- A new route: copy `src/app/api/rooms/route.ts`. Session check → 401, `is_admin` → 403,
  `parseBody(req, schema)` with a schema from `src/lib/validations.ts`, the query, then
  `NextResponse.json` or `jsonError`. Routes that members can reach answer with general
  error text; screens show `apiErrorMessage(body, fallback)`.
- Every change goes through `fetch` → an API route. Realtime is only listened to
  (postgres_changes, broadcast, presence).
- A message that is being sent has a `local-` id until the server's row replaces it.
- Usernames match `^[a-z0-9_]{3,24}$`; the auth email is `<username>@INTERNAL_EMAIL_DOMAIN`.
- A schema change is a new idempotent `supabase/vNN.sql` (never edit one that has run in
  production), listed in `supabase/README.md`, mirrored in `src/types/database.ts`, and run
  in the production SQL editor before the code that needs it is deployed.
- Phones first: `h-screen-mobile`, `env(safe-area-inset-*)`, 16px inputs on phones (iOS zooms
  into anything smaller), 40px icon buttons. The look is in `DESIGN.md`.
- Styling: never set one property from both a CSS module class and a Tailwind utility; which
  one wins depends on the order the stylesheets load.
- The code carries no comments. The reasons for the way something is built are written down
  in this file, next to the part they belong to.

## Things that bite

- Builds do not run the type check or the linter (`next.config.ts`): the hand-written
  `src/types/database.ts` makes supabase-js infer `never` for some `.update()` arguments. So a
  missing column never fails a build. There is no lockfile either: every build installs the
  newest versions `package.json` allows.
- `src/lib/env.ts` stops a build ("Collecting page data") when a required variable is missing
  in that Vercel environment. Preview builds need the variables ticked for Preview as well.
- Two kinds of member. One who came through an invite link has a throwaway auth password
  (every visit to the link sets a new one). One who signed up with a code logs in at
  `/login` with their own. Giving a sign-up member an invite link, or suspending them,
  destroys that password.
- Supabase keys: the app uses the legacy `anon` and `service_role` keys, and the JWT signing
  key is HS256. The newer publishable / secret keys and asymmetric signing keys have not
  been tried with `@supabase/ssr` 0.5 (unverified).
- Channel names: `chat:<chatId>`, `call:<chatId>` and `blackfoxx-presence` must be spelled the
  same on both sides. The room dashboards (`admin-rooms:`, `admin-room:`) add a random
  suffix, because newer supabase-js hands back an existing channel of the same name and a
  second `subscribe()` on it throws.
- `profiles.avatar_url` is either a photo URL or a moji choice (`moji:fox:sky`). Never use
  it as an image source: render people with `UserAvatar`.
- The screen lock closes on `visibilitychange` / `pagehide`, not on `blur`: on a phone `blur`
  fires for the address bar and the keyboard, which locked the chat all the time.
- No candidate pool in `webrtc/ice.ts`: a pool kept candidates from a cancelled call and
  handed them to the next one, and the side that answered stayed on "Connecting…".
- `<img>` is used on purpose for previews, call pictures and the image viewer (blob and
  signed links, which the image optimiser cannot fetch); the linter rule is off for it.
- Old names that must stay: `INTERNAL_EMAIL_DOMAIN=rooms.local` is part of every login, and
  the GitHub repository and the Vercel address are still called `veil`.
