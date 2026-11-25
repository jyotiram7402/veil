"use client";

import { usePathname } from "next/navigation";
import { Users } from "lucide-react";
import { MembersProvider } from "@/components/members/members-provider";
import { MemberList } from "@/components/members/member-list";
import { cn } from "@/lib/utils";

export function MembersShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const selectedId = /^\/admin\/([^/]+)/.exec(pathname ?? "")?.[1] ?? null;

  return (
    <MembersProvider>
      <div className="flex min-h-0 flex-1">
        <div
          className={cn(
            "min-h-0 w-full flex-col bg-card xl:flex xl:w-[360px] xl:shrink-0 xl:border-r xl:border-border 2xl:w-[400px]",
            selectedId ? "hidden" : "flex",
          )}
        >
          <MemberList selectedId={selectedId} />
        </div>
        <div className={cn("min-h-0 min-w-0 flex-1 flex-col", selectedId ? "flex" : "hidden xl:flex")}>
          {children}
        </div>
      </div>
    </MembersProvider>
  );
}

export function MemberPlaceholder() {
  return (
    <div className="grid flex-1 place-items-center p-8 text-center">
      <div>
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-card shadow-[0_1px_2px_hsl(228_20%_9%/0.04),0_8px_20px_-12px_hsl(228_20%_9%/0.14)] dark:shadow-none dark:ring-1 dark:ring-border">
          <Users className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="mt-4 text-base font-bold">Open someone</p>
        <p className="mx-auto mt-1 max-w-[16rem] text-sm text-muted-foreground">
          Their link, password and chat rules are on their page.
        </p>
      </div>
    </div>
  );
}
