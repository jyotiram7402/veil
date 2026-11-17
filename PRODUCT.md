# Product

## Platform

web

## Users

- **The owner (admin)**: runs the app, decides who gets in, and talks to each
  person one-to-one. Uses it mostly on a phone.
- **Invited people (members)**: open the app on their phone to chat and call
  with the owner. They only ever see their one chat with the owner.

## Product Purpose

BlackFoxx is a private, invite-only chat with voice and video calls. It exists
so the owner can talk to chosen people without phone numbers, email addresses or
a public app. Success is: an invited person gets in within a minute, messages
arrive instantly, and calls connect.

## Positioning

Nobody can join without the owner's invitation, and no email or phone number is
ever collected. Accounts are a username and a password.

## Operating Context

Used on phones first (installed to the home screen or in the browser), sometimes
on a laptop. The owner manages members from the same app.

## Capabilities and Constraints

- One-to-one chat between the owner and each member: text, images, files,
  typing and online indicators, read receipts.
- One-to-one voice and video calls. A call rings on any screen while the app is
  open; a closed app does not ring. Calls between two different networks pass through
  a relay (Cloudflare); they work once the owner has added the two Cloudflare values.
- Disappearing messages, off unless the owner switches them on (for everyone, or for one
  person): a message is deleted for both people once the person it was sent to has read it
  and then leaves the chat (goes back, switches app or tab, locks the phone). A message that
  has not been read stays. Photos and files go with their message. Nobody can bring a deleted
  message back, the owner included.
- Members get in through a personal invite link, or create their own account
  on the Sign up screen with a code the owner gives them.
- Members cannot chat with each other. This is a deliberate decision.
- Rooms (group spaces with temporary access codes) exist in the code but are on
  hold.
- Hosting is Vercel and Supabase. There is no local build step in the workflow:
  each feature goes out on its own branch and is checked on a Vercel preview.

## Brand Commitments

- The name is **BlackFoxx**. It replaces the earlier names everywhere.
- The look follows the owner's reference screenshots: white-and-blue app
  screens, emoji avatars on bright grounds, and a first screen of floating
  coloured tiles around the wordmark. Details are in `DESIGN.md`.
- The app must feel fast and work well on phones.

## Evidence on Hand

No testimonials, customer names, usage numbers or press exist. Do not invent any.

## Product Principles

1. Private by default: nothing is reachable without an invitation.
2. Phone first: every screen is designed for one thumb, then widened.
3. Fast before fancy: no feature may slow down opening a chat.
4. Playful surface, plain words: fun avatars and colour, clear labels and errors.
