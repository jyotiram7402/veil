import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { Splash } from "@/components/splash";

export default async function RootPage() {
  const session = await getSessionUser();
  if (session) {
    redirect(session.profile.is_admin ? "/chats" : "/chat");
  }
  return <Splash />;
}
