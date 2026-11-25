import type { Metadata } from "next";
import { MemberPlaceholder } from "@/components/members/members-shell";

export const metadata: Metadata = { title: "Members" };

export default function MembersPage() {
  return <MemberPlaceholder />;
}
