# BlackFoxx — Security Model

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
- **Admins** sign in with username+password at Admin login; a non-admin who gets the
  password right there is signed out again. **Members** never hold a known auth password:
  they type their name and the hashcode the admin set (only while their invite link is open),
  or open a direct link the admin sent; **room guests** open a room invite
  (`/join/<selector.verifier>`) and pass its verifier. The server then sets a random auth
  password and mints a Supabase session. No email/phone/PII.
- Every page, layout and API route checks the session itself; there is no middleware.
  Signed-out people are sent to `/login` (admin pages) or `/enter` (the member page), non-admins cannot open the admin pages
  (`(app)/layout.tsx`), and the member page sends a suspended or archived member to
  `/expired`. `getAuthUserId()` and `getSessionUser()` are the server-side source of
  identity: both ask Supabase Auth to verify the session on every request.
- Suspending or removing a member (`lockOut` in `src/lib/lockout.ts`, since 2026-11-18):
  their password is replaced with a random one nobody knows, their account is banned in
  Supabase Auth (a session can no longer be renewed), and their notification devices are
  forgotten. An app they still have open signs itself out and shows `/expired` at its next
  heartbeat (within 30 s while it is on screen), because the heartbeat now answers 403 for
  them. With `supabase/v13.sql` the database also stops showing them any chat at once.
  Unsuspending and Restore lift the ban (`letBackIn`); if that fails the admin sees an error
  and can press again.

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
- **Column lock-down**: row-level security decides which rows a signed-in person may change,
  not which columns, and anyone signed in can call the database directly. So the writable
  columns are granted one by one: `chat_members.last_read_at` (v5); on their own profile
  `display_name`, `bio`, `avatar_url`, `last_seen_at` (v11); on a call they are in `status`,
  `connected_at`, `ended_at`, `end_reason` (v11). Messages cannot be updated at all, and
  only `text` / `image` / `file` messages can be inserted (v11).
  Until v11 a member could update every column of their own profile directly, `is_admin`,
  `suspended` and `settings` included. Found by reading the policies on 2026-11-17, not
  through an incident; whether it was ever used is unknown. After running v11, check once
  that only the owner is an admin (`select username from profiles where is_admin`).

## Row Level Security

| Table | RLS | Notes |
|---|---|---|
| profiles | on | SELECT = self OR admin OR shares-a-chat (v9, was `true`); self-UPDATE of display_name, bio, avatar_url, last_seen_at only (v11) |
| chats | on | SELECT members; INSERT/UPDATE/DELETE admin-only |
| chat_members | on | SELECT members; writes admin (service role); UPDATE column-locked to last_read_at |
| messages | on | SELECT `can_access_chat`; INSERT `can_chat_in`, kinds text/image/file only (v11); no UPDATE (v11); DELETE sender or chat admin |
| invite_tokens | on | admin-only SELECT; writes service-role; removed from realtime (v9) |
| app_settings | on | admin-only; removed from realtime (v9) |
| room_invites | on | admin-only SELECT; writes service-role after `is_room_admin` |
| room_audit_log | on | admin-only SELECT; writes service-role |
| call_sessions | on | SELECT members; INSERT caller; UPDATE participant, state columns only (v11) |
| signup_codes | on | no policies: service role only (v10); no longer used |
| direct_links, hashcode_requests | on | no policies: service role only (v16) |
| push_subscriptions, push_keys | on | no policies: service role only (v12) |
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

### Member sign-in: invite links, hashcodes and direct links

Since 2026-11-27 the admin is the only way in: sign-up codes were removed (`signup_codes` and
`claim_signup_code` stay in the database, unused).

- The hashcode is set only by the admin, at least 4 characters, emoji allowed. It is stored
  as PBKDF2 (SHA-256, 100,000 rounds, its own salt) in `invite_tokens.gate_password_hash`, and
  compared after NFC, without emoji variation selectors and without spaces at the ends. The
  server never sends it back.
- Name + hashcode (`POST /api/auth/member-login`) works only while that member's invite link
  is on and before its `expires_at` (48 hours by default; the admin can keep it open longer
  or for good). An unknown name, an admin, a room guest, a suspended or archived member and
  a wrong hashcode all get the same answer, after the same PBKDF2 work (a decoy hash when
  there is no member), so names cannot be listed by timing. That the link has run out or is
  off is said only after the right hashcode. A display name two members share never signs
  in, and LIKE wildcards in a typed name are escaped.
- Tries are limited to 10 a minute per address and 6 per 5 minutes per name, counted once for
  every server instance (see Rate limiting). A short hashcode such as `Hi😂` can still be guessed by someone who knows
  the name and has time and many addresses: the open window is the main control, so keep a
  link open no longer than needed.
