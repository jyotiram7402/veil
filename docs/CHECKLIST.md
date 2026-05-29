# Production checklist

Before sharing the URL with real people:

## Supabase

- [ ] `schema.sql`, `policies.sql`, `storage.sql` all applied
- [ ] **Authentication → Email → Confirm email** is **off**
- [ ] Every other auth provider is disabled
- [ ] **URL configuration** points at the prod domain
- [ ] Service role key is **only** in Vercel env vars, never committed
      and never named `NEXT_PUBLIC_*`

## Vercel

- [ ] All required env vars set for **Production**
- [ ] `NEXT_PUBLIC_APP_URL` matches the actual deployed URL
- [ ] Build is green; preview deploys also build
- [ ] The first admin can sign in via the deployed `/login`

## App

- [ ] Bootstrap token has been used at least once and is no longer
      shared anywhere
- [ ] Admin account has a strong password
- [ ] Tested:
  - [ ] Direct chat: send, receive, image, file
  - [ ] Group chat: create, add/remove members, leave, delete
  - [ ] Typing indicator appears on the other side
  - [ ] Presence dot toggles when the other user closes the tab
  - [ ] Unread badges clear when you open a chat
  - [ ] Profile avatar upload + display name save
  - [ ] Admin can create and delete users
  - [ ] Refresh while signed in stays signed in
  - [ ] Sign out redirects to `/login`
- [ ] Tested on a real mobile browser (not just devtools)
- [ ] Tested with two tabs / two accounts to confirm realtime

## Security

- [ ] Tried hitting `/api/admin/users` without an admin session — got 403
- [ ] Tried reading another user's chat via the Supabase JS client in
      the browser console — RLS blocks it
- [ ] Tried uploading to `/api/upload` without being a member of the
      chat — got 403
- [ ] Attachment URLs expire after 7 days (signed). If you need them
      longer, regenerate.

## Operations

- [ ] You know how to:
  - Reset a forgotten password (see `TROUBLESHOOTING.md`)
  - Delete a user
  - Roll back a bad schema change (re-run idempotent SQL)
- [ ] Database backups: free Supabase only retains a few days. If the
      conversations matter to you, set up a weekly export.
