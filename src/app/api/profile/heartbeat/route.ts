import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getAuthUserId } from "@/lib/auth/session";
import { jsonError } from "@/lib/api";
import { markDevice } from "@/lib/push";
import { isPushEndpoint } from "@/lib/web-push";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const userId = await getAuthUserId();
  if (!userId) return jsonError(401, "Sign in required");

  const body = (await req.json().catch(() => null)) as { endpoint?: unknown; away?: unknown } | null;
  const sent = body?.endpoint;
  const endpoint = isPushEndpoint(sent) ? sent : null;
  const away = body?.away === true;

  const supabase = await supabaseServer();
  await Promise.all([
    away
      ? null
      : supabase
          .from("profiles")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("id", userId),
    endpoint ? markDevice(userId, endpoint, !away).catch(() => undefined) : null,
  ]);

  return NextResponse.json({ ok: true });
}
