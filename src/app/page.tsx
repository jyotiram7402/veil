import { FirstScreen } from "@/components/auth/first-screen";
import { redirectIfSignedIn } from "@/lib/auth/session";

export default async function RootPage() {
  await redirectIfSignedIn();
  return <FirstScreen />;
}
