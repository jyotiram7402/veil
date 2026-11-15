/**
 * Disappearing messages: the moment up to which a person's messages count as
 * read, written the way the database needs it.
 *
 * `upTo` is the time of the newest message the person had on screen.
 *
 *  - Never later than now: nobody has read a message from the future, and the
 *    other person's screen is told this same moment (src/lib/vanish.ts).
 *  - To the end of its millisecond. The database counts in microseconds and
 *    JavaScript in milliseconds. Cut down to the millisecond, the very message
 *    the time was taken from (…30.123456) would lie just past the cutoff
 *    (…30.123) and never be deleted.
 *
 * Returns null when `upTo` is not a time.
 */
export function readCutoff(upTo: string, now: number = Date.now()): string | null {
  const read = Date.parse(upTo);
  if (Number.isNaN(read)) return null;
  return new Date(Math.min(read, now)).toISOString().replace("Z", "999Z");
}