- Direct links (`/d/<token>`): a 256-bit token, one use (claimed in one update before the
  sign-in, given back if the sign-in fails), 48 hours, retired when a newer one is made,
  refused for a suspended or archived member. The hashcode rides after `#`, which browsers
  never send to a server, so it is in no log; the page removes it from the address bar and
  sends no referrer. Whoever holds the link can sign in as that member, so the admin sends it
  to them only.
- Forgot hashcode (`POST /api/auth/forgot`) is public and answers the same whether or not the
  name exists. 3 requests per 10 minutes per address; past 3 an hour for one name, requests
  are dropped silently. One open request per member (a unique partial index). The admins'
  notification names the member; the admin checks it is really them before sending a link.

## WebRTC / calling security

- Signaling rides a **private** Supabase Realtime channel `call:<chatId>`;
  `realtime.messages` RLS restricts send/receive to chat members. Client-supplied
  caller/callee/room IDs are not trusted; every message carries the `callId` and
  stale/ended-call messages are ignored. The name and avatar shown for an incoming
  call come from the chat's own member data, not from the signaling message.
- The call screen opens above a member's screen lock, so a call can be answered and ended
  without the password, as on a locked phone. The chat stays behind the lock.
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

Read receipts: the other people in a chat see how far you have read it (blue ticks). The
time comes from `chat_members.last_read_at`, which members of the chat could always read; it
is now shown. A chat counts as read only while it is on screen and not behind the screen lock.
Nobody can switch read receipts off.

## Disappearing messages

Off by default. Only an admin can switch it on: `/api/admin/settings` (everyone) and
`/api/admin/users/[id]/settings` (one person) both require `is_admin`.

- `POST /api/chats/[id]/vanish` needs a session and `can_access_chat`. It deletes only
  messages that were sent *to the caller*, in that chat, up to the time the caller reports
  (never later than now). Nobody can use it on their own messages or on another chat, and it
  does nothing where the setting is off. The reported time is parsed and rebuilt; the text
  the browser sent never reaches the database. 60 requests a minute per user.
- The delete runs with the service role, after those checks. The file of a message is found
  from the signed link stored with it, and only accepted inside the chat's own folder
  (`src/lib/attachment-path.ts`): a doctored link cannot get another chat's file deleted.
- What "deleted for good" covers: the row in `messages` and the file in the `attachments`
  bucket. The row is removed outright (the `deleted_at` column is not used), the app keeps
  no copy, and nothing a message said is written to a log.
- What it does not cover:
  - Backups Supabase makes of the database. They depend on the plan and are outside the app
    (unverified what this project has).
  - A copy of a file's signed link made before the file was deleted. Whether such a link
    stops working at once is unverified (a cache in front of storage may still serve it).
  - A screenshot or a photo of the screen, and a message already showing on a device that is
    offline: it stays on that screen until the app next reaches the server.
  - A message that has not been read. It stays until it is.
- The `vanished` broadcast travels on the public `chat:<id>` channel. A forged one hides
  messages on an open screen until the next 5 s check puts them back. It cannot delete
  anything: only the route above deletes.

## Notifications

Off on every device until its owner turns them on there. Needs `supabase/v12.sql`.

- What is stored: per device, the address its browser's push service gave it and the two
  keys a message for it is encrypted with (`push_subscriptions`); and the server's own key
  pair (`push_keys`). Both tables have RLS on and no policies, so a browser can read
  neither; the routes use the service role after checking the session.
- A notification never carries what a message says. The admin's shows the sender's name; a
  member's shows no name at all. The text is encrypted for the one device (RFC 8291), so
  the push service (Google, Apple, Mozilla or Microsoft, whichever the browser belongs to)
  cannot read it. It does learn that this server sent something to that device, when, and
  how large it was.
- The address a browser hands in must be an `https` address of a known push service
  (`isPushEndpoint` in `src/lib/web-push.ts`), checked when it is stored and again before
  every send. The server later makes requests to that address, so without the list a
  member could point the server at an address of their choosing.
- Every route needs a signed-in session, and a person can add, mark and remove only their
  own devices. Adding is limited to 20 requests a minute, and to ten devices a person.
- `POST /api/push/test` sends one fixed text ("Test notification") to a device only when its
  address is one of the caller's own devices, 5 requests a minute. It answers with the push
  service's outcome only, never the service's reply.
- Nothing is sent to a suspended or archived person, or to someone blocked in or removed
  from the chat. Signing out removes the device. A session that ends another way (it
  expired) leaves the device subscribed: "New message" can still appear there until
  somebody signs in on that browser again or the browser's permission is taken back.
