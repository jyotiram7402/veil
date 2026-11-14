import { FirstScreen } from "@/components/auth/first-screen";

// Static on purpose: signed-in visitors never reach this page (the middleware
// sends them straight to their chats), so it needs no session lookup and can
// be served from the edge cache.
export default function RootPage() {
  return <FirstScreen />;
}
