import { NextResponse } from "next/server";
import { clientKey, jsonError, parseBody } from "@/lib/api";
import { signInMember } from "@/lib/auth/sign-in-member";
import { sharedRateLimit } from "@/lib/shared-rate-limit";
import { checkMemberLogin, normalizeName, recordSignIn } from "@/lib/member-access";
import { memberLoginSchema } from "@/lib/validations";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!(await sharedRateLimit(`member-login:${clientKey(req)}`, 10, 60_000))) {
    return jsonError(429, "Too many tries. Wait a minute and try again.");
  }

  const parsed = await parseBody(req, memberLoginSchema);
  if (!parsed.ok) return parsed.response;
  const { name, hashcode } = parsed.data;

  if (!(await sharedRateLimit(`member-login-name:${normalizeName(name)}`, 6, 5 * 60_000))) {
    return jsonError(429, "Too many tries for this name. Wait a few minutes and try again.");
  }

  const check = await checkMemberLogin(name, hashcode);
  if (!check.ok) {
    if (check.reason === "ended") {
      return jsonError(
        403,
        "Your invite link has run out. Ask the admin to keep it open longer.",
        { reason: "ended" },
      );
    }
    if (check.reason === "off") {
      return jsonError(403, "Your invite link is switched off. Ask the admin to switch it on.", {
        reason: "off",
      });
    }
    return jsonError(401, "That name or hashcode is wrong.");
  }

  if (!(await signInMember(check.member))) {
    return jsonError(500, "Couldn't sign you in. Try again in a moment.");
  }
  await recordSignIn(check.invite);
  return NextResponse.json({ ok: true });
}
