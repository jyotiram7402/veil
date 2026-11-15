# Design

How BlackFoxx looks and why. Read this before changing any screen. Tokens live
in `src/app/globals.css`; this file explains the rules behind them.

## References

The look was set by the owner from reference screenshots:

- **App screens** (chat list, chat thread): clean white surfaces on a pale
  ground, one vivid blue, round emoji avatars, pill-shaped controls.
- **First screen**: a wall of coloured, rounded tiles floating around a big
  chunky wordmark, with Log in and Sign up at the bottom.
- **Avatars**: playful emoji characters on bright coloured grounds.

## Colour

One blue does every primary job (main buttons, links, unread counts, sent
messages). Everything else is ink, white and a pale grey ground. Bright colours
appear only on moji tiles and avatars.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--background` | `220 20% 96%` | `228 18% 7%` | page ground |
| `--card`, `--surface`, `--header` | white | `228 15% 11%` | panels, sheets, headers |
| `--foreground` | `228 20% 9%` | `220 20% 96%` | text, the "ink" button |
| `--primary` | `217 100% 52%` | same | main action, links, unread |
| `--muted` / `--muted-foreground` | `220 18% 93%` / `222 10% 40%` | `228 13% 17%` / `222 12% 68%` | field fill / secondary text |
| `--accent` | `217 80% 95%` | `222 30% 19%` | hover and selected tint |
| `--destructive` | `0 78% 45%` | `0 84% 64%` | errors, delete |
| `--online` | `145 65% 42%` | `145 60% 48%` | presence dot |
| `--accept` | `145 70% 32%` | same | the Accept button of a call, nothing else |

Moji grounds (`MOJI_COLORS` in `src/lib/moji.ts`): ink `#16181D`, sun `#FFD233`,
sky `#62C6F8`, violet `#B67CFF`, mint `#74D69C`, tangerine `#FF6B3D`,
pink `#FF74B8`, blue `#2F6BFF`, cloud `#E3E6EC`.

Rules:

- Text must reach 4.5:1 against its ground (3:1 for text 24px and larger).
  White on `--primary` is 4.7:1; do not lighten the blue.
- In dark mode, small blue text on a dark surface falls below 4.5:1. Use
  `text-foreground` with an underline for links there, not `text-primary`.
- Light and dark both ship. The theme follows the system until the user picks
  one (`blackfoxx-theme` in localStorage).

## Type

- **Figtree** (variable, loaded in `src/app/layout.tsx`) for the whole UI.
  Weights in use: 500 body, 600 controls, 700–800 headings.
- **Baloo 2 ExtraBold** only for the wordmark. It is declared in
  `src/components/auth/display-font.ts` and imported only by the entry screens,
  so the app itself never downloads it. Do not use it for headings inside the app.
- Inputs are 16px on phones so iOS does not zoom.

## Shape and depth

- Controls are pills (`rounded-full`). Fields on entry screens are 52px tall with
  16px corners; primary entry buttons are 56px tall.
- `--radius` is 1rem: `rounded-lg` 16px, `rounded-md` 14px, `rounded-sm` 12px.
- Sheets use 32px top corners. Moji tiles are squircles (30% radius).
- Shadows always have an offset and a soft blur, and stay subtle. No glow halos.

## Moji avatars

Every account without a photo gets a moji: a native emoji on a coloured ground,
picked from the user id by `mojiFor()` so one person looks the same everywhere.
Always seed with the user id when you have it. Native emoji are used on purpose:
they cost zero bytes and match the phone's own style. Each emoji is paired with a
ground it stands out on; keep that pairing when adding more.

People can choose their own in the avatar picker (`moji-picker.tsx`): an emoji from three
groups (animals, faces, things) and one of the nine grounds. The choice is saved in
`profiles.avatar_url` as `moji:<id>:<colour>`; `UserAvatar` draws it. The first 24 catalogue
entries are the pool for automatic avatars, so new ones are only ever added after them.

Emoji are for avatars and tiles only. Interface icons come from `lucide-react`.

## Chat home

The admin's home screen (`sidebar.tsx` + `chat-list.tsx`): full screen on phones, a 380px
white column from tablet up.

- The greeting is the heading ("Hello, Jay") with the unread count as its supporting line.
  Do not put a small label above a title.
- People row: a Search circle, then everyone with a 1:1 chat as 56px moji (online first).
  Search swaps the row for a pill search field.
- Rows: 48px moji, name, one-line preview, time, and a blue count when unread. Unread rows
  use heavier text. Only a green dot marks presence; offline shows nothing.
