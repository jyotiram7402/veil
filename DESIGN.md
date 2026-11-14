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
- With "reduce motion" on, the tiles are still and nothing moves.

## Not redesigned yet

The call screen, the admin pages (Members, Settings) and the room management
pages still use their old layout with the new colours. They are being rebuilt one branch at a
time; the order is in `CLAUDE.md` → Current status.
