# Troubleshooting

A list of the things that usually go wrong first, with what to do
about each.

## "Missing required environment variable"

You forgot to copy `.env.example` to `.env.local`, or you copied it
but didn't fill in a value. In Vercel, the variable might be set for
"Production" but not "Preview" / "Development." Open
**Settings → Environment Variables** and make sure all three
environments have it.

## I can sign in locally but not on Vercel

Almost always one of:

- `NEXT_PUBLIC_SUPABASE_URL` mismatch (typo, trailing slash, wrong
  region)
- Vercel project doesn't have `SUPABASE_SERVICE_ROLE_KEY` (login itself
  doesn't need it, but creating users does)
- Auth providers: "Confirm email" is **on**. Turn it off — Rooms
  doesn't use email confirmation.

## Bootstrap returns "Bootstrap token required and must match"

The `/api/admin/users` route refuses to act without an admin session
*unless* the `profiles` table is empty AND the `x-admin-token` header
matches `ADMIN_BOOTSTRAP_TOKEN`. If you ever created a user manually
in the SQL editor, the bootstrap path is locked — just delete that
profile and try again, or sign in as the existing user and create
new ones through `/admin`.

## "Invalid username or password" but I know they're right

Usernames are case-insensitive but stored lowercase. If you bootstrapped
as `Jay`, you actually have a user named `jay`. Try the lowercase
version. Also check that the row exists:

```sql
select id, username from public.profiles where lower(username) = lower('jay');
```

## Realtime isn't delivering messages

- Open the browser console — Supabase logs subscription state. You
  should see `SUBSCRIBED` for each channel you join.
- In Supabase, **Database → Replication → supabase_realtime** must
  list `messages` (and ideally `chats`, `chat_members`, `profiles`).
  Re-run `supabase/schema.sql` if not.
- Some corporate networks block the WebSocket upgrade. Try a phone
  hotspot to confirm.

## Uploads fail with 403

The `attachments` bucket has an RLS policy that requires you to be a
member of the chat whose ID is the first path segment. The upload
route already routes files to `{chatId}/...`, so this only fails when:

- You're not actually a member of the chat. Check `chat_members`.
- You re-ran `schema.sql` but skipped `storage.sql`. Re-run it.

## "Image too large" or "File too large"

10 MB cap for attachments and 2 MB for avatars, defined in
`src/lib/constants.ts`. The composer also compresses images > 800 KB
client-side; if compression fails, the original file is used. Raise the
caps if you trust your members.

## I deleted a chat and now my chat list looks weird

If you used the SQL editor instead of the API, RLS isn't involved and
you might have left orphan members or messages. Run:

```sql
delete from public.messages where chat_id not in (select id from public.chats);
delete from public.chat_members where chat_id not in (select id from public.chats);
```

## "Cookies cannot be modified in a Server Component"

You're seeing this in the dev console as a warning, not an error. The
Supabase helper writes the refreshed cookie from `middleware.ts`, which
is where it belongs. Server Components only read cookies. If you see
this as a hard error, you probably created a new server entry point and
forgot to add it to the middleware matcher in `middleware.ts`.

## I broke `INTERNAL_EMAIL_DOMAIN` after seeding users

`auth.users.email` is set when each account is created. Changing the
domain orphans every login. Fix:

```sql
-- replace 'old.local' / 'new.local' with your values
update auth.users
set email = regexp_replace(email, '@old\\.local$', '@new.local');
```

Then update `INTERNAL_EMAIL_DOMAIN` in your env vars.

## Hot reload stops working after editing `middleware.ts`

That's a Next.js quirk — middleware doesn't HMR. Stop and restart
`npm run dev`.

## My typing indicator never shows for the other person

It only fires while a peer is actively typing. The broadcast is
throttled to once per ~2 seconds, and entries auto-prune after 5
seconds of silence. If you don't see it, also confirm both sides are
subscribed to the same `chat:{id}` channel (visible in browser
DevTools → Network → WS).

## I forgot my password

The simplest fix is to recreate the account:

```sql
-- find the user
select id, email from auth.users where email = 'jay@rooms.local';
-- nuke them (cascade clears profile + memberships)
delete from auth.users where email = 'jay@rooms.local';
```

Then create the account again from `/admin` (or via bootstrap if you
also deleted yourself).

A real password-reset flow would need a recovery email; Rooms is
deliberately email-less.

## Build fails on Vercel: "Module not found: @/..."

Path aliases come from `tsconfig.json`. Make sure that file made it
into the commit. If you generated locally and the alias file is
missing, the simplest fix is `git status` + `git add tsconfig.json`.

## "Too many connections" from Supabase

Free tier caps you at 60 direct Postgres connections. The Next.js
server uses Supabase via HTTP (PostgREST), so this is rare in practice
— but you can hit it if you also have a local Postgres GUI like TablePlus
open. Close it.

---

Still stuck? Open an issue on the repo with:

1. What you did
2. What you expected
3. What happened, plus the **exact** error message
4. Browser console + Vercel function logs if relevant
