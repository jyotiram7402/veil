import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const configured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return NextResponse.json(
    { ok: true, configured, time: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
