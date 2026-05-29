"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PageHeader({ title, backTo = "/chats" }: { title: string; backTo?: string }) {
  return (
    <header className="flex h-14 items-center gap-2 border-b border-border/60 px-3 md:hidden bg-card/40 backdrop-blur">
      <Button asChild size="icon" variant="ghost" aria-label="Back">
        <Link href={backTo}>
          <ChevronLeft className="h-5 w-5" />
        </Link>
      </Button>
      <h1 className="text-base font-medium">{title}</h1>
    </header>
  );
}
