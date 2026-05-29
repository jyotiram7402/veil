import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="min-h-screen grid place-items-center px-6 chat-bg relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <span className="font-semibold text-xl">V</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{APP_TAGLINE}</p>
        </div>

        <div className="glass rounded-2xl p-6">
          <LoginForm nextPath={next} />
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Admin sign-in. Regular users use their invite link instead.
        </p>
      </div>
    </main>
  );
}
