"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import {
  Bell,
  Calendar,
  Flag,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Shield,
  ShieldCheck,
  Target,
} from "lucide-react";
import { LogoutButton } from "@/components/layout/logout-button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { canAccessAdmin, canAccessDean, canAccessLecturer } from "@/lib/roles";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageSquare },
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const showAdmin = canAccessAdmin(user?.role);
  const showLecturer = canAccessLecturer(user?.role);
  const showDean = canAccessDean(user?.role);

  useEffect(() => {
    [...nav.map((item) => item.href), ...(showAdmin ? ["/admin"] : []), ...(showLecturer ? ["/lecturer"] : []), ...(showDean ? ["/dean"] : [])].forEach((href) => router.prefetch(href));
  }, [router, showAdmin, showDean, showLecturer]);

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
      {!sidebarOpen ? (
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="fixed left-4 top-24 z-40 hidden size-11 place-items-center rounded-full border border-[var(--border-soft)] bg-[var(--panel)] text-[var(--text-main)] shadow-glass backdrop-blur-xl transition hover:border-[var(--accent-soft)] hover:text-[var(--accent)] lg:grid"
          aria-label="Open sidebar"
          title="Open sidebar"
        >
          <PanelLeftOpen className="size-5" />
        </button>
      ) : null}
      <div className={cn("grid min-h-screen transition-[grid-template-columns] duration-300", sidebarOpen ? "lg:grid-cols-[280px_1fr]" : "lg:grid-cols-[0_1fr]")}>
        <aside className={cn("hidden overflow-hidden border-r border-[var(--border-soft)] bg-[var(--panel)] p-5 backdrop-blur-xl lg:block", !sidebarOpen && "border-r-0 p-0")}>
          <div className="mb-8 flex items-center justify-between gap-3">
            <Link href="/" className="flex min-w-0 items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[var(--accent)] text-lg font-black text-[#03110b]">S</span>
              <div className="min-w-0">
                <strong>SmartCampus</strong>
                <p className="text-xs app-soft">AI System</p>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--border-soft)] bg-[var(--panel-strong)] text-[var(--text-main)] transition hover:border-[var(--accent-soft)] hover:text-[var(--accent)]"
              aria-label="Close sidebar"
              title="Close sidebar"
            >
              <PanelLeftClose className="size-4" />
            </button>
          </div>
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
            {showAdmin ? (
              <Link
                href="/admin"
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-3 py-3 text-sm transition",
                  pathname.startsWith("/admin") && "bg-[var(--accent-soft)] text-[var(--accent)] shadow-[inset_0_0_0_1px_var(--accent-soft)]",
                  !pathname.startsWith("/admin") && "text-[var(--text-muted)] hover:bg-[var(--panel-strong)] hover:text-[var(--text-main)]",
                )}
              >
                <Shield className="size-4" />
                Admin
              </Link>
            ) : null}
            {showLecturer ? (
              <Link
                href="/lecturer"
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-3 py-3 text-sm transition",
                  pathname.startsWith("/lecturer") && "bg-[var(--accent-soft)] text-[var(--accent)] shadow-[inset_0_0_0_1px_var(--accent-soft)]",
                  !pathname.startsWith("/lecturer") && "text-[var(--text-muted)] hover:bg-[var(--panel-strong)] hover:text-[var(--text-main)]",
                )}
              >
                <Shield className="size-4" />
                Lecturer
              </Link>
            ) : null}
            {showDean ? (
              <Link
                href="/dean"
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-3 py-3 text-sm transition",
                  pathname.startsWith("/dean") && "bg-[var(--accent-soft)] text-[var(--accent)] shadow-[inset_0_0_0_1px_var(--accent-soft)]",
                  !pathname.startsWith("/dean") && "text-[var(--text-muted)] hover:bg-[var(--panel-strong)] hover:text-[var(--text-main)]",
                )}
              >
                <ShieldCheck className="size-4" />
                Dean
              </Link>
            ) : null}
          </nav>
        </aside>
        <main className="p-4 md:p-8">
          <header className="mb-8 flex items-center justify-between rounded-full border border-[var(--border-soft)] bg-[var(--panel)] px-5 py-3 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen((current) => !current)}
                className="hidden size-10 place-items-center rounded-full border border-[var(--border-soft)] bg-[var(--panel-strong)] text-[var(--text-main)] transition hover:border-[var(--accent-soft)] hover:text-[var(--accent)] lg:grid"
                aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
                title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
              >
                {sidebarOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
              </button>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-[var(--accent)]">{greeting}</p>
                <h1 className="text-lg font-semibold">{displayName}</h1>
              </div>
            </div>
            <div className="hidden items-center gap-3 md:flex">
              <ThemeToggle />
              <LogoutButton />
              {user?.department && user?.level ? (
                <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs text-[var(--accent)]">
                  {user.department} {user.level}L
                </span>
              ) : null}
              {user?.role && user.role !== "student" ? (
                <span className="rounded-full border border-[var(--border-soft)] px-3 py-1 text-xs capitalize text-[var(--text-muted)]">
                  {user.role}
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
