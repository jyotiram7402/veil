import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { jsonError } from "@/lib/api";

export async function GET(req: Request) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();

  const supabase = await supabaseServer();
  const query = supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, last_seen_at")
    .neq("id", session.id)
    .order("username")
    .limit(25);

  const { data, error } = q.length > 0
    ? await query.ilike("username", `%${q}%`)
    : await query;

  if (error) return jsonError(500, error.message);
  return NextResponse.json({ users: data ?? [] });
}
