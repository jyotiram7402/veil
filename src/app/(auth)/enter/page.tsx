import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { MemberLogin } from "@/components/auth/member-login";
import { redirectIfSignedIn } from "@/lib/auth/session";

export const metadata: Metadata = { title: "User login" };

export default async function EnterPage() {
  await redirectIfSignedIn();

  return (
    <AuthShell>
      <MemberLogin />
      <p className="mt-3 text-center text-[13px] leading-relaxed text-muted-foreground">
        Are you the admin?{" "}
        <Link
          href="/login"
          className="rounded-sm font-semibold text-foreground underline decoration-2 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Admin login
        </Link>
      </p>
    </AuthShell>
  );
}
