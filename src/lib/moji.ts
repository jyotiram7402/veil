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

export type MojiColor = keyof typeof MOJI_COLORS;
export type MojiGroup = "animals" | "faces" | "things";

export type MojiEntry = {
  id: string;
  emoji: string;
  color: MojiColor;
  name: string;
  group: MojiGroup;
};

export type Moji = { emoji: string; bg: string; name: string };

export type MojiChoice = { id: string; color: MojiColor };

export const MOJI: readonly MojiEntry[] = [
  { id: "fox", emoji: "🦊", color: "sky", name: "Fox", group: "animals" },
  { id: "lion", emoji: "🦁", color: "blue", name: "Lion", group: "animals" },
  { id: "cat", emoji: "🐱", color: "violet", name: "Cat", group: "animals" },
  { id: "mouse", emoji: "🐭", color: "sun", name: "Mouse", group: "animals" },
  { id: "rhino", emoji: "🦏", color: "mint", name: "Rhino", group: "animals" },
  { id: "cow", emoji: "🐮", color: "pink", name: "Cow", group: "animals" },
  { id: "pig", emoji: "🐷", color: "mint", name: "Pig", group: "animals" },
  { id: "frog", emoji: "🐸", color: "pink", name: "Frog", group: "animals" },
  { id: "rabbit", emoji: "🐰", color: "violet", name: "Rabbit", group: "animals" },
  { id: "wolf", emoji: "🐺", color: "tangerine", name: "Wolf", group: "animals" },
  { id: "panda", emoji: "🐼", color: "sky", name: "Panda", group: "animals" },
  { id: "koala", emoji: "🐨", color: "sun", name: "Koala", group: "animals" },
  { id: "tiger", emoji: "🐯", color: "sky", name: "Tiger", group: "animals" },
  { id: "monkey", emoji: "🐵", color: "sun", name: "Monkey", group: "animals" },
  { id: "bear", emoji: "🐻", color: "sky", name: "Bear", group: "animals" },
  { id: "unicorn", emoji: "🦄", color: "blue", name: "Unicorn", group: "animals" },
  { id: "octopus", emoji: "🐙", color: "sun", name: "Octopus", group: "animals" },
  { id: "owl", emoji: "🦉", color: "mint", name: "Owl", group: "animals" },
  { id: "penguin", emoji: "🐧", color: "pink", name: "Penguin", group: "animals" },
  { id: "dog", emoji: "🐶", color: "blue", name: "Dog", group: "animals" },
  { id: "ghost", emoji: "👻", color: "violet", name: "Ghost", group: "faces" },
  { id: "robot", emoji: "🤖", color: "sun", name: "Robot", group: "faces" },
  { id: "cool", emoji: "😎", color: "blue", name: "Cool", group: "faces" },
  { id: "cowboy", emoji: "🤠", color: "mint", name: "Cowboy", group: "faces" },
  { id: "hamster", emoji: "🐹", color: "sky", name: "Hamster", group: "animals" },
  { id: "chick", emoji: "🐥", color: "blue", name: "Chick", group: "animals" },
  { id: "shark", emoji: "🦈", color: "sun", name: "Shark", group: "animals" },
  { id: "butterfly", emoji: "🦋", color: "pink", name: "Butterfly", group: "animals" },
  { id: "nerd", emoji: "🤓", color: "violet", name: "Nerd", group: "faces" },
  { id: "sleepy", emoji: "😴", color: "sky", name: "Sleepy", group: "faces" },
  { id: "starstruck", emoji: "🤩", color: "ink", name: "Star-struck", group: "faces" },
  { id: "angel", emoji: "😇", color: "violet", name: "Angel", group: "faces" },
  { id: "imp", emoji: "😈", color: "sun", name: "Imp", group: "faces" },
  { id: "clown", emoji: "🤡", color: "sky", name: "Clown", group: "faces" },
  { id: "alien", emoji: "👽", color: "violet", name: "Alien", group: "faces" },
  { id: "invader", emoji: "👾", color: "sun", name: "Invader", group: "faces" },
  { id: "pumpkin", emoji: "🎃", color: "ink", name: "Pumpkin", group: "faces" },
  { id: "goblin", emoji: "👺", color: "mint", name: "Goblin", group: "faces" },
  { id: "skull", emoji: "💀", color: "ink", name: "Skull", group: "faces" },
  { id: "rocket", emoji: "🚀", color: "ink", name: "Rocket", group: "things" },
  { id: "ufo", emoji: "🛸", color: "violet", name: "UFO", group: "things" },
  { id: "motorbike", emoji: "🏍️", color: "violet", name: "Motorbike", group: "things" },
  { id: "sailboat", emoji: "⛵", color: "blue", name: "Sailboat", group: "things" },
  { id: "swords", emoji: "⚔️", color: "tangerine", name: "Swords", group: "things" },
  { id: "cactus", emoji: "🌵", color: "sun", name: "Cactus", group: "things" },
  { id: "tulip", emoji: "🌷", color: "sky", name: "Tulip", group: "things" },
  { id: "gem", emoji: "💎", color: "pink", name: "Gem", group: "things" },
  { id: "star", emoji: "⭐", color: "blue", name: "Star", group: "things" },
  { id: "bolt", emoji: "⚡", color: "ink", name: "Lightning", group: "things" },
  { id: "fire", emoji: "🔥", color: "ink", name: "Fire", group: "things" },
  { id: "house", emoji: "🏠", color: "mint", name: "House", group: "things" },
  { id: "clock", emoji: "⏰", color: "sun", name: "Alarm clock", group: "things" },
  { id: "guitar", emoji: "🎸", color: "sky", name: "Guitar", group: "things" },
  { id: "headphones", emoji: "🎧", color: "pink", name: "Headphones", group: "things" },
  { id: "ball", emoji: "🏀", color: "blue", name: "Basketball", group: "things" },
  { id: "pizza", emoji: "🍕", color: "mint", name: "Pizza", group: "things" },
];

const AUTO_POOL = 24;

const BY_ID = new Map(MOJI.map((m) => [m.id, m] as const));
const VALUE = /^moji:([a-z0-9-]{1,24})(?::([a-z]{1,12}))?$/;

function isColor(value: string | undefined): value is MojiColor {
  return !!value && Object.prototype.hasOwnProperty.call(MOJI_COLORS, value);
}

function autoEntry(seed: string | null | undefined): MojiEntry {
  const s = seed || "?";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return MOJI[h % AUTO_POOL]!;
}

export function mojiFor(seed: string | null | undefined): Moji {
  const entry = autoEntry(seed);
  return { emoji: entry.emoji, bg: MOJI_COLORS[entry.color], name: entry.name };
}

export function autoMojiChoice(seed: string | null | undefined): MojiChoice {
  const entry = autoEntry(seed);
  return { id: entry.id, color: entry.color };
}

export function mojiValue(id: string, color: MojiColor): string {
  return `moji:${id}:${color}`;
}

export function parseMojiValue(
  value: string | null | undefined,
): (Moji & { id: string; color: MojiColor }) | null {
  if (!value) return null;
  const match = VALUE.exec(value);
  if (!match) return null;
  const entry = BY_ID.get(match[1]!);
  if (!entry) return null;
  const color = isColor(match[2]) ? match[2] : entry.color;
  return { id: entry.id, color, emoji: entry.emoji, bg: MOJI_COLORS[color], name: entry.name };
}

export function isMojiValue(value: string): boolean {
  return parseMojiValue(value) !== null;
}
