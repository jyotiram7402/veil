import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { profileUpdateSchema } from "@/lib/validations";
import { jsonError, parseBody } from "@/lib/api";

export async function PATCH(req: Request) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");

  const parsed = await parseBody(req, profileUpdateSchema);
  if (!parsed.ok) return parsed.response;

  const { displayName, bio, avatarUrl } = parsed.data;
  const supabase = await supabaseServer();

  const { data, error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName ?? null,
      bio: bio ?? null,
      avatar_url: avatarUrl && avatarUrl.length > 0 ? avatarUrl : null,
    })
    .eq("id", session.id)
    .select()
    .single();

  if (error) return jsonError(500, error.message);
  return NextResponse.json({ profile: data });
}
