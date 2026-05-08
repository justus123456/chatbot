"use client";

import { useEffect } from "react";

const STORAGE_KEY = "smartcampus-theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    const savedTheme = window.localStorage.getItem(STORAGE_KEY);
    const systemTheme = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    const theme = savedTheme === "light" || savedTheme === "dark" ? savedTheme : systemTheme;

    root.dataset.theme = theme;
  }, []);

  return <>{children}</>;
}

export function setTheme(theme: "light" | "dark") {
  const root = document.documentElement;
  root.dataset.theme = theme;
  window.localStorage.setItem(STORAGE_KEY, theme);
}

export function getStoredTheme() {
  if (typeof document === "undefined") return "dark";
  return (document.documentElement.dataset.theme as "light" | "dark" | undefined) || "dark";
}
