# v2 changes

This release rewrites Rooms / Veil into a strict **admin ↔ user** model.
Read this before deploying so the new flow makes sense.

## Apply the v2 migration

Run `supabase/v2.sql` in the Supabase SQL editor. It's idempotent. It adds:

- `invite_tokens` — one active token per non-admin user
- `app_settings` — runtime knobs (uploads on/off, screen guard, etc.)
- `profiles.suspended` / `profiles.archived` flags
- New RLS so **only admins can create chats** and only admin↔user direct
  chats are produced
- `get_or_create_admin_user_chat(p_user)` RPC
- Realtime publication for the new tables

After applying it, redeploy. No env-var changes needed.

## How auth works now

| Who | How they sign in |
|---|---|
| Admin | `/login` — username + password (Supabase Auth, unchanged) |
| Regular user | A personal invite URL of the form `https://yourapp.com/i/<token>` |

When admin creates a user from `/admin`:

1. The app auto-generates a token and shows a one-click **Copy** button for
   the invite URL.
2. Admin sends that URL to the person privately (text, email, paper, whatever).
3. When the person opens the URL:
   - The token is validated.
   - The app rotates their auth password to a fresh random value (so any
     prior session is killed, and the password is never stored).
   - A Supabase session is minted and set as cookies.
   - They land on `/chat` — a single-screen view of their conversation with
     admin. No nav, no settings, no other chats.

## Ephemeral user sessions

The `/chat` page kills the user's session the moment the tab is hidden,
the window loses focus, or the page is unloaded. To return, the user
opens their invite link again. Same link works every time — the
**revoke/disable/rotate** actions all live in the admin panel.

If the admin wants this off (e.g. they trust their users to stay
signed in across tabs), there's a runtime toggle: **Admin → Settings →
Ephemeral user sessions**. *(Note: the toggle is read by the client; if
a user already has the page loaded, they'll need to refresh.)*

## Screen guard — honest disclosure

The user-chat page wraps everything in a `<ScreenGuard>` component that:

- Blurs the entire screen the instant the window loses focus or visibility
- Covers the screen if DevTools is detected open (heuristic)
- Disables right-click, text selection on bubbles, drag start
- Catches `Ctrl/Cmd+S` and `Ctrl/Cmd+P`
- Lays a faint diagonal `@username · timestamp` watermark across the chat

**It cannot prevent screenshots.** Browsers don't expose any API that
blocks Print Screen, the Snipping Tool, iOS / Android screenshot
gestures, screen-recording, or someone photographing the screen with
another phone. What it does is:

- Defeat naive "switch tab and screenshot" scrapes
- Make screenshots ugly and traceable via the watermark
- Make DevTools-based content extraction harder

For real DRM-grade protection you need a native iOS / Android app
(those have `screenCaptureDidChange` / `FLAG_SECURE`). That's out of
scope for a Next.js webapp.

## Admin panel

`/admin` now has two tabs:

### Users
For every member you see:

- Avatar, name, username, last-seen
- Their invite URL with **Copy** / enable-disable / rotate / revoke
  controls — all changes take effect immediately
- An **Active** toggle (suspended users can't sign in)
- A **Chat** button that opens (or creates) your 1:1 conversation
- A **Delete** button that soft-deletes:
  - Sets `archived = true`, `suspended = true`
  - Revokes their invite link
  - Kills any active session
  - **Keeps the conversation in your archive** — the chat stays in your
    sidebar so you can scroll through it

  If you want to *purge* a user (wipe their auth.users row and cascade
  through messages), call `DELETE /api/admin/users/<id>?hard=1` from a
  shell. Reserved for legal-deletion situations.

### Settings (runtime)
Flip these from the UI; no redeploy:

- `uploads_enabled` — show/hide the attachment button
- `typing_indicator` — show/hide the typing bubble
- `screen_guard` — toggle the anti-leak overlay on user chats
- `user_session_ephemeral` — toggle the on-blur signout
- `max_message_length` — server-enforced cap

## Restricted to admin

These routes / API endpoints reject anyone non-admin:

- `/chats`, `/chats/[id]`, `/settings`, `/admin`, `/archive`
- All `/api/admin/*` endpoints
- The new-chat picker
- Chat creation (`/api/chats POST`) is now admin-only at the RLS level too

A non-admin who hits any of these is redirected to `/chat` (their own
single conversation).

## What's gone

- **Group chats.** The schema still supports `chats.type = 'group'`, but
  creation is locked behind admin RLS and the UI for it was removed.
  Any pre-existing groups stay readable to their members.
- **Public user-to-user chat.** Only admins can initiate any conversation.

## Sync speed

Realtime delivery is unchanged in v2 — Supabase Postgres CDC averages
~150 ms. What you may have perceived as slowness was the channel
*subscription* time on first chat open; the new `<UserChat>` reuses the
same realtime infrastructure as before but mounts the channel right
alongside the initial paint, so first-message latency is the same as
subsequent ones.

## Operational notes

- The `ADMIN_BOOTSTRAP_TOKEN` env var still works exactly as before for
  the very first admin creation. After at least one admin exists, the
  bootstrap path is dormant.
- If you ever orphan all admins (e.g. accidentally suspended yourself),
  recover via the SQL editor:
  ```sql
  update public.profiles set suspended = false, archived = false, is_admin = true
   where username = 'your-username';
  ```
- The build still has `typescript.ignoreBuildErrors: true` in
  `next.config.ts` — see comment in that file for why. Run
  `npm run typecheck` locally on your personal machine before merging
  big changes so real bugs don't slip through.
