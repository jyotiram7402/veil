import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import type { Profile } from "@/types/chat";

export type SessionUser = {
  id: string;
  profile: Profile;
};

/**
 * Returns the current user + profile, or null if signed out.
 * Use from Server Components / Route Handlers.
 *
 * Wrapped in React `cache` so the layout and page of the same request share
 * one lookup instead of each doing their own auth + profile round trips.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) return null;
  return { id: user.id, profile };
});

/**
 * For the entry screens (first screen, log in, sign up): a visitor who is
 * already signed in is sent on to the app. The pages do this themselves
 * because the middleware is not active (see CLAUDE.md → Gotchas).
 */
export async function redirectIfSignedIn(): Promise<void> {
  const session = await getSessionUser();
  if (session) redirect(session.profile.is_admin ? "/chats" : "/chat");
}

/** Same as getSessionUser but redirects to /login when signed out. */
export async function requireSessionUser(): Promise<SessionUser> {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  return session;
}
