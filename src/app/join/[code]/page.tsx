import type { Metadata } from "next";
import { JoinForm } from "@/components/rooms/join-form";

export const metadata: Metadata = {
  title: "Join a room",
  robots: { index: false, follow: false },
  // The access code is in the URL path; never leak it via the Referer header.
  referrer: "no-referrer",
};

export default async function JoinWithCodePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const decoded = (() => {
    try {
      return decodeURIComponent(code);
    } catch {
      return code;
    }
  })();

  return (
    <main className="grid min-h-[100dvh] place-items-center px-4 py-10">
      <JoinForm initialCode={decoded} />
    </main>
  );
}
