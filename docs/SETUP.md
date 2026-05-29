# Local setup

This walks you from a fresh clone to a running app at
<http://localhost:3000>. None of these steps need a corporate machine —
they work on Windows, macOS, and Linux.

## 0. Prerequisites

- **Node.js 18.18 or newer** (`node -v` to check). Easiest install:
  [nodejs.org](https://nodejs.org/en/download/) or `nvm`.
- A free **Supabase** project ([supabase.com](https://supabase.com)).
- A terminal you're comfortable in. PowerShell is fine on Windows; the
  commands below are written so they work in both `bash` and PowerShell.

## 1. Clone

```bash
git clone https://github.com/YOUR-USERNAME/rooms.git
cd rooms
```

## 2. Install dependencies

```bash
npm install
```

This pulls everything in `package.json`. It's around 350 MB of
`node_modules` — normal for a Next.js project.

## 3. Configure Supabase

See [`SUPABASE.md`](SUPABASE.md) for the project + SQL + auth settings.
At the end of that you'll have:

- A project URL like `https://xxxxx.supabase.co`
- An **anon** key (public)
- A **service_role** key (server-only — keep it secret)
- The three SQL files run, in order: `schema.sql`, `policies.sql`, `storage.sql`

## 4. Set environment variables

```bash
cp .env.example .env.local      # macOS / Linux
copy .env.example .env.local    # Windows cmd
Copy-Item .env.example .env.local  # Windows PowerShell
```

Edit `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOURREF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
INTERNAL_EMAIL_DOMAIN=rooms.local
ADMIN_BOOTSTRAP_TOKEN=$(openssl rand -hex 32)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

If you don't have `openssl`, any 32+ character random string works for
`ADMIN_BOOTSTRAP_TOKEN`. It's used exactly once.

## 5. Run

```bash
npm run dev
```

Open <http://localhost:3000>. You'll be redirected to `/login`. There
are no users yet — let's make the first one.

## 6. Bootstrap the first admin

```bash
curl -X POST http://localhost:3000/api/admin/users \
  -H "Content-Type: application/json" \
  -H "x-admin-token: YOUR_BOOTSTRAP_TOKEN" \
  -d '{"username":"jay","password":"a-strong-password"}'
```

A successful response looks like:

```json
{ "ok": true, "user": { "id": "...", "username": "jay", "isAdmin": true } }
```

Sign in with that username and password. You're in.

## 7. Add more people

Once you're signed in as admin, go to **Members** in the top-left menu.
Create accounts there — no bootstrap token needed. Share each username
and password with the person privately.

## What now?

- `npm run dev` — runs the dev server with hot reload
- `npm run build` — production build (Next.js does its full type check)
- `npm run start` — runs the production build
- `npm run typecheck` — `tsc --noEmit`, fastest way to catch a regression

See [`DEPLOY.md`](DEPLOY.md) when you're ready to put it on the internet.
