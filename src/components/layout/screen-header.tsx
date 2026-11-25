"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
<<<<<<< HEAD
import { cn } from "@/lib/utils";

// Written out in full so Tailwind sees every class.
const HIDE_BACK = { md: "md:hidden", xl: "xl:hidden" };
const TITLE_FLUSH = { md: "md:px-0", xl: "xl:px-0" };

/**
 * The top of a screen inside the admin's app (Members, Settings): a back
 * button where the screen it goes back to is not already showing beside it,
 * then the title in the weight of the chat home's greeting, then actions.
 */
export function ScreenHeader({
  title,
  subtitle,
  back,
  actions,
  className,
}: {
  title?: string;
  subtitle?: React.ReactNode;
  /** `hideFrom`: the width from which the screen it goes back to shows beside this one. */
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
        {subtitle && (
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2 pt-0.5">{actions}</div>}
=======

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
>>>>>>> 5c1d94054047b9a8e141db7699f22c3285dc1d90
    </header>
  );
}
