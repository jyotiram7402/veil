import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { redirectIfSignedIn } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  await redirectIfSignedIn();
  const { next } = await searchParams;

  return (
    <AuthShell>
      <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight">Log in</h1>
      <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">
        Use your username and password.
      </p>

      <LoginForm nextPath={next} />

      <p className="mt-6 text-center text-[15px] text-muted-foreground">
        New here?{" "}
        <Link
          href="/signup"
          className="rounded-sm font-semibold text-foreground underline decoration-2 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Sign up
        </Link>
      </p>
      <p className="mt-3 text-center text-[13px] leading-relaxed text-muted-foreground">
        Were you sent a personal invite link? Open that link instead, it logs you in.
      </p>
    </AuthShell>
  );
}
