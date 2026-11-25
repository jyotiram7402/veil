# BlackFoxx — Production Runbook

Day-2 operations. No secret values appear here. See `DEPLOYMENT.md` for first-time
setup and `docs/SECURITY.md` for the security model.

## Deploy

1. Merge to the production branch (`main`). Vercel auto-builds and deploys.
2. If a migration is part of the change, apply the new `supabase/vNN.sql` in the
   **production** Supabase SQL editor **before/with** the deploy (migrations are
   additive/idempotent).
3. Run the **Smoke tests** below.

## Rollback

- **App:** Vercel → Deployments → previous known-good → **Promote to Production**
  (instant, no rebuild).
- **Database:** never hand-edit. Ship a corrective `vNN.sql`. Destructive change?
  Restore from a Supabase backup (see “Backup”).

## Database / migrations

- Source of truth: `supabase/*.sql`, ordered in `supabase/README.md`
  (`schema → policies → storage → v2..v12`). Deterministic, idempotent.
- After any migration, re-run `supabase/security-tests.sql` to confirm RLS.
- Notifications need `v12.sql`. Until it has been run the app works as before and "Turn on
  notifications" says they are not available yet. Nothing has to be set in Vercel for them.
  Never empty `push_keys`: every device would have to subscribe again.

## Authentication

- Username/password (admins) + ephemeral sessions (participants) via Supabase
  Auth. Production config: Site URL + Redirect URLs = production origin.
  `INTERNAL_EMAIL_DOMAIN` must stay constant. First admin via bootstrap token,
  then rotate/remove it.

## WebRTC / STUN / TURN

- STUN is built in. The relay (TURN) is Cloudflare Realtime: `CLOUDFLARE_TURN_KEY_ID` and
  `CLOUDFLARE_TURN_API_TOKEN` in Vercel, see `DEPLOYMENT.md` §6. To replace the key, create
  a new one in Cloudflare, change the two values, redeploy, then delete the old key.
  Signaling is the private Supabase `call:<chatId>` channel (member-only via
  `realtime.messages` RLS).

## Monitoring

- **Vercel → Deployments → Functions/Logs** for server route + build errors.
- **Supabase → Logs** (Postgres, Auth, Realtime) for DB/auth/realtime errors.
- **Health probe:** `GET /api/health` → `{ ok, configured, time }` (no secrets).
- Browser console/WebRTC state is client-side only; no media/message content is
  ever logged or sent to any backend.

## Incident checklist

**Chat fails**
1. Vercel deployment healthy? (`/api/health`, Functions logs)
2. Supabase up? (Supabase status + Logs)
3. Realtime connected? (Supabase → Realtime; browser network shows wss)
4. Client network/browser issue? (try another device)

**Calls fail**
1. Both parties have the chat open? (signaling is scoped to `call:<chatId>`)
2. Same network works but two different networks fail → the relay. Admin → Members →
   Settings → Calls → Call relay → Check says what is wrong (not set up, key refused, Cloudflare
   not answering, or this network blocks it).
3. Check WebRTC/ICE state in the call UI (reconnecting indicator).
4. Signaling: Supabase Realtime up + `realtime.messages` policies present.
5. HTTPS in use? (mic/camera require a secure context)

**Login fails**
1. Supabase Auth up?
2. Redirect URLs / Site URL match the production origin?
3. Production env vars present? (`/api/health` → `configured: true`)

**Realtime fails**
1. Supabase Realtime status.
2. Publication + RLS present (migrations applied).
3. Client wss connection blocked by network/proxy?

**Database fails**
1. Supabase project status / quota.
2. Recent migration issue → apply corrective `vNN.sql` or restore backup.

## Backup / recovery

- Supabase provides automated backups; **point-in-time recovery availability and
  retention depend on the project's plan** — confirm in Supabase → Database →
  Backups before relying on it. Document the actual plan's retention here once
  chosen. Do not assume PITR unless the plan provides it.

## Smoke tests (run after each deploy)

Calls to a closed app (needs notifications on for that phone): close the app on the
member's phone → call it from the admin's app → "Incoming voice call" appears → tap it →
the app opens on the ringing call → Accept → talk → End. The admin's screen says
"Ringing…" from the moment the phone rings.

Functional: open prod URL → admin login → create room → create invite (copy) →
participant opens invite → enter code → join → send/receive message → voice call →
video call → mute/unmute → camera on/off → switch camera → end call → leave.

Admin enforcement: disable chat (send fails) · disable voice (voice unavailable) ·
disable video (video unavailable) · remove participant (loses access, can't
reconnect) · end room (no access).

Security: HTTPS on; `/api/health` no secrets; participant hitting `/admin` or an
admin API → denied; modified room/permission in a request → denied; expired &
revoked invites → denied; cross-room read → denied; view-source/bundle has no
service-role key.
