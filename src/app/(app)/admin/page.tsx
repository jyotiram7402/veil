import type { Metadata } from "next";
<<<<<<< HEAD
import { MemberPlaceholder } from "@/components/members/members-shell";
=======
import { notFound } from "next/navigation";
import { requireSessionUser } from "@/lib/auth/session";
import { AdminScreen } from "@/components/admin/admin-screen";
>>>>>>> 5c1d94054047b9a8e141db7699f22c3285dc1d90

export const metadata: Metadata = { title: "Members" };

<<<<<<< HEAD
/** /admin: the list (from the layout); from 1280px wide this fills the space beside it. */
export default function MembersPage() {
  return <MemberPlaceholder />;
=======
export default async function AdminPage() {
  const session = await requireSessionUser();
  if (!session.profile.is_admin) notFound();

  return <AdminScreen />;
>>>>>>> 5c1d94054047b9a8e141db7699f22c3285dc1d90
}
