import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth/session";
import { jsonError } from "@/lib/api";
import { getPushKeys } from "@/lib/push";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getAuthUserId();
  if (!userId) return jsonError(401, "Sign in required");

  const keys = await getPushKeys();
  if (!keys) return jsonError(503, "Notifications are not set up yet");
  return NextResponse.json({ key: keys.publicKey });
}
