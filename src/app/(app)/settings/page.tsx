import type { Metadata } from "next";
import { requireSessionUser } from "@/lib/auth/session";
import { SettingsForm } from "@/components/settings-form";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await requireSessionUser();
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <PageHeader title="Settings" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-semibold tracking-tight hidden md:block">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1 hidden md:block">
            Your profile, the way other people see you.
          </p>
          <div className="md:mt-8">
            <SettingsForm me={session.profile} />
          </div>
        </div>
      </div>
    </div>
  );
}
