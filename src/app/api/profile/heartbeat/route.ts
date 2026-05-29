import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { jsonError } from "@/lib/api";

export async function POST() {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");

  const supabase = await supabaseServer();
  await supabase
    .from("profiles")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", session.id);

  return NextResponse.json({ ok: true });
}