- `POST /api/calls/[id]/ring` (an incoming-call notification) needs a session, 10 requests a
  minute, and is only sent when the caller is an active member of that 1:1 chat with the
  admin on one side; the other member is the one told. Nothing reaches a suspended, archived,
  blocked or removed person.
- A tap on a notification can only open a page of this app (`public/sw.js` rebuilds the
  address from a path and falls back to the start page).
- Someone holding the server's private key and a device's address could send that device
  notifications of their own. They could not read anything. Both live only in the database.

## Secrets management

- `SUPABASE_SERVICE_ROLE_KEY` is server-only (never `NEXT_PUBLIC_`), used by
  `supabaseAdmin()` in route handlers/server components only.
- The call relay key (`CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN`) is server-only.
  Browsers get credentials that expire after 12 hours, from `/api/calls/ice`, and only when
  the caller is signed in and may be in that chat (30 requests a minute per user). Such
  credentials let their holder pass traffic through the owner's relay until they expire:
  they are only ever given to invited members. Only the status code of a Cloudflare answer
  is logged, never the request or the body. `.env.example` holds placeholders only.
- The key pair for notifications is not an environment variable: the server creates it in
  the `push_keys` table, which only the service role can read. Emptying that table makes
  every device subscribe again.
- Secrets must never be logged. Errors returned to clients are generic: no route sends a
  database's own error text (`serverError` in `src/lib/api.ts` logs it instead, without the
  request, the body or row values).

## Security headers

HSTS; `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'`;
`X-Content-Type-Options: nosniff`; `Referrer-Policy: strict-origin-when-cross-origin`;
`Permissions-Policy: camera=(self), microphone=(self), geolocation=()`; CSP with
`default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`,
and a `connect-src` pinned to self + the Supabase project (https+wss). Script/style
still allow `'unsafe-inline'` (matches Next's inline bootstrap) — a nonce-based
CSP is recommended future work.

## Rate limiting / abuse

Everything that can be guessed — Admin login, a member's name and hashcode (per address and
per name), a direct link's hashcode, the screen lock, room access codes and the first-admin
token — takes from a token bucket in Postgres that every server instance shares
(`sharedRateLimit`, `supabase/v15.sql`). Keys are SHA-256 hashes made by the server, so the
table holds no address, name or token. Until `v15.sql` has run, or while the database cannot
answer, each instance counts on its own (as before) and logs that once.

Floods (message send, call ring, hashcode requests, room and invite creation, the
disappearing-messages route, the notification device route, relay credentials) are slowed by
an in-memory bucket per instance (`rateLimit` in `src/lib/api.ts`): a speed bump, not a hard
control.

Addresses come from `x-forwarded-for`, which Vercel overwrites with the client's address
(per Vercel's documentation); behind another proxy it could be chosen by the client.

## Data retention

Messages, call events (system messages), and `call_sessions`/`room_audit_log`
persist until the room/user is deleted (cascades on FK delete). Ephemeral room
guests are flagged `is_room_guest` and are candidates for a future cleanup job.
No automatic purging is implemented, with one exception the admin can switch on:
disappearing messages (above) delete read messages and their files for good.

## Remaining risks

- Rate limits on guessing are per address and per target (a member's name, a direct link, a
  person's lock), so many addresses together can still try more often against one target
  than one address can; a short hashcode is the weak point. The flood guards are
  per-instance only.
- Legacy `invite_tokens` stored in plaintext (path secret).
- CSP allows `'unsafe-inline'` for scripts/styles (no nonce yet).
- Public chat realtime channels (`chat:<id>`, presence) are not private —
  typing/presence could be observed/spoofed by someone who knows the random
  chat UUID (low severity; IDs are unguessable). The same goes for the
  `vanished` notice of disappearing messages (it can hide, never delete).
- Browser calls cannot run while the page is fully suspended/terminated.
- A suspended member's phone that ignores the sign-out keeps the access token it already has
  until it runs out (one hour by Supabase's default; unverified for this project). Once
  `supabase/v13.sql` has run, the database shows it no chat in that time. Before that, it can
  still read its chat until the token runs out.
- Library versions are fixed (since 2026-11-18), so a security fix in a library arrives only
  when someone raises its version in `package.json`.
- Notifications tell the browser makers' push services that a device received something
  from this server, and when (never what).
- The automated tests (`tests/`, run by GitHub after every push) cover disappearing
  messages, notifications, attachment paths, the call relay credentials and what an error log
  line may contain. API routes,
  screens, calls and the database policies have none: they are checked by hand (see the
  manual matrix in the report, and `supabase/security-tests.sql`).
