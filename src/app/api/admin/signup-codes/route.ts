import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { createSignupCodeSchema } from "@/lib/validations";
import { jsonError, parseBody } from "@/lib/api";
import { formatSignupCode } from "@/lib/signup-code";
import { generateSignupCode, hashSignupCode, signupCodeHint } from "@/lib/signup-codes";
import { appOrigin } from "@/lib/url";

export const runtime = "nodejs";

const NOT_SET_UP =
  "Sign-up codes are not set up yet. Run supabase/v10.sql in the Supabase SQL editor first.";

const COLUMNS =
  "id, code_hint, label, max_uses, use_count, expires_at, revoked_at, last_used_at, created_at";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  if (!session.profile.is_admin) return jsonError(403, "Admin only");

  const admin = supabaseAdmin();
  const { data: codes, error } = await admin
    .from("signup_codes")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return jsonError(500, NOT_SET_UP);

  const ids = (codes ?? []).map((c) => c.id);
  const usedBy = new Map<string, { id: string; username: string; display_name: string | null }[]>();
  if (ids.length > 0) {
    const { data: members } = await admin
      .from("profiles")
      .select("id, username, display_name, signup_code_id")
      .in("signup_code_id", ids);
    for (const m of members ?? []) {
      if (!m.signup_code_id) continue;
      const list = usedBy.get(m.signup_code_id) ?? [];
      list.push({ id: m.id, username: m.username, display_name: m.display_name });
      usedBy.set(m.signup_code_id, list);
    }
  }

  return NextResponse.json({
    codes: (codes ?? []).map((c) => ({ ...c, used_by: usedBy.get(c.id) ?? [] })),
  });
}

export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  if (!session.profile.is_admin) return jsonError(403, "Admin only");

  const parsed = await parseBody(req, createSignupCodeSchema);
  if (!parsed.ok) return parsed.response;
  const { label, maxUses, expiresInDays } = parsed.data;

  const days = expiresInDays === undefined ? 7 : expiresInDays;
  const expiresAt = days === null ? null : new Date(Date.now() + days * 86_400_000).toISOString();

  const code = generateSignupCode();
  const admin = supabaseAdmin();
  const { data: row, error } = await admin
    .from("signup_codes")
    .insert({
      code_hash: hashSignupCode(code),
      code_hint: signupCodeHint(code),
      label: label ? label : null,
      max_uses: maxUses ?? 1,
      expires_at: expiresAt,
      created_by: session.id,
    })
    .select(COLUMNS)
    .single();
  if (error || !row) return jsonError(500, NOT_SET_UP);

  const shown = formatSignupCode(code);
  return NextResponse.json({
    code: shown,
    url: `${await appOrigin()}/signup?code=${shown}`,
    signupCode: { ...row, used_by: [] },
  });
}
