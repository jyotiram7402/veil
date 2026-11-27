import { NextResponse } from "next/server";
import { clientKey, jsonError, parseBody, rateLimit } from "@/lib/api";
import { signInMember } from "@/lib/auth/sign-in-member";
import { checkDirectLink, claimDirectLink, releaseDirectLink } from "@/lib/member-access";
import { directSignInSchema } from "@/lib/validations";

export const runtime = "nodejs";

const GONE = "This direct link has been used or has run out. Ask the admin for a new one.";

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!rateLimit(`direct:${token}:${clientKey(req)}`, 8, 60_000)) {
    return jsonError(429, "Too many tries. Wait a minute and try again.");
  }

  const parsed = await parseBody(req, directSignInSchema);
  if (!parsed.ok) return parsed.response;

  const check = await checkDirectLink(token, parsed.data.hashcode);
  if (!check.ok) {
    if (check.reason === "gone") return jsonError(410, GONE, { reason: "gone" });
    return jsonError(401, "That hashcode doesn't match. Check it, or ask the admin for a new link.");
  }

  if (!(await claimDirectLink(token))) return jsonError(410, GONE, { reason: "gone" });
  if (!(await signInMember(check.member))) {
    await releaseDirectLink(token);
    return jsonError(500, "Couldn't sign you in. Try again in a moment.");
  }
  return NextResponse.json({ ok: true });
}
