"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Always log — in production this is the only place the real message shows.
    console.error(error);
  }, [error]);

  // In production Next.js already strips server-side messages (leaving only an
  // opaque digest), so what's shown here is either that digest or a client-side
  // message the browser could already see in devtools. Nothing sensitive leaks.
  const detail = error.digest ? `Ref: ${error.digest}` : error.message;

  return (
    <main className="min-h-[100svh] grid place-items-center px-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">Something went sideways</h1>
        <p className="mt-2 text-muted-foreground max-w-sm">
          Please try again. If it keeps happening, send us the reference below.
        </p>
        {detail && (
          <p className="mx-auto mt-4 max-w-sm break-words rounded-md bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
            {detail.slice(0, 300)}
          </p>
        )}
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={reset}>Try again</Button>
        </div>
      </div>
    </main>
  );
}
