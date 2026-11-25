import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import type { Profile } from "@/types/chat";

export type SessionUser = {
  id: string;
  profile: Profile;
};

const getAuth = cache(async () => {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
});

export async function getAuthUserId(): Promise<string | null> {
  return (await getAuth()).userId;
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const { supabase, userId } = await getAuth();
  if (!userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (!profile) return null;
  return { id: userId, profile };
});

export async function redirectIfSignedIn(): Promise<void> {
  const session = await getSessionUser();
  if (session) redirect(session.profile.is_admin ? "/chats" : "/chat");
}

export async function requireSessionUser(): Promise<SessionUser> {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  return session;
}
