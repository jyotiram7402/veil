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
- Auth providers: "Confirm email" is **on**. Turn it off — BlackFoxx
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

## A screen keeps saying "Couldn't … Try again."

The server hit a database or storage error and logged it. Vercel → the project → Logs,
filter on errors, and look for a line that starts with the route in brackets, for example
`[admin/users] 42501 permission denied for table profiles`. The code says what went wrong
(`42501`: a missing grant, see `supabase/README.md` → Recovery recipes; `23505`: a value that
must be unique already exists; `PGRST…`: the API layer of Supabase).

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

Server Components can only read cookies, so `supabaseServer()` skips the write when
Supabase hands it a refreshed session there (`setAll` in `src/lib/supabase/server.ts`). The
browser's Supabase client and the API routes save refreshed sessions. If you see this as a
hard error, something sets a cookie in a Server Component outside `supabaseServer()`: move
that into an API route or a Server Action.

## I broke `INTERNAL_EMAIL_DOMAIN` after seeding users

`auth.users.email` is set when each account is created. Changing the
domain orphans every login. Fix:

```sql
-- replace 'old.local' / 'new.local' with your values
update auth.users
set email = regexp_replace(email, '@old\\.local$', '@new.local');
```

Then update `INTERNAL_EMAIL_DOMAIN` in your env vars.

## My typing indicator never shows for the other person

It only fires while a peer is actively typing. The broadcast is
throttled to once per ~2 seconds, and entries auto-prune after 5
seconds of silence. If you don't see it, also confirm both sides are
subscribed to the same `chat:{id}` channel (visible in browser
DevTools → Network → WS).

## I forgot my password

