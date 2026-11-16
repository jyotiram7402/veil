import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AuthShell } from "@/components/auth/auth-shell";
import { GateForm } from "@/components/gate-form";

export const dynamic = "force-dynamic";

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
    <AuthShell backHref={null}>
      <GateForm
        token={token}
        userId={row.user_id}
        displayName={profile.display_name ?? profile.username}
        username={profile.username}
        avatarUrl={profile.avatar_url}
        error={error}
      />
    </AuthShell>
  );
}
