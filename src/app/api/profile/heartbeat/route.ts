import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getAuthUserId } from "@/lib/auth/session";
import { jsonError } from "@/lib/api";

export async function POST() {
  const userId = await getAuthUserId();
  if (!userId) return jsonError(401, "Sign in required");

  const supabase = await supabaseServer();
  await supabase
    .from("profiles")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", userId);

  return NextResponse.json({ ok: true });
}
