# Supabase setup

Run these files in order in **Supabase Studio → SQL Editor → New query**:

1. `schema.sql` — tables, indexes, helper functions, triggers, realtime publication
2. `policies.sql` — row-level security policies for every table
3. `storage.sql` — `avatars` (public) and `attachments` (private) buckets + policies
4. `v2.sql` — **(required for v2)** invite tokens, app settings, admin-only chat policies, suspended flag

Each file is idempotent, so it is safe to re-run if you tweak something.

After that, in **Authentication → Providers**:

- Disable everything except **Email**.
- Under **Email**, turn **off** the "Confirm email" toggle. Users created via
  the service role can sign in immediately, which is the flow Rooms uses.

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
