# Veil / MyVoxa — Production Deployment

This is the canonical production deployment guide. It contains **no secret
values** — only variable names and steps. Pair it with `PRODUCTION_RUNBOOK.md`
(day-2 operations) and `docs/SECURITY.md` (security model).

## 1. Architecture

```
                 GitHub  ──push──▶  Vercel CI/CD  ──▶  Production (Next.js)
                                                          │
   User ──HTTPS──▶ Vercel edge/serverless ───────────────┤
                                                          ▼
                                              Supabase (production project)
                                                ├── Auth (username→synthetic email)
                                                ├── PostgreSQL + RLS
                                                ├── Realtime (chat + private call signaling)
                                                └── Storage (avatars, attachments)

   Calls:  Browser A ──WebRTC (Opus/VP8, SRTP)── Browser B
                         via STUN (built-in)  +  TURN (optional, env-driven)
           Signaling only (SDP/ICE) rides Supabase Realtime — never media.
```

No separate backend server. WebRTC media is peer-to-peer.

## 2. Required environment variables

Set these in **Vercel → Project → Settings → Environment Variables** for the
**Production** environment (and Preview/Development as needed). Never commit real
values; `.env.example` holds placeholders only.

**Public (safe in the browser, `NEXT_PUBLIC_`):**
- `NEXT_PUBLIC_SUPABASE_URL` — production Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — production anon key
- `NEXT_PUBLIC_APP_URL` — canonical production origin, e.g. `https://veil.example.com`
- `NEXT_PUBLIC_TURN_URL` / `NEXT_PUBLIC_TURN_USERNAME` / `NEXT_PUBLIC_TURN_CREDENTIAL` — optional TURN (see §6)

**Secret (server-only — must NOT be `NEXT_PUBLIC_`):**
- `SUPABASE_SERVICE_ROLE_KEY` — production service-role key (RLS bypass; used only in server routes)
- `INTERNAL_EMAIL_DOMAIN` — stable domain for the username→email mapping (keep constant forever)
- `ADMIN_BOOTSTRAP_TOKEN` — one-time first-admin bootstrap; rotate/remove after first admin

The app fails fast (`src/lib/env.ts`) if a required public var is missing;
`requireServerEnv()` throws (without printing the value) if the service-role key
is missing when a server route needs it.

## 3. Supabase setup (production project)

1. Create a **dedicated production** Supabase project (do not reuse dev).
2. In the SQL editor, run the migrations **in order** (see `supabase/README.md`):
   `schema.sql → policies.sql → storage.sql → v2 → v3 → v4 → v5 → v6 → v7 → v8 → v9`.
   All are idempotent.
3. Run `supabase/security-tests.sql` (edit the two placeholder UUIDs) to confirm
   the RLS negative cases pass.
4. **Auth** → URL configuration: set **Site URL** to the production origin and add
   it (plus `http://localhost:3000` for dev) to **Redirect URLs**. No external
   OAuth providers are needed (username/password only).
5. **Realtime** is enabled by the migrations (publication + `realtime.messages`
   RLS for private `call:` channels). No dashboard toggles required.
6. Bootstrap the first admin (one time):
   ```bash
   curl -X POST https://<prod-domain>/api/admin/users \
     -H "Content-Type: application/json" \
     -H "x-admin-token: $ADMIN_BOOTSTRAP_TOKEN" \
     -d '{"username":"admin","password":"<choose-strong>","isAdmin":true}'
   ```
   Then remove/rotate `ADMIN_BOOTSTRAP_TOKEN`.

## 4. Database migration process

- Migrations are plain SQL files in `supabase/`, applied via the SQL editor (or
  `supabase db` CLI if adopted). Order is deterministic and documented in
  `supabase/README.md`. They are additive/idempotent — no destructive drops.
- Never edit production tables by hand; add a new `vNN.sql` and record it.

## 5. Vercel configuration

- Framework: **Next.js** (auto-detected). Build: `npm run build`. Install:
  `npm install` (repo uses **npm** + `package-lock.json`). Output: default.
- Node: `engines.node >= 18.18` in `package.json` — select Node 18 or 20 LTS.
- Production branch: **`main`** (or a dedicated `production` branch — deploy only
  from the intended branch).
- Add all env vars (§2) to Production; give Preview its own (non-production)
  Supabase project or restricted values so previews never touch production data.
- Note: builds run with `typescript.ignoreBuildErrors` / `eslint.ignoreDuringBuilds`
  (see `next.config.ts`); run `npm run typecheck` locally/CI to catch type bugs.

## 6. TURN configuration

- **Status: NOT configured in this repo.** Calls run STUN-only by default, which
  works on most networks but **can fail across strict/symmetric NATs**.
- To enable: set `NEXT_PUBLIC_TURN_URL` (+ username/credential). ICE config is
  env-driven (`src/lib/webrtc/ice.ts`) — no code change. Prefer a provider that
  issues **short-lived** credentials; do not commit master secrets. (A future
  hardening step can mint per-session TURN credentials from a server route.)

## 7. Domain configuration

- Point the custom domain at Vercel (or use the Vercel production domain
  initially). Verify the HTTPS certificate and canonical redirect.
- Set `NEXT_PUBLIC_APP_URL` to the final origin and add it to Supabase Auth Site
  URL + Redirect URLs. Invitation links derive the origin at runtime
  (`src/lib/url.ts`) from `NEXT_PUBLIC_APP_URL` / forwarded host, so they use the
  production domain automatically — no localhost is baked in.

## 8. Authentication redirects

- Login redirects only to same-origin paths (open-redirect guard in
  `login-form.tsx`); logout → `/login`/`/expired`; expired/suspended → `/expired`.
  Confirm Supabase Redirect URLs include the production origin.

## 9. Security headers / HTTPS (already in `next.config.ts`)

HSTS, `X-Frame-Options: DENY`, CSP (`frame-ancestors 'none'`, `object-src 'none'`,
`connect-src` pinned to self + the Supabase project over https/wss),
`X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy:
camera=(self), microphone=(self), geolocation=()`, and `Cache-Control: no-store`
on `/api/*`. HTTPS is mandatory for `getUserMedia` — Vercel provides it.

## 10. Production smoke tests

Run the checklist in `PRODUCTION_RUNBOOK.md` → “Smoke tests” after every deploy.

## 11. Rollback

Vercel keeps every deployment. To roll back: **Vercel → Deployments → (previous
known-good) → Promote to Production** (instant alias swap, no rebuild). If a bad
migration is involved, apply a corrective `vNN.sql` — do not hand-edit prod.
