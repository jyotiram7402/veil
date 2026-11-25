import { ImageIcon, Lock, MessageCircleMore, Timer, type LucideIcon } from "lucide-react";

export type RuleKey = "uploads_enabled" | "typing_indicator" | "screen_guard" | "disappearing_messages";

export const CHAT_RULES: {
  key: RuleKey;
  icon: LucideIcon;
  title: string;
  description: string;
  fallback: boolean;
}[] = [
  {
    key: "uploads_enabled",
    icon: ImageIcon,
    title: "Photos and files",
    description: "Sending pictures and files in the chat.",
    fallback: true,
  },
  {
    key: "typing_indicator",
    icon: MessageCircleMore,
    title: "Typing bubble",
    description: "The bubble that shows while the other person types.",
    fallback: true,
  },
  {
    key: "screen_guard",
    icon: Lock,
    title: "Lock when they look away",
    description: "The chat hides behind a password prompt when the app is left.",
    fallback: true,
  },
  {
    key: "disappearing_messages",
    icon: Timer,
    title: "Disappearing messages",
    description: "A read message is deleted for both people when its reader leaves the chat.",
    fallback: false,
  },
];

export function everyoneValue(settings: Record<string, unknown>, key: RuleKey): boolean {
  const rule = CHAT_RULES.find((r) => r.key === key);
  const value = settings[key];
  return typeof value === "boolean" ? value : (rule?.fallback ?? false);
}

export const MAX_LENGTH = { fallback: 4000, min: 100, max: 20000 };

export function everyoneLength(settings: Record<string, unknown>): number {
  const value = Number(settings.max_message_length);
  return Number.isFinite(value) && value > 0 ? value : MAX_LENGTH.fallback;
}

export function clampLength(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return null;
  return Math.min(MAX_LENGTH.max, Math.max(MAX_LENGTH.min, n));
}

export const DISAPPEARING_CONFIRM = {
  title: "Turn on disappearing messages?",
  confirmLabel: "Turn on",
  paragraphs: [
    "A message will be deleted for both people once the person it was sent to has read it and leaves the chat. Messages read before now go too, the next time each person leaves.",
    "Deleted messages, photos and files cannot be brought back, not even by you.",
  ],
};
