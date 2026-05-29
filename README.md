# Rooms

A small, private, real-time chat for people you actually want to talk to.
Username + password, no email, no phone, no signups — accounts are created
by an admin and that's it.

It's deliberately minimal: one Next.js 15 app, one Supabase project,
deployable to Vercel's free tier in about ten minutes.

## What's in the box

- One-to-one and group chats with realtime delivery
- Image and file attachments (10 MB cap, images compressed in-browser)
- Typing indicators and online presence
- Read receipts + unread counts
- Mobile-first dark UI with glassmorphism and tasteful motion
- Admin panel to create / remove members
- Strict Row-Level Security on every table; private storage with signed URLs

## Tech

- **Next.js 15** App Router + React Server Components, TypeScript
- **Supabase** for Postgres, Auth, Realtime, Storage — all on the free tier
- **Tailwind CSS** + a hand-picked subset of shadcn/ui primitives
- **Zustand** for client state, **Zod** + **react-hook-form** for forms,
  **Framer Motion** for animation, **Lucide** for icons
- **Sonner** for toasts

No separate backend, no Docker, no Redis, no paid APIs.

## Quick start (10 minutes)

You need a Supabase project and a Vercel account. Both are free.

1. **Create a Supabase project** ([supabase.com](https://supabase.com)).
2. In the **SQL editor**, paste & run, in order:
   - `supabase/schema.sql`
   - `supabase/policies.sql`
   - `supabase/storage.sql`
   - `supabase/v2.sql` *(required for v2 — admin↔user-only model + invite links)*
3. In **Authentication → Providers → Email**, disable "Confirm email."
   (Rooms creates users via the service role, so they should be able to
   sign in immediately.)
4. Copy `.env.example` to `.env.local` and fill in your project URL,
   anon key, service role key, and a random `ADMIN_BOOTSTRAP_TOKEN`.
5. Locally: `npm install` then `npm run dev`. Visit
   <http://localhost:3000>.
6. From a terminal, create the first admin user:

   ```bash
   curl -X POST http://localhost:3000/api/admin/users \
     -H "Content-Type: application/json" \
     -H "x-admin-token: $ADMIN_BOOTSTRAP_TOKEN" \
     -d '{"username":"jay","password":"a-strong-password"}'
   ```

   That user is automatically promoted to admin because no profiles
   existed yet. After that, the bootstrap token does nothing — new users
   are created from the **/admin** screen.

For deploying to Vercel and going to production, see
[`docs/DEPLOY.md`](docs/DEPLOY.md). For full Supabase setup details, see
[`docs/SUPABASE.md`](docs/SUPABASE.md). If something breaks, start with
[`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md).

## Project layout

```
src/
  app/
    (auth)/login          — sign-in page
    (app)/
      layout.tsx           — auth gate + sidebar shell
      chats/page.tsx       — empty state
      chats/[id]/page.tsx  — a single conversation
      settings/page.tsx    — your profile
      admin/page.tsx       — admin-only members list
    api/
      auth/                — login / logout / session
      admin/users          — create + delete accounts (server-only)
      chats/...            — chat CRUD, messages, members, read receipts
      profile/...          — profile update + heartbeat
      users/search         — typeahead for picking people
      upload                — multipart upload to storage
  components/
    ui/                    — shadcn primitives (Button, Dialog, etc.)
    layout/                — AppShell, Sidebar
    chat/                  — list, thread, bubble, composer, dialogs
    auth/                  — login form
    admin-panel.tsx        — admin UI
    settings-form.tsx      — settings UI
  lib/
    supabase/{client,server,admin,middleware}.ts
    auth/{username,session}.ts
    {api,env,utils,format,constants,validations,queries}.ts
  store/                   — zustand stores (session, chat, presence)
  hooks/                   — realtime, presence, typing, heartbeat
  types/                   — database & domain types
supabase/
  schema.sql               — tables, indexes, triggers, RPCs, realtime
  policies.sql             — RLS for every table
  storage.sql              — buckets and storage RLS
middleware.ts              — refreshes Supabase session + protects routes
```

## License

Use it for personal stuff. No warranty.
