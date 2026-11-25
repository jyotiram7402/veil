"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { env } from "@/lib/env";

let cached: SupabaseClient<Database> | null = null;

export function supabaseBrowser(): SupabaseClient<Database> {
  if (cached) return cached;
  cached = createBrowserClient<Database>(
    env.SUPABASE_URL,
    env.SUPABASE_ANON_KEY,
  ) as unknown as SupabaseClient<Database>;
  return cached;
}
