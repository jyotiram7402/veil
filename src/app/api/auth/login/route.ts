import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { usernameToInternalEmail } from "@/lib/auth/username";
import { loginSchema } from "@/lib/validations";
import { clientKey, jsonError, parseBody, rateLimit } from "@/lib/api";

export async function POST(req: Request) {
  if (!rateLimit(`login:${clientKey(req)}`, 10, 60_000)) {
    return jsonError(429, "Too many attempts. Try again in a minute.");
  }

  const parsed = await parseBody(req, loginSchema);
  if (!parsed.ok) return parsed.response;

  const { username, password } = parsed.data;
  const supabase = await supabaseServer();

  const { error } = await supabase.auth.signInWithPassword({
    email: usernameToInternalEmail(username),
    password,
  });

  if (error) {
    // Don't leak which half of the credential was wrong.
    return jsonError(401, "Invalid username or password");
  }

  return NextResponse.json({ ok: true });
}
