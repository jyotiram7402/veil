export function readCutoff(upTo: string, now: number = Date.now()): string | null {
  const read = Date.parse(upTo);
  if (Number.isNaN(read)) return null;
  return new Date(Math.min(read, now)).toISOString().replace("Z", "999Z");
}
