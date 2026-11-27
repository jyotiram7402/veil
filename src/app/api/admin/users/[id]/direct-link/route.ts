import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { jsonError, parseBody } from "@/lib/api";
import { makeDirectLink } from "@/lib/member-access";
import { appOrigin } from "@/lib/url";
import { hashcodeSchema } from "@/lib/validations";

export const runtime = "nodejs";

const bodySchema = z.object({ hashcode: hashcodeSchema });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session) return jsonError(401, "Sign in required");
  if (!session.profile.is_admin) return jsonError(403, "Admin only");

  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const { id } = await ctx.params;
  const hashcode = parsed.data.hashcode.trim();

  const made = await makeDirectLink(id, hashcode);
  if (!made.ok) {
    if (made.reason === "not-member") {
      return jsonError(404, "Only a member who isn't archived can get a direct link.");
    }
    if (made.reason === "suspended") return jsonError(409, "They're suspended. Reinstate them first.");
    if (made.reason === "not-set-up") {
      return jsonError(503, "Direct links aren't available yet. Run supabase/v16.sql in Supabase.");
    }
    return jsonError(500, "Couldn't make the link. Try again.");
  }

  const origin = await appOrigin();
  return NextResponse.json({
    url: `${origin}/d/${made.token}#${encodeURIComponent(hashcode)}`,
  });
}
