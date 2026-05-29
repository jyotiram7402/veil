"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { env } from "@/lib/env";

let cached: ReturnType<typeof createBrowserClient<Database>> | null = null;

/** Browser-side Supabase client. Shares a single instance per tab. */
export function supabaseBrowser() {
  if (cached) return cached;
  cached = createBrowserClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  return cached;
}
