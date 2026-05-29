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
    if (process.env.NODE_ENV !== "production") {
      // surface in dev consoles
      console.error(error);
    }
  }, [error]);

  return (
    <main className="min-h-screen grid place-items-center px-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">Something went sideways</h1>
        <p className="mt-2 text-muted-foreground max-w-sm">
          We logged it and will take a look. Try again in a moment.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={reset}>Try again</Button>
        </div>
      </div>
    </main>
  );
}
