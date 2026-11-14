/**
 * "Moji" avatars: a native emoji on a coloured ground.
 *
 * Every account without a photo gets one, picked from its id, so the same
 * person looks the same on every screen and device. Native emoji cost zero
 * bytes and render in each platform's own style.
 */

export const MOJI_COLORS = {
  ink: "#16181D",
  sun: "#FFD233",
  sky: "#62C6F8",
  violet: "#B67CFF",
  mint: "#74D69C",
  tangerine: "#FF6B3D",
  pink: "#FF74B8",
  blue: "#2F6BFF",
  cloud: "#E3E6EC",
} as const;

export type Moji = { emoji: string; bg: string; name: string };

// Each emoji is paired with a ground it stands out on (a fox on orange would
// disappear). Add new ones at the end: the order decides who gets which.
export const MOJI: readonly Moji[] = [
  { emoji: "🦊", bg: MOJI_COLORS.sky, name: "Fox" },
  { emoji: "🦁", bg: MOJI_COLORS.blue, name: "Lion" },
  { emoji: "🐱", bg: MOJI_COLORS.violet, name: "Cat" },
  { emoji: "🐭", bg: MOJI_COLORS.sun, name: "Mouse" },
  { emoji: "🦏", bg: MOJI_COLORS.mint, name: "Rhino" },
  { emoji: "🐮", bg: MOJI_COLORS.pink, name: "Cow" },
  { emoji: "🐷", bg: MOJI_COLORS.mint, name: "Pig" },
  { emoji: "🐸", bg: MOJI_COLORS.pink, name: "Frog" },
  { emoji: "🐰", bg: MOJI_COLORS.violet, name: "Rabbit" },
  { emoji: "🐺", bg: MOJI_COLORS.tangerine, name: "Wolf" },
  { emoji: "🐼", bg: MOJI_COLORS.sky, name: "Panda" },
  { emoji: "🐨", bg: MOJI_COLORS.sun, name: "Koala" },
  { emoji: "🐯", bg: MOJI_COLORS.sky, name: "Tiger" },
  { emoji: "🐵", bg: MOJI_COLORS.sun, name: "Monkey" },
  { emoji: "🐻", bg: MOJI_COLORS.sky, name: "Bear" },
  { emoji: "🦄", bg: MOJI_COLORS.blue, name: "Unicorn" },
  { emoji: "🐙", bg: MOJI_COLORS.sun, name: "Octopus" },
  { emoji: "🦉", bg: MOJI_COLORS.mint, name: "Owl" },
  { emoji: "🐧", bg: MOJI_COLORS.pink, name: "Penguin" },
  { emoji: "🐶", bg: MOJI_COLORS.blue, name: "Dog" },
  { emoji: "👻", bg: MOJI_COLORS.violet, name: "Ghost" },
  { emoji: "🤖", bg: MOJI_COLORS.sun, name: "Robot" },
  { emoji: "😎", bg: MOJI_COLORS.blue, name: "Cool" },
  { emoji: "🤠", bg: MOJI_COLORS.mint, name: "Cowboy" },
];

/** Stable pick: the same seed (a user id, or a name) always gets the same moji. */
export function mojiFor(seed: string | null | undefined): Moji {
  const s = seed || "?";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return MOJI[h % MOJI.length]!;
}
