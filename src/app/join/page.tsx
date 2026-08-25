import type { Metadata } from "next";
import { JoinForm } from "@/components/rooms/join-form";

export const metadata: Metadata = {
  title: "Join a room",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function JoinPage() {
  return (
    <main className="grid min-h-[100dvh] place-items-center px-4 py-10">
      <JoinForm />
    </main>
  );
}
