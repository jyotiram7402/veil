import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getAuthUserId } from "@/lib/auth/session";
import { profileUpdateSchema } from "@/lib/validations";
import { jsonError, parseBody } from "@/lib/api";

export async function PATCH(req: Request) {
  const userId = await getAuthUserId();
  if (!userId) return jsonError(401, "Sign in required");

  const parsed = await parseBody(req, profileUpdateSchema);
  if (!parsed.ok) return parsed.response;

  // Only the fields that were sent are changed; an empty string clears one.
  // (Before, saving the name wiped the avatar and the other way round.)
  const { displayName, bio, avatarUrl } = parsed.data;
  const update: { display_name?: string | null; bio?: string | null; avatar_url?: string | null } =
    {};
  if (displayName !== undefined) update.display_name = displayName || null;
  if (bio !== undefined) update.bio = bio || null;
  if (avatarUrl !== undefined) update.avatar_url = avatarUrl || null;
  if (Object.keys(update).length === 0) return jsonError(400, "Nothing to update");

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", userId)
    .select()
    .single();

  if (error) return jsonError(500, "Something went wrong");
  return NextResponse.json({ profile: data });
}
