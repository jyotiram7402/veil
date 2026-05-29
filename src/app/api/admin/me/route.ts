import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { usernameToInternalEmail, USERNAME_REGEX } from "@/lib/auth/username";
import { jsonError } from "@/lib/api";

const patchSchema = z
  .object({
    username: z
      .string()
      .regex(USERNAME_REGEX, "lowercase letters, numbers, underscores; 3–24 chars")
      .optional(),
    displayName: z.string().trim().max(60).nullable().optional(),
    currentPassword: z.string().min(1).optional(),
    newPassword: z
      .string()
      .min(8, "Admin password must be at least 8 chars")
      .max(128)
      .optional(),
  })
  .refine(
    (v) =>
      v.username !== undefined ||
      v.displayName !== undefined ||
      v.newPassword !== undefined,
    { message: "Nothing to change" },
  );

/**
 * PATCH /api/admin/me — admin updates their own username, display name, or
 * password.
 *
 *   - Username change updates BOTH profiles.username and auth.users.email
 *     (since we synthesize email from username).
 *   - Password change requires currentPassword to prove identity, then uses
 *     the SSR client's updateUser so the session cookie keeps working.
 */
export async function PATCH(req: Request) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  if (!session.profile.is_admin) return jsonError(403, "Admin only");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(422, parsed.error.errors[0]?.message ?? "Bad input");
  }
  const { username, displayName, currentPassword, newPassword } = parsed.data;

  const admin = supabaseAdmin();
  const supabase = await supabaseServer();

  // ----- Username change -----
  if (username && username !== session.profile.username) {
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .ilike("username", username)
      .neq("id", session.id)
      .maybeSingle();
    if (existing) return jsonError(409, "Username already taken");

    const newEmail = usernameToInternalEmail(username);
    const { error: emailErr } = await admin.auth.admin.updateUserById(session.id, {
      email: newEmail,
      email_confirm: true,
    });
    if (emailErr) return jsonError(500, emailErr.message);

    const { error: profErr } = await admin
      .from("profiles")
      .update({ username })
      .eq("id", session.id);
    if (profErr) return jsonError(500, profErr.message);
  }

  // ----- Display name -----
  if (displayName !== undefined) {
    const { error } = await admin
      .from("profiles")
      .update({ display_name: displayName })
      .eq("id", session.id);
    if (error) return jsonError(500, error.message);
  }

  // ----- Password change -----
  if (newPassword) {
    if (!currentPassword) return jsonError(400, "Current password required");

    // Verify the current password by attempting a sign-in. We use a separate
    // admin-side validator so we don't touch the live session cookies.
    const { error: vErr } = await admin.auth.signInWithPassword({
      email: usernameToInternalEmail(session.profile.username),
      password: currentPassword,
    });
    if (vErr) return jsonError(401, "Current password is wrong");

    const { error: updErr } = await supabase.auth.updateUser({ password: newPassword });
    if (updErr) return jsonError(500, updErr.message);
  }

  return NextResponse.json({ ok: true });
}
