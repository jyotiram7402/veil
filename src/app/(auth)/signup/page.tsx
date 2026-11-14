import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { ENTRY_SUBMIT } from "@/components/auth/field";
import { Button } from "@/components/ui/button";
import { redirectIfSignedIn } from "@/lib/auth/session";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = { title: "Sign up" };

// Sign-up with an invite code is the next feature. Until codes exist this page
// says so plainly instead of showing a form that cannot work.
export default async function SignupPage() {
  await redirectIfSignedIn();

  return (
    <AuthShell>
      <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight">Sign up</h1>
      <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">
        {APP_NAME} is invite only. You need an invite code to create an account.
      </p>

      <p className="mt-6 rounded-2xl bg-muted px-4 py-4 text-[15px] leading-relaxed">
        Invite codes are not available yet. If you were sent a personal invite link, open that
        link to get in.
      </p>

      <Button asChild className={`mt-6 ${ENTRY_SUBMIT}`}>
        <Link href="/login">Log in instead</Link>
      </Button>
    </AuthShell>
  );
}
