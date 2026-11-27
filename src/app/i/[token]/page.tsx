import { redirect } from "next/navigation";
import { FirstScreen } from "@/components/auth/first-screen";
import { redirectIfSignedIn } from "@/lib/auth/session";
import { inviteLinkState } from "@/lib/member-access";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 16) redirect("/expired");
  await redirectIfSignedIn();

  const state = await inviteLinkState(token);
  if (state === "ended") redirect("/expired?why=ended");
  if (state === "off") redirect("/expired?why=off");
  if (state !== "open") redirect("/expired");

  return <FirstScreen />;
}
