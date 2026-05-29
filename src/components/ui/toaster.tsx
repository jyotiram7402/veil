"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      richColors
      closeButton
      theme="dark"
      toastOptions={{
        classNames: {
          toast: "border border-border/60 bg-card text-foreground",
          description: "text-muted-foreground",
        },
      }}
    />
  );
}
