# Deploying to Vercel

The whole app runs on Vercel's free hobby tier. There's nothing else to
host — Supabase handles the database, auth, realtime, and file storage.

## 1. Push to GitHub

If your project isn't on GitHub yet:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/rooms.git
git push -u origin main
```

If you're on a corporate machine where you can't initialize git, do
the GitHub step from your personal machine after pulling the generated
files.

## 2. Import the repo in Vercel

1. Sign in to [vercel.com](https://vercel.com).
2. **Add New → Project** → pick the `rooms` repo.
3. Framework preset: **Next.js** (auto-detected).
4. Build command and output directory: leave the defaults.

## 3. Environment variables

Under the project's **Settings → Environment Variables**, add all of
these for **Production, Preview, and Development**:

| Name                              | Notes                                     |
| --------------------------------- | ----------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`        | from Supabase → Settings → API            |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | same place                                |
| `SUPABASE_SERVICE_ROLE_KEY`       | same place — *server-only*                |
| `INTERNAL_EMAIL_DOMAIN`           | e.g. `rooms.local`. Keep stable forever.  |
| `ADMIN_BOOTSTRAP_TOKEN`           | long random string. Used once.            |
| `NEXT_PUBLIC_APP_URL`             | your eventual prod URL (you can update later) |

⚠️ `SUPABASE_SERVICE_ROLE_KEY` must **never** be marked as a public
variable. It's referenced only from server code (`src/lib/supabase/admin.ts`
and a few API routes) — Next.js will keep it on the server as long as
the name doesn't start with `NEXT_PUBLIC_`.

## 4. Deploy

Click **Deploy**. The first build takes 1–2 minutes. You'll get a URL
like `https://rooms-yourname.vercel.app`.

## 5. Tell Supabase about the new URL

In Supabase → **Authentication → URL Configuration**, set:

- **Site URL**: `https://your-deployment.vercel.app`
- **Redirect URLs**: include the same URL (and `http://localhost:3000`
  for local dev).

You don't strictly need redirect URLs for the email/password flow, but
setting them keeps future features painless.

## 6. Bootstrap the first admin (prod)

```bash
curl -X POST https://your-deployment.vercel.app/api/admin/users \
  -H "Content-Type: application/json" \
  -H "x-admin-token: YOUR_BOOTSTRAP_TOKEN" \
  -d '{"username":"jay","password":"a-strong-password"}'
```

Sign in at `/login`. From there, add the rest of your people through the
**Members** page.

## 7. Optional: rotate the bootstrap token

After your first admin exists, the bootstrap token has no power
(`/api/admin/users` requires an admin session for any further calls).
You can leave it as-is, or replace it with a fresh value to be tidy.

## Free-tier limits to keep in mind

- **Supabase free**: 500 MB DB, 1 GB storage, 50K monthly active users,
  2 GB egress, 5 GB realtime. For a private group, you'll never come
  close.
- **Vercel free**: 100 GB bandwidth, 100 GB-hours of function execution,
  6,000 build minutes. Plenty.
- File attachments are capped at **10 MB** in code (`src/lib/constants.ts`)
  so storage stays predictable. Adjust if you trust your members.

## CI / preview deploys

Every PR you open against `main` gets its own preview deploy with the
same env vars. The Supabase project is shared between preview and
prod, so be a little careful — destructive admin actions on preview hit
real data.
