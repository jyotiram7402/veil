const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MINUTE = 60_000;
const MINUTES_IN_DAY = 1440;
const MINUTES_IN_MONTH = 43_200;
const MINUTES_IN_YEAR = 525_600;

const pad = (n: number) => String(n).padStart(2, "0");
const toDate = (input: string | Date) => (typeof input === "string" ? new Date(input) : input);
const clock = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dayStart = (d: Date, shift = 0) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + shift).getTime();
const weekStart = (d: Date) => dayStart(d, -d.getDay());

function isToday(d: Date): boolean {
  return dayStart(d) === dayStart(new Date());
}

function isYesterday(d: Date): boolean {
  return dayStart(d) === dayStart(new Date(), -1);
}

export function timeShort(input: string | Date): string {
  return clock(toDate(input));
}

export function chatListTime(input: string | Date): string {
  const d = toDate(input);
  if (isToday(d)) return clock(d);
  if (isYesterday(d)) return "Yesterday";
  if (weekStart(d) === weekStart(new Date())) return WEEKDAYS[d.getDay()]!.slice(0, 3);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${pad(d.getFullYear() % 100)}`;
}

export function dayLabel(input: string | Date): string {
  const d = toDate(input);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function lastSeen(input: string | Date): string {
  const d = toDate(input);
  const now = new Date();
  const elapsed = now.getTime() - d.getTime();
  if (elapsed < MINUTE) return "just now";

  const minutes = elapsed / MINUTE;
  const wallMinutes = minutes - (now.getTimezoneOffset() - d.getTimezoneOffset());
  let count: number;
  let unit: string;
  if (minutes < 60) {
    count = Math.round(minutes);
    unit = "minute";
  } else if (minutes < MINUTES_IN_DAY) {
    count = Math.round(minutes / 60);
    unit = "hour";
  } else if (wallMinutes < MINUTES_IN_MONTH) {
    count = Math.round(wallMinutes / MINUTES_IN_DAY);
    unit = "day";
  } else if (wallMinutes < MINUTES_IN_YEAR) {
    const months = Math.round(wallMinutes / MINUTES_IN_MONTH);
    count = months === 12 ? 1 : months;
    unit = months === 12 ? "year" : "month";
  } else {
    count = Math.round(wallMinutes / MINUTES_IN_YEAR);
    unit = "year";
  }
  return `${count} ${unit}${count === 1 ? "" : "s"} ago`;
}
