import { redirect } from "next/navigation";
import { requireSessionUser } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";
import { loadChatsForUser } from "@/lib/queries";
import { AppShell } from "@/components/layout/app-shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSessionUser();
  // This whole route group is admin-only. Non-admins go to /chat.
  if (!session.profile.is_admin) redirect("/chat");

  const supabase = await supabaseServer();
  const initialChats = await loadChatsForUser(supabase, session.id);

  return (
    <AppShell me={session.profile} initialChats={initialChats}>
      {children}
    </AppShell>
  );
}
