"use client";

import { cn } from "@/lib/utils";

type Tone = "neutral" | "danger" | "accept";

const TONES: Record<Tone, string> = {
  neutral: "bg-muted text-foreground group-hover:bg-foreground/10",
  danger: "bg-destructive text-destructive-foreground group-hover:bg-destructive/90",
  accept: "bg-accept text-accept-foreground group-hover:bg-accept/90",
};

export function CallControl({
  label,
  onClick,
  tone = "neutral",
  active,
  disabled,
  large,
  hearing,
  children,
}: {
  label: string;
  onClick: () => void;
  tone?: Tone;
  active?: boolean;
  disabled?: boolean;
  large?: boolean;
  hearing?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "group flex min-w-0 flex-1 basis-0 flex-col items-center gap-1.5 outline-none disabled:pointer-events-none disabled:opacity-40",
        large ? "max-w-24" : "max-w-[4.5rem]",
      )}
    >
      <span
        className={cn(
          "grid place-items-center rounded-full transition-[background-color,box-shadow,transform] duration-150 ease-out group-active:scale-95 group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-card",
          large
            ? "h-16 w-16 [&_svg]:h-7 [&_svg]:w-7"
            : "h-[3.25rem] w-[3.25rem] min-[375px]:h-14 min-[375px]:w-14 [&_svg]:h-6 [&_svg]:w-6",
          active ? "bg-foreground text-background group-hover:bg-foreground/90" : TONES[tone],
          hearing && "ring-2 ring-online ring-offset-2 ring-offset-card",
        )}
      >
        {children}
      </span>
      <span className="max-w-full truncate text-xs font-semibold leading-none text-muted-foreground">
        {label}
      </span>
    </button>
  );
}
