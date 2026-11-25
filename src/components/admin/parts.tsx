"use client";

import { useId } from "react";
import { ChevronDown } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PANEL, SELECT } from "@/components/form-styles";
import { cn } from "@/lib/utils";

export function dateText(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function Chip({
  tone = "quiet",
  children,
}: {
  tone?: "brand" | "good" | "warn" | "quiet";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold [&_svg]:size-3.5",
        tone === "brand" && "bg-accent text-accent-foreground",
        tone === "good" && "bg-online/15 text-online-ink",
        tone === "warn" && "bg-destructive/10 text-destructive",
        tone === "quiet" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className={cn(PANEL, "px-6 py-10 text-center")}>
      <p className="text-base font-bold">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{children}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function LoadError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
      {children}
    </p>
  );
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul aria-hidden="true" className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className={cn(PANEL, "flex items-center gap-3 p-4")}>
          <span className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-muted" />
          <span className="min-w-0 flex-1 space-y-2">
            <span className="block h-3.5 w-2/5 animate-pulse rounded-full bg-muted" />
            <span className="block h-3 w-3/5 animate-pulse rounded-full bg-muted" />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ToggleRow({
  title,
  description,
  note,
  value,
  onChange,
  disabled,
  after,
}: {
  title: string;
  description?: string;
  note?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  after?: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block cursor-pointer">
          <span id={`${id}-title`} className="block text-[15px] font-semibold leading-snug">
            {title}
          </span>
          {description && (
            <span
              id={`${id}-desc`}
              className="mt-0.5 block text-[13px] leading-snug text-muted-foreground"
            >
              {description}
            </span>
          )}
        </label>
        {(note || after) && (
          <div className="mt-0.5 flex min-h-7 flex-wrap items-center gap-x-1">
            {note && <span className="text-xs font-medium text-muted-foreground">{note}</span>}
            {after}
          </div>
        )}
      </div>
      <Switch
        id={id}
        checked={value}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-labelledby={`${id}-title`}
        aria-describedby={description ? `${id}-desc` : undefined}
      />
    </div>
  );
}

export function SelectField({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cn("relative", className)}>
      <select className={SELECT} {...props}>
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  );
}

export function SheetDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onSubmit?: () => void;
}) {
  const body = (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-5">{children}</div>
      {footer && <div className="flex gap-2 border-t border-border/70 px-6 py-4">{footer}</div>}
    </>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(44rem,calc(100dvh-1.5rem))] w-[calc(100%-1.5rem)] max-w-md flex-col gap-0 overflow-hidden rounded-[1.75rem] p-0">
        <DialogHeader className="px-6 pb-4 pr-12 pt-7">
          <DialogTitle className="text-xl font-extrabold leading-tight tracking-tight">
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {onSubmit ? (
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
          >
            {body}
          </form>
        ) : (
          body
        )}
      </DialogContent>
    </Dialog>
  );
}

export const DISAPPEARING_WARNING =
  "Turn on disappearing messages?\n\n" +
  "A message will be deleted for both people once the person it was sent to has read it and " +
  "leaves the chat. Messages that were read before now go too, the next time each person " +
  "leaves.\n\n" +
  "Deleted messages, photos and files cannot be brought back, not even by you.";
