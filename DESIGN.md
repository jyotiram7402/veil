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
- **Yellow theme**: the owner also asked for a Snapchat-like look. It is a choice next to the
  blue, not a replacement: blue stays the default.

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
| `--primary-ink` | `217 100% 52%` | same | the brand colour as text, an icon or a ring on a plain surface |
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

### Yellow theme

Anyone can swap the blue for yellow in the menu behind their avatar (a member: the More
menu), right under the light/dark item; it names the colour you would switch to, with a dot
of it. The choice is kept per device (`blackfoxx-accent` in localStorage), and
`ThemeScript` puts `data-accent="yellow"` on `<html>` before the first paint, so nothing
flashes blue. Yellow changes only the brand tokens; grounds, text and status colours stay.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--primary`, `--bubble-out` | `55 100% 50%` | same | main action, sent messages, unread, the sign-in stage |
| `--primary-foreground`, `--bubble-out-foreground` | `228 20% 9%` (ink) | same | text and icons on yellow |
| `--primary-ink`, `--ring` | `46 100% 25%` | `55 100% 50%` | brand colour as text, icon, ring; focus |
| `--accent` | `54 100% 90%` | `48 26% 17%` | hover and selected tint |

Rules:

- Nothing is white on yellow. Text, icons and tints on `bg-primary` or `bg-bubble-out` use
  their foreground token (`text-primary-foreground`, `bg-bubble-out-foreground/20`), which is
  white in blue and ink in yellow. Never write `text-white` or `bg-white/…` on them.
- Yellow on white is 1.2:1, so the brand colour as text, an icon, a ring or a selected outline
  on a light surface is `primary-ink` (`text-primary-ink`, `ring-primary-ink`), never
  `text-primary`. In blue it is the same blue. Ink on yellow is 14.9:1; `primary-ink` on
  white is 5.8:1, and 4.9:1 on the grey field fill.
- Seen ticks stay blue in both themes: two blue ticks mean "seen" everywhere. Green (online,
  Accept) and red (errors, End) stay too.
- The sign-in stage takes its text, icons and rings from `--primary-foreground`: white lines
  on blue, ink lines on yellow.

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
- A muted chat shows a small bell-off icon before its count, and the count turns grey
  (`bg-muted-foreground`): still counted, no longer asking for attention.
- Header controls are 40px circles. Members, Settings, the light/dark switch, the colour
  switch (Blue or Yellow), notifications and Sign out live in the menu behind your own avatar.

## Notifications

One component for both screens (`notifications.tsx`).

- The offer is a floating pill, like the call pill: a white bell in a blue circle, "Turn on
  notifications", and a small close button. It floats over the content, so nothing moves
  when it comes or goes: at the top of the messages in a member's chat, at the bottom of the
  chat list on the chat home. It is shown until the person turns notifications on or closes
  it, never during a call, and it does not come back once closed. The menu item stays.
- On an iPhone in Safari it says "Get notifications" and opens a sheet with three steps
  (Share, Add to Home Screen, open from the new icon). A browser that was told no gets
  "Notifications blocked" in the menu and a sheet that says where the switch is.
- The sheets use the avatar picker's frame: 28px corners, an extra-bold title, a full-width
  primary button. Steps are a 40px grey circle (an icon or a number) and one sentence.
- The notification itself: the app icon, one line. No message text, ever. An incoming call
  stays on screen until it is tapped or closed (on computers and Android); when it ends
  unanswered it turns into "Missed voice call".

## Chat screen

One screen for the admin (`chat-thread.tsx`), the member (`user-chat.tsx`) and rooms.

- Header, 64px: avatar, name, and a status line ("Online" in `text-online-ink`, otherwise
  "Last seen …"), then video and voice call. For the admin, tapping the name opens the chat
  details, which hold the Mute switch (a toggle row in a bordered panel, as on the admin
  pages: "No notifications for new messages in this chat. Calls still ring."); the member has a "More" menu with the avatar picker, the light/dark switch,
  the colour switch, notifications and Sign out.
- Bubbles: 20px corners. Outgoing is `--bubble-out` blue with white text, incoming is white
  (slate in dark mode). The last bubble of a run gets one tight corner and the time under it,
  with ticks for your own messages: one grey tick while it is sending, two grey ticks once it
  is sent, two blue ticks (`--tick`) once the other person has seen it (in a group: everyone).
  No names or avatars in a 1:1 chat; groups show both.
- A photo fills its bubble. A file is a row with a round icon, its name and size.
- Call results and other notes are a small centred pill.
- The typing bubble sits in a slot of fixed height under the newest message, so nothing moves
  when it comes and goes (`showTyping` on `MessageList`).
- Disappearing messages (only in chats where the owner has switched them on): one small
  centred pill under the newest message, a lucide `Timer` and "Seen messages disappear when
  you leave", in the same quiet style as the day label. It must stay on one line on a 320px
  phone. An empty chat then says "Nothing here right now" / "Messages in this chat disappear
  once they have been read." Messages simply go: no animation, no "deleted" placeholder.
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
- Sheet: the name, one status line (Calling…, Ringing… once the other phone rings,
  Connecting…, the timer, Reconnecting…, why a call ended), one line kept free for a note so
  the controls never jump, then the controls.
  Tapping the timer shows "call details" in that line: the size and frame rate of both
  pictures, and "direct" or "via relay".
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
- A member's screen lock never hides a call: the call screen and the pill sit above it, so
  a call is answered and ended without the password, and the chat stays locked behind.
  While the lock is up the pill sits at the top of the screen, since there is no header.
- A call that failed says what went wrong and what to do, and stays until it is closed.

## Entry screens

- `/` (`first-screen.tsx`): tiles are placed in percent of the stage (the area
  above the buttons) and sized in design pixels times `--u`, which follows
  whichever of width or height is tighter. That keeps tiles off the wordmark on
  short phones. Re-check 320x568, 390x844 and 1440x900 after moving a tile.
- `/login`, `/signup`, `/i/<token>` (`auth-shell.tsx`): a stage in the brand colour (blue,
  or yellow with ink text and lines) with drifting emoji on top, the form on a white sheet. From 640px up it is a centred card.
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

## Admin and settings pages

Pages the admin reaches from the menu behind their avatar: Members (`components/admin/*`) and
Settings (`settings-form.tsx`). Working screens, so they look like the rest of the app and
add nothing of their own.

- Header: the chat screen's 64px bar (`ScreenHeader`): a back chevron on phones, the page name
  in bold. No second, larger title below it.
- Members has five sections (Members, Sign-up codes, Archive, Defaults, Account) as pill tabs
  under the header, in the style of the avatar picker's tabs: ink for the selected one, white
  for the rest. The row scrolls sideways on phones and stays pinned while the page scrolls;
  arrow keys move between tabs.
- Content sits on the pale ground in white panels: 16px corners, a hairline border and a soft
  offset shadow (`PANEL` in `form-styles.ts`). Content is at most 672px wide, centred.
- A member is one panel: 48px moji, the name in bold (an Admin chip for admins), then
  "@username · last seen …". The Chat circle and the ⋯ menu sit on the name line, so the
  second line keeps the full width. A suspended member gets a red "Suspended" chip on a line
  of its own; the Archive needs no chip. Under a hairline: their invite link in a grey pill
  field with Copy, and how often it was used.
- Chips are 24px pills: blue tint for Admin, green for an active code, red tint for
  Suspended, grey for the rest.
- Lists load as grey placeholder rows; a list that cannot load says so in a red note. An
  empty list says what will appear there and how.
- Forms: filled fields 48px tall with 16px corners (`FIELD`), semibold labels above them,
  native selects with a chevron. Switches are 28px tall, and tapping a setting's name flips
  it. Primary buttons are full width on phones.
- Dialogs use the avatar picker's frame: 28px corners, an extra-bold title, Cancel and the
  action as two 48px buttons at the bottom. Enter submits.
- Settings: the avatar large (96px) in its own panel with the two ways to change it, then the
  profile form.

## Not redesigned yet

The room management pages still use their old layout with the new colours (they use
`PageHeader`, the old header). Rooms are on hold.
