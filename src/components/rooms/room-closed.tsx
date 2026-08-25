"use client";

import { useRouter } from "next/navigation";
import { DoorClosed } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Terminal state shown when a room has ended, expired, or access was removed. */
export function RoomClosed({ title, message }: { title: string; message: string }) {
  const router = useRouter();

  async function leave() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/join");
  }

  return (
    <main className="grid min-h-[100dvh] place-items-center px-4 text-center">
      <div className="max-w-sm">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <DoorClosed className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        <Button className="mt-6" variant="outline" onClick={leave}>
          Leave
        </Button>
      </div>
    </main>
  );
}
