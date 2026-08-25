import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { jsonError, parseBody } from "@/lib/api";

export const runtime = "nodejs";

const bodySchema = z.object({
  status: z.enum(["completed", "missed", "declined", "cancelled", "failed"]),
  kind: z.enum(["voice", "video"]).default("voice"),
});

function label(kind: "voice" | "video", status: string, durationSeconds: number | null): string {
  const icon = kind === "video" ? "📹" : "📞";
  const noun = kind === "video" ? "Video call" : "Voice call";
  switch (status) {
    case "completed": {
      const d = durationSeconds ?? 0;
      const mm = Math.floor(d / 60);
      const ss = (d % 60).toString().padStart(2, "0");
      return `${icon} ${noun} · ${mm}:${ss}`;
    }
    case "missed":
    case "cancelled":
      return `${icon} Missed ${noun.toLowerCase()}`;
    case "declined":
      return `${icon} ${noun} declined`;
    case "failed":
    default:
      return `${icon} ${noun} failed`;
  }
}

/**
 * Post ONE minimal call event into the chat timeline (reusing a `system`
 * message). Idempotent: the first caller to flip `event_posted` wins, so
 * duplicate terminal signals (both peers, retries) never create two events.
 * Only the call's caller may post. No media/metrics are stored.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  const { id } = await ctx.params;

  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;

  const admin = supabaseAdmin();
  const { data: call } = await admin
    .from("call_sessions")
    .select("id, chat_id, caller_id, connected_at, event_posted")
    .eq("id", id)
    .maybeSingle();

  // Only the caller of this specific call may post its event.
  if (!call || call.caller_id !== session.id) return jsonError(403, "Not allowed");
  if (call.event_posted) return NextResponse.json({ ok: true, duplicate: true });

  const now = new Date();
  const duration =
    parsed.data.status === "completed" && call.connected_at
      ? Math.max(0, Math.round((now.getTime() - new Date(call.connected_at).getTime()) / 1000))
      : null;

  // Atomic idempotency guard: flip event_posted only if still false.
  const { data: claimed } = await admin
    .from("call_sessions")
    .update({
      event_posted: true,
      status: parsed.data.status === "completed" ? "ended" : parsed.data.status,
      ended_at: now.toISOString(),
      duration_seconds: duration,
      kind: parsed.data.kind,
    })
    .eq("id", id)
    .eq("event_posted", false)
    .select("id");
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // Insert the timeline event via service role so it works even when chat is
  // disabled for the room (call events are not subject to chat permission).
  await admin.from("messages").insert({
    chat_id: call.chat_id,
    sender_id: call.caller_id,
    type: "system",
    content: label(parsed.data.kind, parsed.data.status, duration),
  });

  return NextResponse.json({ ok: true });
}
