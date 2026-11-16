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

export function clientMessageId(): string {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

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

export function normalizeUsernameInput(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
}
