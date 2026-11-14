import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";
import { redirectIfSignedIn } from "@/lib/auth/session";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = { title: "Sign up" };

// The invite code can arrive in the link the admin shares: /signup?code=XXXXX-XXXXX
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  await redirectIfSignedIn();
  const { code } = await searchParams;

  return (
    <AuthShell>
      <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight">Sign up</h1>
      <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">
        {APP_NAME} is invite only. Enter the code you were given.
      </p>

      <SignupForm initialCode={typeof code === "string" ? code.slice(0, 40) : undefined} />

      <p className="mt-6 text-center text-[15px] text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="rounded-sm font-semibold text-foreground underline decoration-2 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
