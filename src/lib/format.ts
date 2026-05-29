import {
  format,
  formatDistanceToNowStrict,
  isThisWeek,
  isToday,
  isYesterday,
} from "date-fns";

export function timeShort(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  return format(d, "HH:mm");
}

export function chatListTime(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Yesterday";
  if (isThisWeek(d)) return format(d, "EEE");
  return format(d, "dd/MM/yy");
}

export function dayLabel(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE, d MMM");
}

export function lastSeen(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 60_000) return "just now";
  return `${formatDistanceToNowStrict(d)} ago`;
}
