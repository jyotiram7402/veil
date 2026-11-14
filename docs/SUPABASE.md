# Supabase project setup

This document covers everything you need to do in the Supabase
dashboard. You only need to do it once.

## 1. Create a new project

Go to [supabase.com](https://supabase.com) → **New project**.

- Name: anything (e.g. `blackfoxx`)
- Database password: anything — you won't type it again, just keep it
  in a password manager in case you need to use the SQL editor as
  `postgres`.
- Region: closest to most of your users.
- Plan: **Free**.

The project takes ~1 minute to provision.

## 2. Apply the schema

Open **SQL editor → New query**. Paste and run **every** file in
`supabase/` in the order listed in [`../supabase/README.md`](../supabase/README.md):
`schema.sql`, `policies.sql`, `storage.sql`, then `v2.sql` … `v9.sql`.
Skipping the `vN` files leaves rooms, invites and calling broken.

Each file is idempotent. Schema changes go in a new numbered `vNN.sql` —
don't hand-edit production tables.

You can confirm it worked under **Table editor**: you should see
`profiles`, `chats`, `chat_members`, `messages`, `invite_tokens`,
`app_settings`, `room_invites`, `room_audit_log`, `call_sessions`.

## 3. Auth providers

Under **Authentication → Providers**:

- **Email**: enable. Open it and **disable** "Confirm email" — BlackFoxx
  creates users via the service role and they should be able to sign
  in immediately. We never collect a real email.
- Disable every other provider (Phone, OAuth, etc.).

Under **Authentication → URL configuration**, set:

- **Site URL** to your deployed app URL (or `http://localhost:3000`
  while developing).
- Add the same URLs under **Redirect URLs**.

## 4. Realtime

The migrations manage the `supabase_realtime` publication (`messages`,
`chats`, `chat_members`, `profiles`, `room_invites`, `room_audit_log`,
`call_sessions`). You can double-check under
**Database → Replication → supabase_realtime**.

## 5. Storage

`storage.sql` creates two buckets:

- **avatars** — public, used for profile and group images
- **attachments** — private, served via signed URLs valid for 7 days

Both have RLS policies that scope access to the right user / chat
members. You don't need to flip any switches in the UI after running
the SQL.

## 6. Keys you'll need

Under **Settings → API** (newer dashboards show these under **Legacy API keys**;
use these `eyJ...` keys, not the newer Publishable/Secret keys):

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role** → `SUPABASE_SERVICE_ROLE_KEY` (server-only!)

## How the username / email mapping works

Supabase Auth requires a unique email per `auth.users` row. BlackFoxx is a
username-only product, so we synthesize an email behind the scenes:
`<username>@<INTERNAL_EMAIL_DOMAIN>`. Users never see this email — they
sign in with the username they were given. The domain you choose
doesn't have to exist; it just needs to be unique and stable. **Do not
change it after seeding users**, or no one will be able to sign in.

Account creation goes through the privileged admin endpoint
(`POST /api/admin/users`), which calls `supabase.auth.admin.createUser`
with `email_confirm: true` so the password is usable immediately.

## Common SQL recipes

- **Start over:** create a fresh Supabase project and run the migrations.
  Never `drop schema public cascade` — it wipes the default grants and the
  app then loops back to `/login`. Fix + admin/password recipes are in
  `supabase/README.md` → *Recovery recipes*.

- **Promote a user to admin**:
  ```sql
  update public.profiles set is_admin = true where username = 'jay';
  ```

- **See what's in a chat**:
  ```sql
  select id, sender_id, content, created_at
  from public.messages
  where chat_id = '...'
  order by created_at desc
  limit 20;
  ```
