import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { jsonError } from "@/lib/api";

export async function GET(req: Request) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  // Admins only — this endpoint enumerates member profiles for the chat picker.
  if (!session.profile.is_admin) return jsonError(403, "Admin only");

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();

  const supabase = await supabaseServer();
  // Only admins use this endpoint to pick a person to talk to. We hide
  // suspended/archived users from the picker.
  const query = supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, last_seen_at, is_admin, suspended, archived, bio")
    .neq("id", session.id)
    .eq("suspended", false)
    .eq("archived", false)
    .eq("is_room_guest", false)
    .order("username")
    .limit(25);

  const { data, error } = q.length > 0
    ? await query.ilike("username", `%${q}%`)
    : await query;

  if (error) return jsonError(500, "Search failed");
  return NextResponse.json({ users: data ?? [] });
}
