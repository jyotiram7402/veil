import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthUserId } from "@/lib/auth/session";
import { clientKey, jsonError, parseBody, rateLimit } from "@/lib/api";
import { getPushKeys, removeDevice, saveDevice } from "@/lib/push";
import { isPushEndpoint } from "@/lib/web-push";

export const runtime = "nodejs";

const unpadded = (value: string) => value.replace(/=+$/, "");

const deviceSchema = z.object({
  endpoint: z.string().refine(isPushEndpoint, "Not a push service"),
  keys: z.object({
    p256dh: z.string().max(100).transform(unpadded).pipe(z.string().regex(/^[A-Za-z0-9_-]{87}$/)),
    auth: z.string().max(40).transform(unpadded).pipe(z.string().regex(/^[A-Za-z0-9_-]{22}$/)),
  }),
  replaces: z.string().max(2000).optional(),
});

const removeSchema = z.object({ endpoint: z.string().max(2000) });

export async function POST(req: Request) {
  const userId = await getAuthUserId();
  if (!userId) return jsonError(401, "Sign in required");

  if (!rateLimit(`push:${userId}:${clientKey(req)}`, 20, 60_000)) {
    return jsonError(429, "Too many requests");
  }

  const parsed = await parseBody(req, deviceSchema);
  if (!parsed.ok) return parsed.response;

  const keys = await getPushKeys();
  if (!keys) return jsonError(503, "Notifications are not set up yet");

  const saved = await saveDevice(
    userId,
    {
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
    },
    parsed.data.replaces,
  );
  if (!saved) return jsonError(500, "Something went wrong");
  return NextResponse.json({ ok: true, key: keys.publicKey });
}

export async function DELETE(req: Request) {
  const userId = await getAuthUserId();
  if (!userId) return jsonError(401, "Sign in required");

  const parsed = await parseBody(req, removeSchema);
  if (!parsed.ok) return parsed.response;

  await removeDevice(userId, parsed.data.endpoint);
  return NextResponse.json({ ok: true });
}
