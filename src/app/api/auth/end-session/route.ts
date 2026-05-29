import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// sendBeacon target. Always answers 204 so the page can die cleanly.
export async function POST() {
  try {
    const supabase = await supabaseServer();
    await supabase.auth.signOut();
  } catch {
    // ignore — we're a fire-and-forget endpoint
  }
  return new NextResponse(null, { status: 204 });
}
