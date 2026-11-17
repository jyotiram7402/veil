import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const configured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const relay =
    !!process.env.CLOUDFLARE_TURN_KEY_ID?.trim() && !!process.env.CLOUDFLARE_TURN_API_TOKEN?.trim();
  return NextResponse.json(
    { ok: true, configured, relay, time: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
