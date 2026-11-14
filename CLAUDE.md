# CLAUDE.md

## Overview
BlackFoxx (package name `blackfoxx`; the GitHub repo and Vercel project are still named `veil`)
is a private, invite-only, mobile-first chat app with 1:1 WebRTC voice/video calls. An admin
creates every account; members sign in through a personal invite link — no email/phone. Members
chat only with the admin. Rooms (guest access codes) exist in the code but are on hold.
Product facts: `PRODUCT.md`. Look and feel: `DESIGN.md` (read it before touching any screen).

## Tech stack
- Next.js 15.5 App Router + React 19 + TypeScript 5 (strict), path alias `@/` → `src/`.
- Supabase: Postgres + RLS, Auth, Realtime, Storage — `@supabase/ssr` ^0.5, `@supabase/supabase-js` ^2.47.
- Tailwind 3 + shadcn/ui (new-york, Radix), Zustand 5, zod 3, sonner, lucide-react. Fonts via
  `next/font`: Figtree (UI) and Baloo 2 (wordmark, entry screens only).
- WebRTC (native browser APIs) for calls; Supabase Realtime only carries signaling.
- Hosting: Vercel (prod: https://veil-cqsf.vercel.app), repo github.com/jyotiram7402/veil, branch `main`.

## Setup on a fresh machine
1. Node 24 (`engines` is pinned to `24.x`, the version set in the Vercel projects). Git.
2. `npm install` — **no lockfile is committed yet**; commit the generated `package-lock.json`.
3. `cp .env.example .env.local` and fill it (real values: Vercel → Settings → Environment
   Variables, or Supabase → Settings → API). The old laptop's `.env.local` was only the template.
4. Database already exists in Supabase. For a brand-new project run every file in `supabase/`
   in the order in `supabase/README.md` (schema → policies → storage → v2 … v9).
5. `npm run dev` → http://localhost:3000. Admin login uses the **username** (e.g. `admin`).
More detail: `docs/SETUP.md`, `docs/SUPABASE.md`.

## Commands
```bash
npm install                  # deps (+ creates package-lock.json)
npm run dev                  # dev server :3000
npm run build && npm start   # production build (skips type-check + lint, see next.config.ts)
npm run typecheck            # tsc --noEmit — run before pushing (clean pass unverified, see Gotchas)
npm run lint                 # next lint (unverified with ESLint 9 + .eslintrc.json)
git push origin main         # deploy: Vercel auto-builds main
curl https://veil-cqsf.vercel.app/api/health   # liveness, no secrets
```
- Tests: none — no test runner (no unit/e2e, so no "single test" command). RLS negative tests:
  `supabase/security-tests.sql`, psql only (uses `\set`): set two real profile UUIDs, then
  `psql "<connection string>" -f supabase/security-tests.sql` (unverified end-to-end).
- Migrations: paste `supabase/vNN.sql` into Supabase → SQL Editor (no CLI / config.toml).
- Rollback: Vercel → Deployments → previous → Promote to Production.
- Workflow (owner's rule): one feature per branch (`feature/<name>`). Commit locally, tell the
  owner; the owner pushes, Vercel builds a preview, the preview gets tested in a browser (see
  Gotchas for what works), and only then does the next feature start. Never push or merge yourself.
- Nothing is installed or built on the owner's machine (no `npm install`): Vercel is the build.

## Project map (full module map: read docs/ARCHITECTURE.md before cross-cutting changes)
- `middleware.ts` → `src/lib/supabase/middleware.ts`: session refresh + route gating (public
  paths, admin-only prefixes, member vs admin redirects). **Not active in production** (Gotchas).
- `src/app/(app)` admin shell (layout requires `is_admin`): `chats`, `rooms`, `admin`, `settings`.
- `src/app/page.tsx` first screen (Log in / Sign up); `src/app/(auth)/login`, `(auth)/signup`
  (placeholder until invite-code sign-up is built). Each calls `redirectIfSignedIn()` itself.
  Their UI is `src/components/auth/*`: `first-screen.tsx`, `auth-shell.tsx`, `entry.module.css`.
- `src/app/(user)/chat` (member's 1:1 chat with admin), `(user)/expired`.
- `src/app/i/[token]` member invite gate; `src/app/join[/code]` + `src/app/room/[id]` room guests.
- `src/app/api/**/route.ts` all mutations. `src/lib/` server logic (`supabase/`, `auth/`,
  `rooms.ts`, `permissions.ts`, `validations.ts`, `api.ts`, `webrtc/`).
- `src/components/{ui,chat,call,rooms,layout,auth}`, `src/hooks/`, `src/store/` (Zustand).
- `supabase/*.sql` migrations; `src/types/database.ts` is a **hand-written** mirror of them.
- Flow: Server Component (`getSessionUser` + RLS client; does its own redirects) → client component →
  `fetch('/api/…')` → handler auth check → `supabaseServer` (RLS) or `supabaseAdmin` (service role).
- Docs: `DEPLOYMENT.md`, `PRODUCTION_RUNBOOK.md` (ops); `docs/SECURITY.md` (security model);
  `docs/TROUBLESHOOTING.md`; `docs/V2_NOTES.md` is historical.

## Where to start for common tasks
- New API endpoint: `src/app/api/<area>/route.ts`, copy `src/app/api/rooms/route.ts`:
  `getSessionUser()` → 401 / `is_admin` → 403 → `parseBody(req, schema)` (schema in
  `src/lib/validations.ts`) → query → `NextResponse.json` / `jsonError`.
- Schema change: new idempotent `supabase/vNN.sql` (+ RLS), add it to `supabase/README.md`,
  mirror columns in `src/types/database.ts`, run it in prod SQL Editor before deploying code.
- New page: put it in the right route group; public pages → `isPublic()`, admin pages →
  `ADMIN_ONLY_PREFIXES` in `src/lib/supabase/middleware.ts`.
- Rooms/invites: `src/lib/rooms.ts`, `src/lib/permissions.ts`, `src/components/rooms/*`.
- Calls: `src/hooks/use-call.ts`, `src/lib/webrtc/*`, `src/components/call/*`,
  auth in `src/app/api/calls/authorize/route.ts`.
- Runtime toggles: `src/lib/settings.ts` + `app_settings` table + admin "Defaults" tab.
- Styling: rules in `DESIGN.md`, tokens in `src/app/globals.css`, primitives in `src/components/ui`,
  `cn()` from `src/lib/utils.ts`. Avatars without a photo are "moji" (`src/lib/moji.ts`).

## Conventions
- Never trust client-sent role/ids: every handler re-checks the session; admin = `profiles.is_admin`;
  room actions also `assertRoomAdmin()`. `supabaseAdmin()` only after those checks, server-side only.
- Server-only modules start with `import "server-only"` (`rooms`, `permissions`, `queries`, `settings`, `invite-token`).
- Read env through `src/lib/env.ts`. Only exceptions: `next.config.ts` (Supabase host),
  `src/lib/webrtc/ice.ts` (TURN vars in the browser), `src/app/api/health` (booleans only).
- Errors: participant-facing routes return generic text; clients show `apiErrorMessage(body, fallback)`.
- Validation lives in `src/lib/validations.ts`; usernames `^[a-z0-9_]{3,24}$`
  (`normalizeUsernameInput` in forms); auth email is `<username>@INTERNAL_EMAIL_DOMAIN`.
- Mutations are `fetch` → API route; Realtime is read-only (postgres_changes / broadcast / presence).
- Optimistic chat messages use `local-` ids (`clientMessageId`), replaced by the server row.
- Mobile-first: `h-screen-mobile` (svh/dvh), `env(safe-area-inset-*)`, inputs 16px on mobile
  (`text-base sm:text-sm`) to stop iOS zoom, icon buttons 40px.
- Design: one blue (`--primary`), pill buttons, moji avatars seeded with the user id
  (`mojiFor(userId ?? username)`). Emoji are for avatars and tiles only; UI icons are lucide.
  Entry forms use `ENTRY_FIELD` / `ENTRY_SUBMIT` (`src/components/auth/field.ts`).
- Migrations are idempotent (`if not exists`, `drop policy if exists`) and never edited after
  they've run in prod — add a new file instead.

## Env variables & external services
Names only — values live in Vercel (Production) and Supabase; template in `.env.example`.
| Name | Use | Get it from |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser/RLS key | Settings → API → Legacy API keys → anon |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only, bypasses RLS | Legacy API keys → service_role |
| `INTERNAL_EMAIL_DOMAIN` | username→email suffix (`rooms.local`) | chosen once, never change |
| `ADMIN_BOOTSTRAP_TOKEN` | first-admin creation | any long random string |
| `NEXT_PUBLIC_APP_URL` | absolute links (invites) | prod origin |
| `NEXT_PUBLIC_TURN_URL` | TURN relay URLs, comma-separated | TURN provider (none yet) |
| `NEXT_PUBLIC_TURN_USERNAME` / `_CREDENTIAL` | TURN credentials | TURN provider |
- Services: Supabase (DB, Auth, Realtime, Storage buckets `avatars` public / `attachments`
  private), Vercel (hosting, auto-deploy from `main`), GitHub, Google public STUN servers.

## Gotchas
- **The middleware has never run in production.** `middleware.ts` is in the repo root, but with
  `src/app` Next.js only loads `src/middleware.ts`. Checked on the live site 2026-11-14: a
  signed-out request to an unknown `/api/...` path returns 404 instead of redirecting. So every
  page and API route must do its own auth check and redirect (they do), and nothing refreshes the
  session cookie on the server. Moving the file into `src/` switches it on for every request
  (two Supabase round trips each as written): do that only as its own tested branch.
- **Never `drop schema public cascade`**: it wipes Supabase's default grants → login "works"
  but every page bounces to `/login` ("permission denied for table profiles"). Fix: grant block
  in `supabase/README.md` → Recovery recipes (also has admin creation + password reset SQL).
- `realtime.messages` is owned by Supabase: don't `ENABLE ROW LEVEL SECURITY` on it (fails
  "must be owner"); v7 only adds policies.
- Vercel: `NEXT_PUBLIC_*` vars must be type **Config** (Secret won't save); they're inlined at
  build → redeploy after any env change.
- Use Supabase **legacy** anon/service_role keys; new Publishable/Secret keys untested with
  `@supabase/ssr` 0.5. JWT signing key is HS256 (an ECC key is a "previous key") — don't switch
  to asymmetric keys without testing (unverified).
- Bootstrap (`POST /api/admin/users` + `x-admin-token`) only works while `profiles` is empty;
  `/api/admin/users` is deliberately middleware-public for that and self-checks.
- Login form needs passwords ≥ 8 chars; sign in with the username, not the email.
- Builds ignore TypeScript/ESLint errors, and there's no lockfile → deps float on every Vercel build.
- `src/lib/env.ts` throws at build time ("Collecting page data") when a required variable is
  missing in that Vercel environment. Preview builds need the variables ticked for **Preview** too.
- `profiles.avatar_url` is either an https photo URL or a moji choice (`moji:fox:sky`). Never
  use it as an image source directly: render people with `UserAvatar`.
- `src/types/database.ts` is hand-written: it doesn't auto-update (a missing column won't fail
  the build) and makes supabase-js infer `never` for some `.update()` args — the reason builds
  skip tsc (comment in `next.config.ts`). Whether `npm run typecheck` passes today is unverified.
- The app was renamed to BlackFoxx. Old names survive only where renaming would break things:
  `INTERNAL_EMAIL_DOMAIN=rooms.local` (part of every login, never change), the GitHub repo /
  Vercel URL (`veil`), and "rooms" as the name of the rooms feature.
- Testing on the owner's machine: the Playwright MCP runs in Docker, so it cannot reach the
  host's `localhost`, and every HTTPS site fails with a certificate error (corporate network).
  Use the built-in Browser pane instead. Vercel previews sit behind a Vercel login and use the
  production database: never type real passwords there, the owner signs in by hand.
- Broadcast channels `chat:<chatId>` and `call:<chatId>` must keep identical names on both peers
  (same for the presence channel `blackfoxx-presence`).
  Dashboard channels (`admin-rooms:`, `admin-room:`) add a random suffix on purpose: newer
  supabase-js reuses a same-named channel and a second `subscribe()` throws.
- Calls only exist in 1:1 direct chats (room call icons are placeholders); both people must have
  the chat open; different networks need TURN (otherwise stuck on "Connecting…").
- Rate limiting (`src/lib/api.ts`) is in-memory per serverless instance — a speed bump only.
- Preview deployments share the production Supabase project (per `docs/DEPLOY.md`).
- `error.tsx` shows `Ref: <digest>` — search that digest in Vercel → Logs.

## Current status
- Live on Vercel; Supabase migrated through v9 with grants restored. Confirmed working by the
  owner: admin login, chat. Deployed but never confirmed: rooms crash hardening (c2de8e6),
  clearer form errors (36383cb), speed changes (session cache, 5 s resync poll).
- UI redesign (started 2026-11-14), one stacked branch per feature; none is merged yet:
  1. `feature/first-screen` (PR #1) — rename to BlackFoxx, tokens/fonts, moji avatars, animated
     first screen, new log-in and invite-link screens.
  2. `feature/chat-list` (PR #2) — chat home: greeting, people row, search, rows; rooms entry
     points removed (rooms are on hold; their routes still exist).
  3. `feature/chat-thread` — chat screen for admin, member and rooms: header, bubbles with the
     time under each run, pill composer, typing bubble in a fixed slot in the message list.
  4. `feature/avatar-picker` — choose your moji (Settings, or the member's More menu); stored in
     `profiles.avatar_url` as `moji:<id>:<colour>`; `PATCH /api/profile` now only changes the
     fields it is sent; Node pinned to 24.x.
  Next: 5. sign-up with an invite code (needs `v10.sql`). 6. calls: TURN + call screen. Then
  the admin/settings pages. Proposed: switch the route guard on (first Gotcha).
- The assistant has not seen any of this on a real build (previews need a Vercel login): the
  owner checks previews; designs are checked beforehand on a static mock-up.
- Five Vercel projects build every push: `veil`, `veil-32wk`, `veil-ah7i`, `veil-cqsf`,
  `veil-vo9a`. `veil-cqsf` (the address used so far) builds `main`, but its preview builds fail:
  its variables are set for Production only. Which project is the real one, and deleting the
  rest, is the owner's call.
- Decided by the owner: sign-up is invite-code only; members chat only with the admin. Open:
  a yellow "Snapchat-style" theme next to the blue.
- Calls: cross-network calls fail — TURN not configured (whether `NEXT_PUBLIC_TURN_*` are set in
  Vercel is unverified). Options: Metered (static creds, no code) or Cloudflare TURN
  (short-lived creds → needs a server route). Same-network call untested.
- Performance: Vercel builds (and by default functions) run in iad1; the Supabase region is
  unknown — set Vercel → Settings → Functions → Region to match it.
- To do: commit `package-lock.json`; add a test runner + CI.
- Known gaps: `user_session_ephemeral` has no effect (its hook is not mounted); admin-only routes
  echo raw DB errors; small blue text is under 4.5:1 in dark mode on the old screens; more in
  `docs/SECURITY.md` (in-memory rate limit, plaintext `invite_tokens`, CSP `'unsafe-inline'`,
  public chat/presence channels). No TODO/FIXME markers in the code.

When you change commands, structure, env vars or conventions, update this file in the same commit.
