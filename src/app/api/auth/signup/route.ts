import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { usernameToInternalEmail } from "@/lib/auth/username";
import { signupSchema } from "@/lib/validations";
import { clientKey, jsonError, parseBody } from "@/lib/api";
import { sharedRateLimit } from "@/lib/shared-rate-limit";
import { hashSignupCode } from "@/lib/signup-codes";

export const runtime = "nodejs";

const BAD_CODE = "That invite code isn't valid. Check it, or ask for a new one.";
const NAME_TAKEN = "That username is taken. Try another one.";
const FAILED = "Couldn't create your account. Try again in a moment.";

export async function POST(req: Request) {
  if (!(await sharedRateLimit(`signup:${clientKey(req)}`, 8, 10 * 60_000))) {
    return jsonError(429, "Too many attempts. Wait a few minutes and try again.");
  }

  const parsed = await parseBody(req, signupSchema);
  if (!parsed.ok) return parsed.response;
  const { code, username, password, displayName, avatar } = parsed.data;

  const admin = supabaseAdmin();
  const codeHash = hashSignupCode(code);

  const { data: codeRow, error: codeErr } = await admin
    .from("signup_codes")
    .select("id, max_uses, use_count, expires_at, revoked_at")
    .eq("code_hash", codeHash)
    .maybeSingle();
  if (codeErr) return jsonError(500, "Sign-up isn't available right now. Try again later.");

  const usable =
    !!codeRow &&
    !codeRow.revoked_at &&
    codeRow.use_count < codeRow.max_uses &&
    (!codeRow.expires_at || new Date(codeRow.expires_at).getTime() > Date.now());
  if (!usable) return jsonError(400, BAD_CODE);

  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (existing) return jsonError(409, NAME_TAKEN);

  const { data: claimedId, error: claimErr } = await admin.rpc("claim_signup_code", {
    p_code_hash: codeHash,
  });
  if (claimErr) return jsonError(500, FAILED);
  if (!claimedId) return jsonError(400, BAD_CODE);

  async function release() {
    try {
      await admin.rpc("release_signup_code", { p_id: claimedId as string });
    } catch {}
  }

  const email = usernameToInternalEmail(username);
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  });
  if (createErr || !created.user) {
    await release();
    if (createErr && /already|registered|exists/i.test(createErr.message)) {
      return jsonError(409, NAME_TAKEN);
    }
    if (createErr && /password/i.test(createErr.message)) {
      return jsonError(422, "That password was not accepted. Choose a longer or less common one.");
    }
    return jsonError(500, FAILED);
  }

  const { error: profileErr } = await admin.from("profiles").insert({
    id: created.user.id,
    username,
    display_name: displayName ?? null,
    avatar_url: avatar ?? null,
    is_admin: false,
    signup_code_id: claimedId as string,
  });
  if (profileErr) {
    await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
    await release();
    return jsonError(500, FAILED);
  }

  const supabase = await supabaseServer();
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });

  return NextResponse.json({ ok: true, signedIn: !signInErr });
}
