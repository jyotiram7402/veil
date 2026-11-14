import { FirstScreen } from "@/components/auth/first-screen";
import { redirectIfSignedIn } from "@/lib/auth/session";

export default async function RootPage() {
  // Signed-in visitors (for example the installed app opening at "/") go
  // straight to their chats instead of seeing Log in / Sign up.
  await redirectIfSignedIn();
  return <FirstScreen />;
}
