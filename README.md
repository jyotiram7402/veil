# Rooms

A small, private, real-time chat for people you actually want to talk to.
Username + password, no email, no phone, no signups — accounts are created
by an admin and that's it.

It's deliberately minimal: one Next.js 15 app, one Supabase project,
deployable to Vercel's free tier in about ten minutes.

## What's in the box

- One-to-one and group chats with realtime delivery
- Private rooms with admin-controlled, invite-only access (expiring, revocable, one-time codes)
- 1-to-1 WebRTC **voice and video** calling, built into the chat
- Image and file attachments (10 MB cap, images compressed in-browser)
- Typing indicators, online presence, read receipts, unread counts
- Mobile-first UI (light/dark), safe-area aware, works on phones and tablets
- Admin panel: members, rooms, invitations, participant permissions
- Strict Row-Level Security on every table; private storage with signed URLs

## Tech

- **Next.js 15** App Router + React Server Components, TypeScript
- **Supabase** for Postgres, Auth, Realtime, Storage — all on the free tier
- **WebRTC** peer-to-peer for call media; Supabase Realtime for signaling
- **Tailwind CSS** + a hand-picked subset of shadcn/ui primitives
- **Zustand** for client state, **Zod** + **react-hook-form** for forms,
  **Framer Motion** for animation, **Lucide** for icons, **Sonner** for toasts

No separate backend, no Docker, no Redis, no paid APIs.

## Quick start (10 minutes)

You need a Supabase project and a Vercel account. Both are free.

1. **Create a Supabase project** ([supabase.com](https://supabase.com)).
2. In the **SQL editor**, run the files in `supabase/` in order (see
   [`supabase/README.md`](supabase/README.md)): `schema.sql`, `policies.sql`,
   `storage.sql`, then `v2.sql` … `v9.sql`.
3. In **Authentication → Providers → Email**, disable "Confirm email."
   (Users are created via the service role, so they should sign in immediately.)
4. Copy `.env.example` to `.env.local` and fill in your project URL,
   anon key, service role key, and a random `ADMIN_BOOTSTRAP_TOKEN`.
5. Locally: `npm install` then `npm run dev`. Visit <http://localhost:3000>.
6. Create the first admin user:

   ```bash
   curl -X POST http://localhost:3000/api/admin/users \
     -H "Content-Type: application/json" \
     -H "x-admin-token: $ADMIN_BOOTSTRAP_TOKEN" \
     -d '{"username":"jay","password":"a-strong-password"}'
   ```

   That user is promoted to admin because no profiles existed yet. Afterwards
   the bootstrap token does nothing — new users come from the **/admin** screen.

For production, see [`DEPLOYMENT.md`](DEPLOYMENT.md) and
[`PRODUCTION_RUNBOOK.md`](PRODUCTION_RUNBOOK.md). Security notes are in
[`docs/SECURITY.md`](docs/SECURITY.md).

## Project layout

```
src/
  app/
    (auth)/login           — sign-in page
    (app)/                 — admin shell: chats, rooms, settings, admin
    (user)/chat            — participant view
    i/[token], join/[code] — invite / room-join flows
    room/[id]              — participant room view
    api/                   — auth, admin, chats, rooms, calls, profile, upload
  components/
    ui/                    — shadcn primitives
    chat/                  — list, thread, bubble, composer, dialogs
    rooms/                 — admin room management + participant room UI
    call/                  — call provider, overlay, buttons
    auth/, layout/         — login form, app shell, sidebar
  lib/
    supabase/{client,server,admin,middleware}.ts
    webrtc/{ice,signaling,codec,stats,audio-level,errors,types}.ts
    {rooms,permissions,share,api,env,queries,validations,...}.ts
  hooks/                   — realtime, presence, typing, calling
  store/                   — zustand stores (session, chat, presence, call)
  types/                   — database & domain types
supabase/                  — schema.sql, policies.sql, storage.sql, v2…v9.sql
middleware.ts              — refreshes the Supabase session + protects routes
```

## Voice & video calling

Private **1-to-1 voice and video** calls are built into every direct chat.
Media is peer-to-peer WebRTC; Supabase Realtime carries only signaling
(SDP/ICE) — audio and video never touch a server, and nothing is recorded.

- **Signaling** rides a *private* Supabase Realtime channel `call:<chatId>`.
  RLS on `realtime.messages` limits it to the two members of that chat, so
  nobody can inject offers/ICE into someone else's call.
- **One peer connection** handles voice and video. A video transceiver is
  pre-negotiated, so turning the camera on/off is a plain
  `RTCRtpSender.replaceTrack()` — no renegotiation. Voice-only calls never
  touch the camera.
- **Reliability:** both `connectionState` and `iceConnectionState` are watched;
  a drop triggers an ICE restart with backoff (up to 3 attempts) over the same
  channel; network changes (`online`, `pageshow`, `visibilitychange`) nudge
  recovery. Connection quality (RTT / loss / jitter via `getStats()`, sampled
  locally) shows as a subtle 🟢/🟡/🔴 indicator.
- **Devices:** mic/speaker/camera switching via `enumerateDevices` +
  `replaceTrack` / `setSinkId` (feature-detected); mute is `track.enabled`;
  echo cancellation, noise suppression, and AGC are on; Opus is preferred when
  the browser supports codec preferences.
- **Authorization** is checked server-side (`/api/calls/authorize`) at call
  start, on accept, on every reconnect, and every 30s while connected. A
  removed/blocked participant or an ended room cannot start or keep a call;
  disabling video stops the camera while voice continues.
- **In the chat:** header 📞/📹 buttons start calls; incoming calls show a
  full-screen prompt with a ringtone; you can minimize a call to a bar and keep
  chatting; completed/missed/failed calls leave one small event in the timeline.

### STUN / TURN

STUN (Google's public servers) is built in and handles most networks. TURN is
optional and env-driven (`NEXT_PUBLIC_TURN_URL` / `_USERNAME` / `_CREDENTIAL`);
without it, calls across strict/symmetric NATs may fail. ICE config lives in
`src/lib/webrtc/ice.ts` so a relay can be added without touching call logic. Do
not commit TURN secrets — prefer a provider's short-lived credentials.

### Requirements & limits

- Calls need a **secure context** — HTTPS in production (automatic on Vercel),
  or `http://localhost` for dev. `Permissions-Policy` allows same-origin
  camera/mic.
- 1-to-1 only (no group calls, no SFU); both people must have the chat open to
  receive a call; no simultaneous-call resolution (second caller gets *busy*).

## License

Use it for personal stuff. No warranty.
