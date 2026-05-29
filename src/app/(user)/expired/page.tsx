import type { Metadata } from "next";

export const metadata: Metadata = { title: "Link expired" };

export default function ExpiredPage() {
  return (
    <main className="min-h-screen grid place-items-center px-6 chat-bg">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-rose-500/20 to-amber-500/20 border border-border/60">
          <span className="text-2xl">🔒</span>
        </div>
        <h1 className="text-xl font-semibold">This link is no longer active</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Your invite may have been disabled, your account suspended, or the
          link revoked. Reach out to the person who invited you for a new link.
        </p>
      </div>
    </main>
  );
}
