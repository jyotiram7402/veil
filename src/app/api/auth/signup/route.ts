import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { usernameToInternalEmail } from "@/lib/auth/username";
import { signupSchema } from "@/lib/validations";
import { clientKey, jsonError, parseBody, rateLimit } from "@/lib/api";
import { hashSignupCode } from "@/lib/signup-codes";

export const runtime = "nodejs";

// One message for every way a code can be wrong (unknown, used up, expired,
// revoked), so the answer never tells a guesser which it was.
const BAD_CODE = "That invite code isn't valid. Check it, or ask for a new one.";
const NAME_TAKEN = "That username is taken. Try another one.";
const FAILED = "Couldn't create your account. Try again in a moment.";

/**
 * POST /api/auth/signup — create a member account with an invite code.
 *
 * Public on purpose: the code is the permission. The new account is always a
 * plain member (never an admin) and logs in with the username and password
 * chosen here.
 */
export async function POST(req: Request) {
  // A person fills this in once. Anything faster is somebody guessing codes.
  if (!rateLimit(`signup:${clientKey(req)}`, 8, 10 * 60_000)) {
    return jsonError(429, "Too many attempts. Wait a few minutes and try again.");
  }

  const parsed = await parseBody(req, signupSchema);
  if (!parsed.ok) return parsed.response;
  const { code, username, password, displayName, avatar } = parsed.data;

  const admin = supabaseAdmin();
  const codeHash = hashSignupCode(code);

  // 1. Is the code usable at all? This comes first, so that nobody without a
  //    working code can use this endpoint to find out which usernames exist.
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

  // 2. Is the username free? (Usernames are stored lower-case.)
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (existing) return jsonError(409, NAME_TAKEN);

  // 3. Take one use of the code. The database does this in one step, so two
  //    people can never both take the last use.
  const { data: claimedId, error: claimErr } = await admin.rpc("claim_signup_code", {
    p_code_hash: codeHash,
  });
  if (claimErr) return jsonError(500, FAILED);
  if (!claimedId) return jsonError(400, BAD_CODE);

  // Gives the use back when the account cannot be created after all.
  async function release() {
    try {
      await admin.rpc("release_signup_code", { p_id: claimedId as string });
    } catch {
      // Nothing more to do: at worst the code has one use fewer.
    }
  }

  // 4. Create the account.
  const email = usernameToInternalEmail(username);
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  });
  if (createErr || !created.user) {
    await release();
    // Somebody took the name between step 2 and now.
    if (createErr && /already|registered|exists/i.test(createErr.message)) {
      return jsonError(409, NAME_TAKEN);
    }
    // Supabase can refuse a password its own rules consider too weak.
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

  // 5. Sign this browser in. If that fails the account still exists, so the
  //    form sends the person to the log-in page instead.
  const supabase = await supabaseServer();
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });

  return NextResponse.json({ ok: true, signedIn: !signInErr });
}
