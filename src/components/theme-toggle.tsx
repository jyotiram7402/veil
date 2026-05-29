"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark";

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = (localStorage.getItem("veil-theme") as Theme | null) ?? null;
    const initial: Theme =
      stored ??
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(initial);
    apply(initial);
  }, []);

  function apply(next: Theme) {
    const html = document.documentElement;
    html.classList.toggle("dark", next === "dark");
    html.classList.toggle("light", next === "light");
    html.style.colorScheme = next;
  }

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("veil-theme", next);
    apply(next);
  }

  if (!theme) {
    // Avoid hydration mismatch; render an empty placeholder.
    return <span className="h-9 w-9 inline-block" aria-hidden />;
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
