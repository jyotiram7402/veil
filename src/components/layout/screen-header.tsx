"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const HIDE_BACK = { md: "md:hidden", xl: "xl:hidden" };
const TITLE_FLUSH = { md: "md:px-0", xl: "xl:px-0" };

export function ScreenHeader({
  title,
  subtitle,
  back,
  actions,
  className,
}: {
  title?: string;
  subtitle?: React.ReactNode;
  back?: { href: string; label: string; hideFrom: "md" | "xl" };
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex shrink-0 items-start gap-1 px-3 pb-4 pt-5 sm:px-5", className)}>
      {back && (
        <Button
          asChild
          size="icon"
          variant="ghost"
          className={cn("shrink-0 [&_svg]:size-6", HIDE_BACK[back.hideFrom])}
        >
          <Link href={back.href} aria-label={back.label}>
            <ChevronLeft />
          </Link>
        </Button>
      )}
      <div
        className={cn(
          "min-w-0 flex-1",
          back ? cn("px-2", TITLE_FLUSH[back.hideFrom]) : "px-2 sm:px-0",
        )}
      >
        {title && (
          <h1 className="truncate text-[1.625rem] font-extrabold leading-tight tracking-tight">
            {title}
          </h1>
        )}
        {subtitle && <p className="mt-0.5 truncate text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2 pt-0.5">{actions}</div>}
    </header>
  );
}