Reset it in place (keeps the user's chats) with the `crypt(...)` SQL in
`supabase/README.md` → *Recovery recipes*. Deleting and recreating the
account also works, but loses its chats:

```sql
-- find the user
select id, email from auth.users where email = 'jay@rooms.local';
-- nuke them (cascade clears profile + memberships)
delete from auth.users where email = 'jay@rooms.local';
```

Then create the account again from `/admin` (or via bootstrap if you
also deleted yourself).

A real password-reset flow would need a recovery email; BlackFoxx is
deliberately email-less.

## Mute says "Muting isn't available yet"

`supabase/v14.sql` has not been run. Run it in the Supabase SQL editor; nothing else is needed.

## A member I unsuspended or restored cannot get in

- "…but they still can't sign in. Try again." after Unsuspend or Restore: the account is
  marked active again, but Supabase Auth did not lift the ban. Press the same button again.
- A restored member needs a new invite link ("Set invite link" on their card in Members):
  Remove revoked the old ones. A suspended member's own link works again after Unsuspend.

## Build fails on Vercel: "Type error: ..."

Builds check types. The build log names the file and the line. The site keeps running the
previous deployment, so nothing is down; fix the line, or revert the merge on GitHub. If no
code changed and the error is inside a library, a library that one of ours brings in has
released a new version (ours have exact versions, theirs do not): add that library under
`overrides` in `package.json`, with the version before.

## GitHub shows a red cross next to a commit

The tests failed. Click the cross, then "Details": the log names the test and shows what
it expected and what came back. Vercel deploys anyway, so merge only once the cross has
turned into a green tick. `npm test` runs the same tests on any computer with Node 24.

## Build fails on Vercel: "Module not found: @/..."

Path aliases come from `tsconfig.json`. Make sure that file made it
into the commit. If you generated locally and the alias file is
missing, the simplest fix is `git status` + `git add tsconfig.json`.

## "Too many connections" from Supabase

Free tier caps you at 60 direct Postgres connections. The Next.js
server uses Supabase via HTTP (PostgREST), so this is rare in practice
— but you can hit it if you also have a local Postgres GUI like TablePlus
open. Close it.

## Sign-in succeeds but every page bounces back to `/login`

The `sb-…-auth-token` cookie gets set, yet `/chats` redirects to `/login`.
Seen after the public schema was dropped and recreated: the default table
grants were gone, so the app could not read `profiles` ("permission denied
for table profiles"). Run the grant block in `supabase/README.md` →
*Recovery recipes*, clear the cookie (or use a private window), sign in again.

## Vercel won't save a `NEXT_PUBLIC_*` variable

Vercel's "Secret" type is unreadable after saving, which conflicts with a
browser-exposed variable. Pick type **Config** for every `NEXT_PUBLIC_*`
variable (keep `SUPABASE_SERVICE_ROLE_KEY` as Secret), then **redeploy** —
`NEXT_PUBLIC_*` values are baked into the build.

## Every page and every action is slow (a second or more)

Check that the server runs next to the database. Open `/api/health` and read the
`x-vercel-id` response header (browser dev tools → Network). It looks like
`bom1::sin1::…`: where the request entered Vercel, then where the function ran. The
second code must be the region of the Supabase project (`sin1` = Singapore =
`ap-southeast-1`). It is set in `vercel.json` → `regions`, which overrides the Vercel
dashboard. With the Vercel default (`iad1`, USA) every database query crossed the
Pacific and back.

## A call says "Connecting…" and then "Couldn't connect the call"

The two devices could not reach each other. That is the normal result between two
different networks (Wi-Fi and mobile data, two homes) while the relay is not working.
The call gives up 30 seconds after it was answered.

1. Sign in as the admin → **Settings** → **Calls** → **Call relay** → Check.
   - "not set up": add `CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_API_TOKEN` in Vercel
     (`DEPLOYMENT.md` §6) and redeploy.
   - "Cloudflare refused the key": one of the two values is wrong. Copy them again.
   - "this network blocks it": the relay is fine, this network is not. Try mobile data.
   - "works from this device": run the same check on the other person's network.
2. During a call that does connect, tap the timer: the line ends with "direct" or
   "via relay".

Two tabs on the same computer connect without the relay. Calls exist only in 1:1 chats;
the call icons inside a room are placeholders.

## The video looks soft or jerky

During the call, tap the timer under the name. A line appears like
"Sending 720×1280 at 28 fps · receiving 480×854 at 15 fps".

- A small size (less than 720 on the short side) means that side's phone or
  network could not keep up, and the app stepped the picture down so it keeps
  moving. It steps back up by itself when things improve.
- A full size but few frames per second (under about 12) means the same thing a
  moment earlier: the app waits a few seconds before it steps down.
- "no video" on one side means that camera is off.

## A call does not ring on the other side

- **Their app is open:** it rings on any screen. If they were on another call, the caller
  sees "On another call" and a missed call is logged in the chat.
- **Their app is closed or in the background:** they get an "Incoming voice call"
  notification, if notifications are on for that device (see "No notification arrives").
  Tapping it opens the app, and the call rings there within a couple of seconds, for as long
  as the caller is still calling. A call rings for 45 s, and 25 s more once the other
  phone has started ringing.
- **The caller sees "Calling…" the whole time:** no device of the other person has started
  ringing. Once one does, it changes to "Ringing…".
- Not yet seen on real phones: how long a phone takes from tapping the notification to
  ringing, and whether a phone whose app slept for a long time gets its connection back in
  time.

## A call stops with "The microphone is blocked" (or the camera)

The browser has been told not to let this site use the microphone or camera.
Open the site's permissions in the browser (usually the icon next to the
address), set Microphone and Camera to Allow, and call again. A blocked camera
never ends a call: it carries on as a voice call.

On Android, Chrome itself must also be allowed to use the microphone: the phone's
Settings → Apps → Chrome → Permissions → Microphone. If Chrome is not allowed there, the
site's own Allow does nothing.

## A call stops with "The microphone could not be started"

The browser has permission but could not open the microphone. The browser's own name for
the error is shown in brackets after the message.

- **(NotReadableError)**: something else holds the microphone. On Android that is usually a
  phone or WhatsApp call, a voice recorder, a voice assistant, or the same site open in
  another tab. The app already tries twice; close the other app or tab and call again.
  Restarting Chrome (close it from the recent-apps list) clears a microphone Chrome itself
  still holds.
- **(AbortError)**: the same, on some phones.
- **(OverconstrainedError)**: the microphone chosen in the call settings has gone (a headset
  was unplugged). The app falls back to the phone's own microphone on the second try; if
  this still shows, pick another microphone.

## A call stops with "The call couldn't be set up"

Not a microphone problem. The name in brackets (for example `TypeError`) is the start of
the answer; the browser's console has the whole error, in a line starting with
`[call] the call could not start` (or `could not be answered`). On a phone, connect it to a
computer and use Chrome's `chrome://inspect` to read that console.

## No notification arrives

First use **Send a test notification**, in the same menu as "Turn off notifications" (it is
there while notifications are on). It goes to this device straight away, even while the app
is open, and says what happened:

- "Test sent" and nothing appears: the server and the push service did their part; the
  phone is holding it back. Go to steps 4 to 6.
- "isn't registered for notifications any more": turn notifications off and on again in
  the menu, then test again.
- "The push service didn't take the test": see step 8.
- "aren't set up on the server yet": see step 1.

If the test arrives but real notifications do not, step 3 is the usual reason. Otherwise,
work down the list; the first one that fits is usually it.

1. **Turning them on answers "Notifications aren't available yet"**: `supabase/v12.sql` has
   not been run in this Supabase project.
2. **Is it on for this device?** Notifications are switched on per phone or browser. Open
   the menu (the avatar on the chat home, "More" in a member's chat): it must offer "Turn off
   notifications". "Notifications blocked" means the browser was told no; the sheet behind
   that item says how to allow them.
3. **The app is open and in front on that device.** Then there is none, by design. Put the
   app in the background, wait a moment, and send again.
4. **iPhone or iPad.** Only the app opened from its Home Screen icon gets notifications
   (iOS 16.4 or later), and it has to be turned on there, not in Safari. A Focus mode or
   the Scheduled Summary holds them back.
5. **Android.** Battery saver and "notifications off" for the browser (or for the installed
   app) in the phone's settings both stop them.
6. **Computer.** The browser has to be running, and the system's "do not disturb" off.
7. **Brave.** Needs "Use Google services for push messaging" in its privacy settings.
8. **Server side.** In the Vercel logs, `[push] the push service answered 403` means the
   device was subscribed under another server key (was `push_keys` emptied?). Opening the
   app once on that device renews it. Other codes are the push service's own trouble and
   pass.

To see which devices are subscribed, in the Supabase SQL editor:

```sql
select p.username, count(*) as devices, max(s.seen_at) as app_last_in_front
  from public.push_subscriptions s
  join public.profiles p on p.id = s.user_id
 group by p.username;
```

A notification never shows what the message says, and a member's never shows a name. That
is intended (see `docs/SECURITY.md`).

## Messages do not disappear

Disappearing messages are off until the admin switches them on: **Settings** → Chat rules
for everyone → "Disappearing messages" (everyone), or **Members** → the person → Chat rules
(one person). After that:

- The chat has to be opened once after the switch was changed (an open chat keeps the
  setting it was loaded with).
- Only a message that has been read goes, and only when its reader leaves the chat: back to
  the chat list, another chat, another app or tab, a locked phone. A message nobody has read
  yet stays.
- Your own messages go when the *other* person has read them and left. If your app is open
  that shows within a few seconds; otherwise when you come back.
- With the screen lock: a message that arrived while the lock was closed has not been read.
  It goes after the chat was unlocked and then left.
- No connection at the moment of leaving: the messages are hidden on that screen at once,
  and the app tells the server again when the connection is back. If the app was closed
  before that, they show once more the next time the chat is opened, and go when it is left.

## The ticks stay grey

Two grey ticks mean sent, two blue ticks mean the other person has seen it. A message only
counts as seen while their chat is on screen: the app in front, not in the background, and
not behind the screen lock. Once they open the chat, it turns blue within about 2 seconds
(5 seconds if your live connection was asleep). In a group, it turns blue when everyone has
seen it. A message sent before this version may need the other person to open the chat once.

## A message was gone before I could read it

Every message in an open chat counts as read, also one that arrives while you are scrolled
up in the history or have a call on top of the chat. Leave the chat after that and it is
deleted. There is no way to get it back: ask the other person to send it again.

---

Still stuck? Open an issue on the repo with:

1. What you did
2. What you expected
3. What happened, plus the **exact** error message
4. Browser console + Vercel function logs if relevant
