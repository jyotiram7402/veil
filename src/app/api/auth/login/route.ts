import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { usernameToInternalEmail } from "@/lib/auth/username";
import { loginSchema } from "@/lib/validations";
import { clientKey, jsonError, parseBody } from "@/lib/api";
import { sharedRateLimit } from "@/lib/shared-rate-limit";

export async function POST(req: Request) {
  if (!(await sharedRateLimit(`login:${clientKey(req)}`, 10, 60_000))) {
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
    return jsonError(401, "Invalid username or password");
  }

  return NextResponse.json({ ok: true });
}
