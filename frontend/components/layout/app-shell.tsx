"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import {
  Bell,
  BookOpen,
  Bot,
  Calendar,
  Flag,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  Settings,
  Shield,
  Target,
} from "lucide-react";
import { LogoutButton } from "@/components/layout/logout-button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/flashcards", label: "Flashcards", icon: Bot },
  { href: "/notes", label: "Notes", icon: BookOpen },
  { href: "/planner", label: "Planner", icon: Flag },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/campus-map", label: "Campus Map", icon: MapPin },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useCurrentUser();

  useEffect(() => {
    [...nav.map((item) => item.href), "/admin"].forEach((href) => router.prefetch(href));
  }, [router]);

  const displayName = user?.name?.trim() || "Student";
  const greeting = getGreeting();
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "ST";

  return (
    <div className="min-h-screen app-surface">
      <div className="app-bg fixed inset-0 -z-10" />
      <div className="grid min-h-screen lg:grid-cols-[280px_1fr]">
        <aside className="hidden border-r border-[var(--border-soft)] bg-[var(--panel)] p-5 backdrop-blur-xl lg:block">
          <Link href="/" className="mb-8 flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-2xl bg-[var(--accent)] text-lg font-black text-[#03110b]">S</span>
            <div>
              <strong>SmartCampus</strong>
              <p className="text-xs app-soft">AI System</p>
            </div>
          </Link>
          <nav className="space-y-1">
            {nav.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-3 py-3 text-sm transition",
                    active && "bg-[var(--accent-soft)] text-[var(--accent)] shadow-[inset_0_0_0_1px_var(--accent-soft)]",
                    !active && "text-[var(--text-muted)] hover:bg-[var(--panel-strong)] hover:text-[var(--text-main)]",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
            <Link href="/admin" className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm text-[var(--text-muted)] hover:bg-[var(--panel-strong)] hover:text-[var(--text-main)]">
              <Shield className="size-4" />
              Admin
            </Link>
          </nav>
        </aside>
        <main className="p-4 md:p-8">
          <header className="mb-8 flex items-center justify-between rounded-full border border-[var(--border-soft)] bg-[var(--panel)] px-5 py-3 backdrop-blur-xl">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-[var(--accent)]">{greeting}</p>
              <h1 className="text-lg font-semibold">{displayName}</h1>
            </div>
            <div className="hidden items-center gap-3 md:flex">
              <ThemeToggle />
              <LogoutButton />
              {user?.department && user?.level ? (
                <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs text-[var(--accent)]">
                  {user.department} {user.level}L
                </span>
              ) : null}
              <span className="grid size-10 place-items-center rounded-full bg-[var(--panel-strong)] text-sm font-bold">{initials}</span>
            </div>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}

function getGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
