import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { jsonError } from "@/lib/api";
import { openHashcodeRequests } from "@/lib/member-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  if (!session.profile.is_admin) return jsonError(403, "Admin only");

  const requests = await openHashcodeRequests();
  return NextResponse.json({ requests: requests ?? [], available: requests !== null });
}
