"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * The "longest message" number, saved when the field is left (or on Enter).
 * Uncontrolled: give it a `key` that changes with the saved value, so a value
 * the app held to its limits shows as it was saved.
 */
export function LengthInput({
  defaultValue,
  placeholder,
  label,
  onCommit,
}: {
  defaultValue: string;
  placeholder?: string;
  label: string;
  onCommit: (raw: string) => void;
}) {
  const id = useId();
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        defaultValue={defaultValue}
        placeholder={placeholder}
        onBlur={(e) => {
          if (e.currentTarget.value !== defaultValue) onCommit(e.currentTarget.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className={cn(
          "h-10 w-24 shrink-0 rounded-xl border-transparent bg-muted px-3 text-right text-base tabular-nums sm:text-sm",
          "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      />
    </>
  );
}
