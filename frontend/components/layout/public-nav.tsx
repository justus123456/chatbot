"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, GraduationCap } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";

export function PublicNav() {
  const router = useRouter();

  useEffect(() => {
    ["/", "/login", "/signup"].forEach((href) => router.prefetch(href));
  }, [router]);

  return (
    <header className="fixed left-1/2 top-5 z-30 flex w-[calc(100%-2.5rem)] max-w-6xl -translate-x-1/2 items-center justify-between rounded-full border border-[var(--border-soft)] bg-[var(--panel)] px-4 py-3 text-[var(--text-main)] shadow-glass backdrop-blur-2xl">
      <Link href="/" className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-2xl bg-[var(--accent)] text-[#03110b]">
          <GraduationCap className="size-5" />
        </span>
        <strong>SmartCampus AI</strong>
      </Link>
      <nav className="hidden items-center gap-8 text-sm text-[var(--text-muted)] md:flex">
        <Link href="/#features">Features</Link>
        <Link href="/#how-it-helps">How it helps</Link>
        <Link href="/#faq">FAQ</Link>
      </nav>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Button href="/signup" variant="ghost" className="hidden md:inline-flex">Sign up</Button>
        <Button href="/login" className="bg-[var(--text-main)] text-[var(--bg-main)] hover:bg-[var(--accent)]">Log in <ArrowRight className="size-4" /></Button>
      </div>
    </header>
  );
}
