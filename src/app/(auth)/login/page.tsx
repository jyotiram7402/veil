import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="min-h-screen grid place-items-center px-6 chat-bg">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/20">
            <span className="text-white font-semibold text-lg">R</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{APP_TAGLINE}</p>
        </div>

        <div className="glass rounded-2xl p-6">
          <LoginForm nextPath={next} />
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Invite only. Ask an admin to create an account for you.
        </p>
      </div>
    </main>
  );
}
