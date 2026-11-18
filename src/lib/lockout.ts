import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { forgetAllDevices } from "@/lib/push";

const BAN_FOREVER = "876000h";

function unusablePassword(): string {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/=+$/, "");
}

export async function lockOut(userId: string): Promise<void> {
  await Promise.all([
    supabaseAdmin()
      .auth.admin.updateUserById(userId, { password: unusablePassword(), ban_duration: BAN_FOREVER })
      .catch(() => undefined),
    forgetAllDevices(userId).catch(() => undefined),
  ]);
}

export async function letBackIn(userId: string): Promise<boolean> {
  const { error } = await supabaseAdmin()
    .auth.admin.updateUserById(userId, { ban_duration: "none" })
    .catch(() => ({ error: true }));
  return !error;
}
