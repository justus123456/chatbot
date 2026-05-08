"use client";

import { Moon, SunMedium } from "lucide-react";
import { useEffect, useState } from "react";
import { getStoredTheme, setTheme } from "@/components/theme/theme-provider";

export function ThemeToggle() {
  const [theme, setThemeState] = useState<"light" | "dark">("dark");

  useEffect(() => {
    setThemeState(getStoredTheme());
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    setThemeState(nextTheme);
  }

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] bg-[var(--panel-strong)] px-3 py-2 text-sm font-medium text-[var(--text-main)] shadow-[0_10px_35px_rgba(0,0,0,0.08)] backdrop-blur-xl transition hover:scale-[1.02] hover:border-[var(--accent-soft)]"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <SunMedium className="size-4 text-[var(--accent)]" /> : <Moon className="size-4 text-[var(--accent)]" />}
      <span>{isDark ? "Light" : "Dark"}</span>
    </button>
  );
}
