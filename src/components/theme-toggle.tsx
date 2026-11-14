"use client";

import { useCallback, useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark";

const STORAGE_KEY = "blackfoxx-theme";

function apply(next: Theme) {
  const html = document.documentElement;
  html.classList.toggle("dark", next === "dark");
  html.classList.toggle("light", next === "light");
  html.style.colorScheme = next;
}

/**
 * Current theme and a function to flip it. `theme` is null until the browser
 * has told us what is active (so server and first client render match).
 */
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
    // Read what is on the page rather than our state, so two toggles on the
    // same screen (a button and a menu item) never disagree.
    const next: Theme = document.documentElement.classList.contains("dark") ? "light" : "dark";
    localStorage.setItem(STORAGE_KEY, next);
    apply(next);
    setTheme(next);
  }, []);

  return { theme, toggle };
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();

  if (!theme) {
    // Avoid hydration mismatch; render an empty placeholder.
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
