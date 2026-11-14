# Supabase setup

Run these files in order in **Supabase Studio → SQL Editor → New query**:

1. `schema.sql` — tables, indexes, helper functions, triggers, realtime publication
2. `policies.sql` — row-level security policies for every table
3. `storage.sql` — `avatars` (public) and `attachments` (private) buckets + policies
4. `v2.sql` — invite tokens, app settings, admin-only chat policies, suspended flag
5. `v3.sql` — per-token gate password + per-user settings overrides
6. `v4.sql` — secure rooms & invitations: room lifecycle/permission
   columns on `chats`, `chat_members.blocked`, `profiles.is_room_guest`, `room_invites`,
   `room_audit_log`, `is_room_admin()` / `can_access_chat()` helpers, and the RLS updates
7. `v5.sql` — per-participant permissions (`chat_members.can_chat/
   can_voice/can_video`), soft-remove (`chat_members.removed_at`), `can_access_chat()` update,
   column-level UPDATE lock-down on `chat_members` (only `last_read_at` for authenticated), and
   an owner index for the admin room list
8. `v6.sql` — locked-room fix in `can_access_chat()` (existing
   participants stay), atomic `claim_room_seat()` (race-safe participant limit), and
   `can_chat_in()` which enforces the effective chat permission on message insert server-side
9. `v7.sql` — 1-to-1 voice calling: RLS on `realtime.messages`
   so only chat members can use the private `call:<chatId>` signaling channel, and a
   `call_sessions` history table (no audio/SDP/ICE stored). Voice audio is peer-to-peer WebRTC.
10. `v8.sql` — call/chat integration: `call_sessions.kind` now
    allows `'video'`, plus `duration_seconds` and an idempotent `event_posted` flag so a
    completed/missed/failed call leaves exactly one `system` message in the chat timeline.
11. `v9.sql` — admin-gates the
    `get_or_create_direct_chat` RPC, tightens `profiles` SELECT (self/admin/shares-a-chat),
    removes `invite_tokens`/`app_settings` from the realtime publication, and re-asserts RLS.
12. `v10.sql` — sign-up with an invite code: the `signup_codes` table (hashes only, no
    policies, service role only), `profiles.signup_code_id`, and the atomic
    `claim_signup_code()` / `release_signup_code()` functions.

Optionally run `security-tests.sql` with **psql** afterwards (see its header) to verify the
RLS negative cases — it uses psql `\set` variables, so it won't run in the dashboard editor.
Each file is idempotent, so it is safe to re-run if you tweak something.

After that, in **Authentication → Providers**:

- Disable everything except **Email**.
- Under **Email**, turn **off** the "Confirm email" toggle. Users created via
  the service role can sign in immediately, which is the flow BlackFoxx uses.

Then create your first user from the running app:

```bash
curl -X POST https://YOUR_DEPLOYMENT/api/admin/users \
  -H "Content-Type: application/json" \
  -H "x-admin-token: $ADMIN_BOOTSTRAP_TOKEN" \
  -d '{"username":"jay","password":"a-strong-password","isAdmin":true}'
```

That account is your admin. Subsequent users are created from `/admin` in the
UI; for regular (non-admin) users you don't need to set a password — the app
auto-generates an invite link instead.

## Recovery recipes (SQL Editor)

**Never run `drop schema public cascade`.** It also deletes Supabase's default table
grants. Everything then *looks* fine — login even succeeds — but the app can't read
`profiles`, so every page bounces back to `/login` ("permission denied for table
profiles"). If it already happened, re-run all migrations in order, then:

```sql
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines  in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on routines  to anon, authenticated, service_role;
```

RLS still decides which rows each user sees; these grants only restore table access.

**Create an admin without the bootstrap token** (bootstrap only works while `profiles`
is empty):
1. Authentication → Users → Add user → email `<username>@<INTERNAL_EMAIL_DOMAIN>`
   (e.g. `admin@rooms.local`), a password of 8+ characters, tick **Auto Confirm User**.
2. Copy the new user's UUID, then:
   ```sql
   insert into public.profiles (id, username, is_admin)
   values ('<user-uuid>', 'admin', true);
   ```
3. Sign in at `/login` with the **username** (`admin`), not the email.

**Reset a forgotten password** (login form requires 8+ characters):
```sql
update auth.users
set encrypted_password = crypt('<new-password>', gen_salt('bf')),
    email_confirmed_at = coalesce(email_confirmed_at, now())
where email = 'admin@rooms.local';
```

**Unconfirmed user can't sign in:** `update auth.users set email_confirmed_at = now() where email = '...';`
