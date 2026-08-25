import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSessionUser } from "@/lib/auth/session";
import { assertRoomAdmin } from "@/lib/rooms";
import { RoomManage } from "@/components/rooms/room-manage";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Manage room" };
export const dynamic = "force-dynamic";

export default async function RoomManagePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionUser();
  if (!session.profile.is_admin) notFound();

  const { id } = await params;
  const room = await assertRoomAdmin(id, session.id, true);
  if (!room) notFound();

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <PageHeader title="Manage room" backTo="/rooms" />
      <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-8 sm:py-6">
        <div className="max-w-2xl mx-auto">
          <RoomManage roomId={id} />
        </div>
      </div>
    </div>
  );
}
