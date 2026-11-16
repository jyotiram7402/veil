import { redirect } from "next/navigation";
import { getAuthUserId, requireSessionUser } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";
import { loadChatsForUser } from "@/lib/queries";
import { AppShell } from "@/components/layout/app-shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const userId = await getAuthUserId();
  if (!userId) redirect("/login");

  const supabase = await supabaseServer();
  const [session, initialChats] = await Promise.all([
    requireSessionUser(),
    loadChatsForUser(supabase, userId),
  ]);
  if (!session.profile.is_admin) redirect("/chat");

  return (
    <AppShell me={session.profile} initialChats={initialChats}>
      {children}
    </AppShell>
  );
}
