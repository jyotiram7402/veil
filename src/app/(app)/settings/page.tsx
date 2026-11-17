import type { Metadata } from "next";
import { requireSessionUser } from "@/lib/auth/session";
import { SettingsScreen } from "@/components/settings-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await requireSessionUser();
  return <SettingsScreen me={session.profile} />;
}
