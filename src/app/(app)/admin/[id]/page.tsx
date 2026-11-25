import type { Metadata } from "next";
import { MemberScreen } from "@/components/members/member-screen";

export const metadata: Metadata = { title: "Members" };

/** One person in Members. Their data comes from the list the layout loaded. */
export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MemberScreen id={id} />;
}
