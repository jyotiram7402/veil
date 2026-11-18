# BlackFoxx — Production Deployment

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
                         via STUN (built-in)  +  the Cloudflare relay (TURN)
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
- `NEXT_PUBLIC_APP_URL` — canonical production origin, e.g. `https://blackfoxx.example.com`

**Secret (server-only — must NOT be `NEXT_PUBLIC_`):**
- `SUPABASE_SERVICE_ROLE_KEY` — production service-role key (RLS bypass; used only in server routes)
- `INTERNAL_EMAIL_DOMAIN` — stable domain for the username→email mapping (keep constant forever)
- `ADMIN_BOOTSTRAP_TOKEN` — one-time first-admin bootstrap; rotate/remove after first admin
- `CLOUDFLARE_TURN_KEY_ID` / `CLOUDFLARE_TURN_API_TOKEN` — the call relay (see §6). Without
  them the app works, but calls between two different networks cannot connect.

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
  `npm install` (the repo uses **npm**; no lockfile is committed yet). Output: default.
- Node: `engines.node >= 18.18` in `package.json` — select Node 18 or 20 LTS.
- Production branch: **`main`** (or a dedicated `production` branch — deploy only
  from the intended branch).
- Function region: `vercel.json` pins the functions to `sin1` (Singapore), the region of the
  Supabase database (`ap-southeast-1`). It overrides the dashboard setting. A page makes several
  database round trips, so the functions must sit next to the database, not next to the users.
  If the database ever moves, change the code there (list: vercel.com/docs/regions).
- Add all env vars (§2) to Production; give Preview its own (non-production)
  Supabase project or restricted values so previews never touch production data.
- Builds check types (a type error fails the build and the previous deployment stays live);
  the linter does not run during builds (`eslint.ignoreDuringBuilds` in `next.config.ts`).

## 6. TURN configuration

Calls between two different networks (Wi-Fi and mobile data, two homes) pass through a
relay. Without one they cannot connect; on one network they work without it.

1. Cloudflare dashboard → **Realtime** → **TURN** → create a TURN key. It shows a
   "Turn Token ID" and an "API Token": copy both right away.
2. Vercel → Project → Settings → Environment Variables, for **Production** (and Preview if
   previews should make calls too): `CLOUDFLARE_TURN_KEY_ID` = the Turn Token ID,
   `CLOUDFLARE_TURN_API_TOKEN` = the API Token. Never `NEXT_PUBLIC_`.
3. Redeploy.
4. Check: `/api/health` answers `"relay": true` when both values are present. Then sign in
   as the admin → Members → **Defaults** → **Call relay** → Check: it says whether Cloudflare
   accepts the key and whether that device can reach the relay.

Cost (Cloudflare's price list, read 2026-11-17): the first 1,000 GB a month are free, after
that $0.05 per GB that passes through the relay. A video call is roughly 1 to 2 GB an
hour (an estimate from the picture's bit rate, not measured).
The server turns the key into credentials that expire after 12 hours (`src/lib/turn.ts`);
the key itself never reaches a browser.

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
