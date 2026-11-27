import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { usernameToInternalEmail } from "@/lib/auth/username";
import { generateEphemeralPassword } from "@/lib/invite-token";

export async function signInMember(member: { id: string; username: string }): Promise<boolean> {
  const ephemeral = generateEphemeralPassword();
  const updated = await supabaseAdmin().auth.admin.updateUserById(member.id, {
    password: ephemeral,
  });
  if (updated.error) return false;
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({
    email: usernameToInternalEmail(member.username),
    password: ephemeral,
  });
  return !error;
}
