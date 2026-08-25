import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSessionUser } from "@/lib/auth/session";
import { RoomsAdmin } from "@/components/rooms/rooms-admin";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Rooms" };

export default async function RoomsPage() {
  const session = await requireSessionUser();
  if (!session.profile.is_admin) notFound();

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <PageHeader title="Rooms" />
      <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-8 sm:py-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-semibold tracking-tight hidden md:block">Rooms</h1>
          <p className="text-sm text-muted-foreground mt-1 hidden md:block">
            Create secure rooms and invite people with temporary access codes.
          </p>
          <div className="md:mt-8">
            <RoomsAdmin />
          </div>
        </div>
      </div>
    </div>
  );
}
