import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { redirectIfSignedIn } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Admin login" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  await redirectIfSignedIn();
  const { next } = await searchParams;

  return (
    <AuthShell>
      <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight">Admin login</h1>
      <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">
        For the admin. Use your username and password.
      </p>

      <LoginForm nextPath={next} />

      <p className="mt-6 text-center text-[15px] text-muted-foreground">
        A member?{" "}
        <Link
          href="/enter"
          className="rounded-sm font-semibold text-foreground underline decoration-2 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          User login
        </Link>
      </p>
    </AuthShell>
  );
}
