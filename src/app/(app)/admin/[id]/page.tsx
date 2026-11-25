import type { Metadata } from "next";
import { MemberScreen } from "@/components/members/member-screen";

export const metadata: Metadata = { title: "Members" };

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MemberScreen id={id} />;
}
