import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const BYTES_KB = 1024;
const BYTES_MB = BYTES_KB * 1024;

export function formatBytes(bytes: number): string {
  if (bytes < BYTES_KB) return `${bytes} B`;
  if (bytes < BYTES_MB) return `${(bytes / BYTES_KB).toFixed(1)} KB`;
  return `${(bytes / BYTES_MB).toFixed(1)} MB`;
}

export function initialsFor(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

const PALETTE = [
  "from-violet-500 to-fuchsia-500",
  "from-sky-500 to-cyan-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
  "from-indigo-500 to-blue-500",
];

export function avatarGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

/** Stable, sortable, monotonically-increasing-ish id for optimistic messages. */
export function clientMessageId(): string {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Best human-readable message from an API error body. Validation errors come
 * back as { error: "Validation failed", issues: { fieldErrors: {...} } } — this
 * surfaces the first specific field message (e.g. "Username: At least 3
 * characters") instead of the generic wrapper text.
 */
export function apiErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const b = body as {
    error?: unknown;
    issues?: { fieldErrors?: Record<string, unknown>; formErrors?: unknown };
  };
  const fieldErrors = b.issues?.fieldErrors;
  if (fieldErrors && typeof fieldErrors === "object") {
    for (const [field, msgs] of Object.entries(fieldErrors)) {
      if (Array.isArray(msgs) && typeof msgs[0] === "string") {
        const label = field
          .replace(/([a-z])([A-Z])/g, "$1 $2")
          .toLowerCase()
          .replace(/^./, (c) => c.toUpperCase());
        return `${label}: ${msgs[0]}`;
      }
    }
  }
  const formErrors = b.issues?.formErrors;
  if (Array.isArray(formErrors) && typeof formErrors[0] === "string") return formErrors[0];
  if (typeof b.error === "string" && b.error) return b.error;
  return fallback;
}

/** Usernames are lowercase letters, numbers and underscores, max 24 chars. */
export function normalizeUsernameInput(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
}
