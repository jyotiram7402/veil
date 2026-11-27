import { NextResponse, after } from "next/server";
import { clientKey, jsonError, parseBody, rateLimit } from "@/lib/api";
import { deviceLabel } from "@/lib/device-label";
import { fileHashcodeRequest, normalizeName } from "@/lib/member-access";
import { notifyHashcodeRequest } from "@/lib/push";
import { forgotHashcodeSchema } from "@/lib/validations";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!rateLimit(`forgot:${clientKey(req)}`, 3, 10 * 60_000)) {
    return jsonError(429, "Too many requests. Try again in a few minutes.");
  }

  const parsed = await parseBody(req, forgotHashcodeSchema);
  if (!parsed.ok) return parsed.response;
  const { name } = parsed.data;

  if (!rateLimit(`forgot-name:${normalizeName(name)}`, 3, 60 * 60_000)) {
    return NextResponse.json({ ok: true });
  }

  const filed = await fileHashcodeRequest(name, deviceLabel(req.headers.get("user-agent")));
  if (filed.status === "not-set-up") {
    return jsonError(503, "Requests aren't available right now. Ask the admin directly.");
  }
  if (filed.status === "filed") {
    const origin = new URL(req.url).origin;
    after(() => notifyHashcodeRequest(filed.member, origin));
  }
  return NextResponse.json({ ok: true });
}
