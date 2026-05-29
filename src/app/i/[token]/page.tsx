import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { GateForm } from "@/components/gate-form";

export const dynamic = "force-dynamic";

/**
 * Invite-link landing. Validates the token (admin client, bypasses RLS),
 * checks the user is active, and renders the password gate. Submission
 * goes to /api/i/[token] which mints the session on success.
 */
export default async function InviteGatePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;

  if (!token || token.length < 16) redirect("/expired");

  const admin = supabaseAdmin();
  const { data: row } = await admin
    .from("invite_tokens")
    .select("token, user_id, enabled, revoked_at")
    .eq("token", token)
    .maybeSingle();

  if (!row || !row.enabled || row.revoked_at) redirect("/expired");

  const { data: profile } = await admin
    .from("profiles")
    .select("username, display_name, avatar_url, suspended, archived, is_admin")
    .eq("id", row.user_id)
    .maybeSingle();

  if (!profile || profile.suspended || profile.archived) redirect("/expired");
  if (profile.is_admin) redirect("/login");

  return (
    <main className="min-h-screen grid place-items-center px-6 chat-bg">
      <GateForm
        token={token}
        displayName={profile.display_name ?? profile.username}
        username={profile.username}
        avatarUrl={profile.avatar_url}
        error={error}
      />
    </main>
  );
}
