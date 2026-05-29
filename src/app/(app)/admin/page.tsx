import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSessionUser } from "@/lib/auth/session";
import { AdminPanel } from "@/components/admin-panel";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const session = await requireSessionUser();
  if (!session.profile.is_admin) notFound();

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <PageHeader title="Members" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-semibold tracking-tight hidden md:block">Members</h1>
          <p className="text-sm text-muted-foreground mt-1 hidden md:block">
            Create accounts for people you want to talk to.
          </p>
          <div className="md:mt-8">
            <AdminPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
