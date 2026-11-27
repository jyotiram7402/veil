import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Link expired" };

const WHY = {
  ended: {
    title: "This invite link has run out",
    text: "Invite links work for 48 hours unless the admin keeps them open longer. Ask the admin to keep yours open, then open it again.",
  },
  off: {
    title: "This invite link is switched off",
    text: "The admin has switched it off for now. Ask them to switch it back on.",
  },
  direct: {
    title: "This direct link has been used",
    text: "A direct link works once, for 48 hours. If you still can't get in, ask the admin for a new one.",
  },
  gone: {
    title: "This link is no longer active",
    text: "It may have been replaced by a new link, or your account may be paused. Ask the admin for a new link.",
  },
};

export default async function ExpiredPage({
  searchParams,
}: {
  searchParams: Promise<{ why?: string }>;
}) {
  const { why } = await searchParams;
  const shown = why === "ended" || why === "off" || why === "direct" ? WHY[why] : WHY.gone;

  return (
    <main className="min-h-[100svh] grid place-items-center px-6 chat-bg">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-rose-500/20 to-amber-500/20 border border-border/60">
          <span className="text-2xl">🔒</span>
        </div>
        <h1 className="text-xl font-semibold">{shown.title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{shown.text}</p>
        <Link
          href="/enter"
          className="mt-6 inline-block rounded-sm text-sm font-semibold underline decoration-2 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Go to User login
        </Link>
      </div>
    </main>
  );
}
