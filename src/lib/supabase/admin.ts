import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { env, requireServerEnv } from "@/lib/env";

export function supabaseAdmin() {
  const { SUPABASE_SERVICE_ROLE_KEY } = requireServerEnv();
  return createClient<Database>(env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
