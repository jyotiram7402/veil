import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TEMPORARY debug endpoint — remove after diagnosing login.
 * Exposes no secrets: only the project host (public), whether the server sees a
 * session, the caller's own email, and whether their profile row is readable.
 */
export async function GET() {
  let supabaseHost = "unknown";
  try {
    supabaseHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host;
  } catch {
    /* ignore */
  }

  const supabase = await supabaseServer();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  const user = userData?.user ?? null;

  let profileFound = false;
  let isAdmin: boolean | null = null;
  let profileErr: string | null = null;
  if (user) {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("is_admin, suspended, archived")
      .eq("id", user.id)
      .maybeSingle();
    profileFound = !!profile;
    isAdmin = profile?.is_admin ?? null;
    profileErr = error?.message ?? null;
  }

  return NextResponse.json(
    {
      supabaseHost,
      serverSeesUser: !!user,
      userEmail: user?.email ?? null,
      getUserError: userErr?.message ?? null,
      profileFound,
      isAdmin,
      profileError: profileErr,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
