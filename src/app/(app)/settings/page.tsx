import type { Metadata } from "next";
import { requireSessionUser } from "@/lib/auth/session";
<<<<<<< HEAD
import { SettingsScreen } from "@/components/settings/settings-screen";
=======
import { SettingsScreen } from "@/components/settings-form";
>>>>>>> 5c1d94054047b9a8e141db7699f22c3285dc1d90

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await requireSessionUser();
  return <SettingsScreen me={session.profile} />;
}
