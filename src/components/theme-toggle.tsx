"use client";

import { useCallback, useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark";
type Accent = "blue" | "yellow";

const STORAGE_KEY = "blackfoxx-theme";
const ACCENT_KEY = "blackfoxx-accent";

function apply(next: Theme) {
  const html = document.documentElement;
  html.classList.toggle("dark", next === "dark");
  html.classList.toggle("light", next === "light");
  html.style.colorScheme = next;
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? null;
    const initial: Theme =
      stored ??
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(initial);
    apply(initial);
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = document.documentElement.classList.contains("dark") ? "light" : "dark";
    localStorage.setItem(STORAGE_KEY, next);
    apply(next);
    setTheme(next);
  }, []);

  return { theme, toggle };
}

function currentAccent(): Accent {
  return document.documentElement.getAttribute("data-accent") === "yellow" ? "yellow" : "blue";
}

export function useAccent() {
  const [accent, setAccent] = useState<Accent | null>(null);

  useEffect(() => {
    setAccent(currentAccent());
  }, []);

  const toggle = useCallback(() => {
    const next: Accent = currentAccent() === "yellow" ? "blue" : "yellow";
    if (next === "yellow") document.documentElement.setAttribute("data-accent", "yellow");
    else document.documentElement.removeAttribute("data-accent");
    try {
      localStorage.setItem(ACCENT_KEY, next);
    } catch {}
    setAccent(next);
  }, []);

  return { accent, toggle };
}

export function AccentMenuItem() {
  const { accent, toggle } = useAccent();
  const next: Accent = accent === "yellow" ? "blue" : "yellow";

  return (
    <DropdownMenuItem className="px-3 py-2.5" onClick={toggle}>
      <span
        aria-hidden
        className={cn(
          "h-4 w-4 shrink-0 rounded-full ring-1 ring-inset ring-foreground/15",
          next === "yellow" ? "bg-[hsl(55_100%_50%)]" : "bg-[hsl(217_100%_52%)]",
        )}
      />
      {next === "yellow" ? "Yellow theme" : "Blue theme"}
    </DropdownMenuItem>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();

  if (!theme) {
    return <span className="h-10 w-10 inline-block" aria-hidden />;
  }

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className={className}
    >
      {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
}
