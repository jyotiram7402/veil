# Supabase setup

Run these files in order in **Supabase Studio → SQL Editor → New query**:

1. `schema.sql` — tables, indexes, helper functions, triggers, realtime publication
2. `policies.sql` — row-level security policies for every table
3. `storage.sql` — `avatars` (public) and `attachments` (private) buckets + policies

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

That account is now your in-app admin. Subsequent users can be created either
from `/admin` in the UI or by hitting the same endpoint while signed in as an
admin (the bootstrap token is only needed when no admin exists yet).
