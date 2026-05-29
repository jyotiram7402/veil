import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";
import { jsonError } from "@/lib/api";
import { SETTING_KEYS } from "@/lib/settings";

const KNOWN = new Set<string>(SETTING_KEYS);

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  if (!session.profile.is_admin) return jsonError(403, "Admin only");

  const { id } = await ctx.params;
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("profiles")
    .select("settings")
    .eq("id", id)
    .maybeSingle();
  if (error) return jsonError(500, error.message);
  return NextResponse.json({ settings: (data?.settings as Record<string, unknown>) ?? {} });
}

/**
 * PATCH applies a partial override. Pass `null` for a key to clear the
 * per-user override (falls back to the global app_setting).
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  if (!session.profile.is_admin) return jsonError(403, "Admin only");

  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError(400, "Invalid JSON");
  }

  const admin = supabaseAdmin();
  const { data: existing } = await admin
    .from("profiles")
    .select("settings")
    .eq("id", id)
    .maybeSingle();

  const current = (existing?.settings as Record<string, unknown>) ?? {};
  const next: Record<string, unknown> = { ...current };
  for (const [k, v] of Object.entries(body)) {
    if (!KNOWN.has(k)) continue;
    if (v === null) {
      delete next[k];
    } else {
      next[k] = v;
    }
  }

  const { error } = await admin
    .from("profiles")
    .update({ settings: next as never })
    .eq("id", id);
  if (error) return jsonError(500, error.message);
  return NextResponse.json({ settings: next });
}
