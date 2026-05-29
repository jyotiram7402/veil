import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { jsonError } from "@/lib/api";

const KNOWN_KEYS = new Set([
  "uploads_enabled",
  "max_message_length",
  "screen_guard",
  "typing_indicator",
  "user_session_ephemeral",
]);

export async function GET() {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  if (!session.profile.is_admin) return jsonError(403, "Admin only");

  const admin = supabaseAdmin();
  const { data, error } = await admin.from("app_settings").select("key, value, updated_at");
  if (error) return jsonError(500, error.message);

  const map: Record<string, unknown> = {};
  for (const row of data ?? []) map[row.key] = row.value;
  return NextResponse.json({ settings: map });
}

export async function PATCH(req: Request) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  if (!session.profile.is_admin) return jsonError(403, "Admin only");

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError(400, "Invalid JSON");
  }

  const updates = Object.entries(body)
    .filter(([k]) => KNOWN_KEYS.has(k))
    .map(([key, value]) => ({
      key,
      value: value as never,
      updated_at: new Date().toISOString(),
      updated_by: session.id,
    }));

  if (updates.length === 0) return NextResponse.json({ ok: true });

  const admin = supabaseAdmin();
  const { error } = await admin.from("app_settings").upsert(updates, { onConflict: "key" });
  if (error) return jsonError(500, error.message);
  return NextResponse.json({ ok: true });
}
