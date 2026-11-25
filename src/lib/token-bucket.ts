export type Bucket = { tokens: number; updated: number };

export function takeToken(
  buckets: Map<string, Bucket>,
  key: string,
  limit: number,
  perMs: number,
  now: number,
): boolean {
  const bucket = buckets.get(key);
  if (!bucket) {
    buckets.set(key, { tokens: limit - 1, updated: now });
    return true;
  }
  const tokens = Math.min(limit, bucket.tokens + ((now - bucket.updated) / perMs) * limit);
  bucket.updated = now;
  if (tokens < 1) {
    bucket.tokens = tokens;
    return false;
  }
  bucket.tokens = tokens - 1;
  return true;
}
