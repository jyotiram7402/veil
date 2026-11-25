"use client";

import { useEffect, useId, useRef } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const GROUP_FIELD =
  "h-12 rounded-xl border-transparent bg-muted px-4 shadow-none focus-visible:ring-offset-0";

export function Group({
  title,
  footer,
  children,
  className,
}: {
  title?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section aria-labelledby={title ? id : undefined} className={cn("space-y-2", className)}>
      {title && (
        <h2 id={id} className="px-1 text-[15px] font-bold">
          {title}
        </h2>
      )}
      <div className="overflow-hidden rounded-2xl bg-card shadow-[0_1px_2px_hsl(228_20%_9%/0.04),0_8px_20px_-12px_hsl(228_20%_9%/0.14)] dark:shadow-none dark:ring-1 dark:ring-border">
        {children}
      </div>
      {footer && (
        <p className="px-1 text-[13px] leading-relaxed text-muted-foreground">{footer}</p>
      )}
    </section>
  );
}

function RowIcon({ icon: Icon, destructive }: { icon: LucideIcon; destructive?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center rounded-full",
        destructive ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground",
      )}
    >
      <Icon className="h-[18px] w-[18px]" />
    </span>
  );
}

function RowText({
  title,
  description,
  destructive,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div
        className={cn(
          "text-[15px] font-semibold leading-snug",
          destructive && "text-destructive",
        )}
      >
        {title}
      </div>
      {description && (
        <div className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{description}</div>
      )}
    </div>
  );
}

const ROW = "flex min-h-[3.75rem] w-full items-center gap-3 px-4 py-3 text-left";
const DIVIDED = "border-t border-border/70 first:border-t-0";

export function GroupRow({
  icon,
  title,
  description,
  trailing,
  destructive,
  children,
}: {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  trailing?: React.ReactNode;
  destructive?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={DIVIDED}>
      <div className={ROW}>
        {icon && <RowIcon icon={icon} destructive={destructive} />}
        <RowText title={title} description={description} destructive={destructive} />
        {trailing}
      </div>
      {children}
    </div>
  );
}

export function GroupButtonRow({
  icon,
  title,
  description,
  destructive,
  disabled,
  onClick,
  trailing,
}: {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  onClick: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <div className={DIVIDED}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          ROW,
          "transition-colors hover:bg-muted/60 active:bg-muted",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          "disabled:pointer-events-none disabled:opacity-50",
        )}
      >
        {icon && <RowIcon icon={icon} destructive={destructive} />}
        <RowText title={title} description={description} destructive={destructive} />
        {trailing}
      </button>
    </div>
  );
}

export function GroupDisclosureRow({
  icon,
  title,
  description,
  open,
  onOpenChange,
  children,
}: {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open && document.activeElement === document.body) {
      buttonRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);
  return (
    <div className={DIVIDED}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onOpenChange(!open)}
        className={cn(
          ROW,
          "transition-colors hover:bg-muted/60 active:bg-muted",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        )}
      >
        {icon && <RowIcon icon={icon} />}
        <RowText title={title} description={description} />
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div id={panelId} className="px-4 pb-4 pt-1">
          {children}
        </div>
      )}
    </div>
  );
}
