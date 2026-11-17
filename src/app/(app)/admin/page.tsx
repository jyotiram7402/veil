import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSessionUser } from "@/lib/auth/session";
import { AdminScreen } from "@/components/admin/admin-screen";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const session = await requireSessionUser();
  if (!session.profile.is_admin) notFound();

  return <AdminScreen />;
}
