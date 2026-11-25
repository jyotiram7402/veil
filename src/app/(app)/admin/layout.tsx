import { notFound } from "next/navigation";
import { requireSessionUser } from "@/lib/auth/session";
import { MembersShell } from "@/components/members/members-shell";

export default async function MembersLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSessionUser();
  if (!session.profile.is_admin) notFound();

  return <MembersShell>{children}</MembersShell>;
}