- Header controls are 40px circles. Members, Settings, the theme switch and Sign out live in
  the menu behind your own avatar.

## Chat screen

One screen for the admin (`chat-thread.tsx`), the member (`user-chat.tsx`) and rooms.

- Header, 64px: avatar, name, and a status line ("Online" in `text-online-ink`, otherwise
  "Last seen …"), then video and voice call. For the admin, tapping the name opens the chat
  details; the member has a "More" menu with the theme switch and Sign out.
- Bubbles: 20px corners. Outgoing is `--bubble-out` blue with white text, incoming is white
  (slate in dark mode). The last bubble of a run gets one tight corner and the time under it,
  with ticks for your own messages. No names or avatars in a 1:1 chat; groups show both.
- A photo fills its bubble. A file is a row with a round icon, its name and size.
- Call results and other notes are a small centred pill.
- The typing bubble sits in a slot of fixed height under the newest message, so nothing moves
  when it comes and goes (`showTyping` on `MessageList`).
- Composer: one floating pill with attach, the text field and a blue send button.

## Call screen

One screen for every call (`components/call/*`, layout in `call.module.css`). It uses the
frame of the entry screens: a stage on top, a sheet with 32px corners below. Full screen on
phones, a centred card over the dimmed app from 640px, stage beside the sheet on a phone
held sideways.

- Stage: the other person's moji, large, on its own ground colour, with the quiet rings of
  the log-in stage (white lines on a deep ground, ink lines on a pale one). A photo sits in a
  white-edged circle on the ground their automatic moji would have. This is the one place a
  moji colour fills a surface: the stage is that person's tile, enlarged.
- When their camera is on, the picture takes the stage (it fills the stage on phones and is
  shown whole from 640px) and fades in on its first frame, so the moji stays until there is
  something to show. Our own camera is a small rounded window in the top corner, mirrored
  for a front camera. Until the other side answers a video call, our own picture fills the
  stage instead.
- A picture whose shape is far from the stage's (a laptop seen on a phone, a phone seen on a
  laptop) is shown whole on a dark ground; filling the stage would cut off more than a
  quarter of it and blow the rest up.
- Sheet: the name, one status line (Calling…, the timer, Reconnecting…, why a call ended),
  one line kept free for a note so the controls never jump, then the controls. Tapping the
  timer shows "call details" in that line: the size and frame rate of both pictures.
- Controls are round (56px, 52px on phones under 375px) with their name underneath. Mute and
  Camera are toggles: filled ink means the named thing is on. Flip and Speaker only appear
  when there is a second camera or sound output to switch to. End is `--destructive`.
- An incoming call shows Decline and Accept (64px). A video call adds "Answer without
  camera". Keyboard focus goes to the card, never to a button: a key press meant for the
  message box must not answer or decline a call.
- Chips on the stage (Chat, Muted, Your camera) are `bg-card` pills, because they have to
  read on any ground and on any picture.
- "Chat" shrinks the call to a pill under the chat header: avatar, name, timer, Mute, End.
  In the admin's app it also opens that person's chat, and the pill then stays on every
  screen until the call ends. An incoming call takes the whole screen wherever the person is.
- A call that failed says what went wrong and what to do, and stays until it is closed.

## Entry screens

- `/` (`first-screen.tsx`): tiles are placed in percent of the stage (the area
  above the buttons) and sized in design pixels times `--u`, which follows
  whichever of width or height is tighter. That keeps tiles off the wordmark on
  short phones. Re-check 320x568, 390x844 and 1440x900 after moving a tile.
- `/login`, `/signup`, `/i/<token>` (`auth-shell.tsx`): blue stage with drifting
  emoji on top, the form on a white sheet. From 640px up it is a centred card.
- Styles are in `entry.module.css` (plain CSS, no JavaScript).

## Motion

- The first screen has the one authored moment: tiles pop in from the centre
  outwards (under 300ms of stagger), then drift slowly for as long as the page
  is open. Forms and buttons are never delayed by animation.
- Easing for arrivals: `cubic-bezier(0.16, 1, 0.3, 1)`. Feedback: 100–150ms.
- Animate `transform` and `opacity` only.
- On the call screen, movement means ringing: rings leave the moji and it rocks while a call
  rings or is being placed. A connected call is still.
- With "reduce motion" on, the tiles are still and nothing moves.

## Not redesigned yet

The admin pages (Members, Settings) and the room management pages still use their old
layout with the new colours. They are being rebuilt one branch at a time; the order is in
`CLAUDE.md` → Current status.
