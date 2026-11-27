import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { DirectSignIn } from "@/components/auth/direct-sign-in";
import { redirectIfSignedIn } from "@/lib/auth/session";
import { directLinkMember } from "@/lib/member-access";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your hashcode", referrer: "no-referrer" };

export default async function DirectLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 16) redirect("/expired?why=direct");
  await redirectIfSignedIn();

  const member = await directLinkMember(token);
  if (!member) redirect("/expired?why=direct");

  return (
    <AuthShell backHref={null}>
      <DirectSignIn
        token={token}
        userId={member.id}
        username={member.username}
        displayName={member.display_name}
        avatarUrl={member.avatar_url}
      />
    </AuthShell>
  );
}
