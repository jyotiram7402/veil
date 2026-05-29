"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";

/**
 * Brief animated intro shown on `/` to unauthenticated visitors. Auto-
 * redirects to /login after ~1.8s, or immediately if the user taps.
 */
export function Splash() {
  const router = useRouter();

  useEffect(() => {
    const id = window.setTimeout(() => router.replace("/login"), 1800);
    return () => window.clearTimeout(id);
  }, [router]);

  return (
    <main
      className="min-h-[100dvh] grid place-items-center chat-bg overflow-hidden cursor-pointer px-6"
      onClick={() => router.replace("/login")}
    >
      <div className="text-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 14 }}
          className="relative mx-auto h-24 w-24 sm:h-28 sm:w-28"
        >
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-3xl bg-primary/30"
            animate={{ scale: [1, 1.25, 1.6], opacity: [0.5, 0.2, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
          />
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-3xl bg-primary/20"
            animate={{ scale: [1, 1.35, 1.8], opacity: [0.35, 0.1, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: 0.4 }}
          />
          <div className="relative h-full w-full grid place-items-center rounded-3xl bg-primary text-primary-foreground shadow-2xl shadow-primary/40">
            <span className="text-4xl font-bold tracking-tight">V</span>
          </div>
        </motion.div>

        <motion.h1
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.4 }}
          className="mt-8 text-3xl font-semibold tracking-tight"
        >
          {APP_NAME}
        </motion.h1>
        <motion.p
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="mt-2 text-sm text-muted-foreground"
        >
          {APP_TAGLINE}
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.0, duration: 0.4 }}
          className="mt-10 inline-flex items-center gap-1.5"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce-dot" />
          <span
            className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce-dot"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce-dot"
            style={{ animationDelay: "300ms" }}
          />
        </motion.div>
      </div>
    </main>
  );
}
