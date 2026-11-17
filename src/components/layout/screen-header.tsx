"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ScreenHeader({
  title,
  backTo = "/chats",
  children,
}: {
  title: string;
  backTo?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-1 border-b border-border/70 bg-header px-2 text-header-foreground sm:px-4">
      <Button
        asChild
        size="icon"
        variant="ghost"
        className="md:hidden [&_svg]:size-5"
        aria-label="Back to chats"
      >
        <Link href={backTo}>
          <ChevronLeft />
        </Link>
      </Button>
      <h1 className="min-w-0 flex-1 truncate pl-1 text-[1.0625rem] font-bold leading-tight md:pl-2">
        {title}
      </h1>
      {children}
    </header>
  );
}
