import type { Metadata } from "next";
import { MemberPlaceholder } from "@/components/members/members-shell";

export const metadata: Metadata = { title: "Members" };

/** /admin: the list (from the layout); from 1280px wide this fills the space beside it. */
export default function MembersPage() {
  return <MemberPlaceholder />;
}
