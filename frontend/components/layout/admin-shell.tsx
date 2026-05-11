"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpen, CalendarDays, Inbox, LayoutDashboard, Megaphone, MessageCircle, Settings, Users } from "lucide-react";
import { LogoutButton } from "@/components/layout/logout-button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { cn } from "@/lib/utils";

const adminNav = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/post", label: "Announcements", icon: Megaphone },
  { href: "/admin/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/admin/escalations", label: "Escalations", icon: Inbox },
  { href: "/admin/knowledge-base", label: "Knowledge Base", icon: BookOpen },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/whatsapp", label: "WhatsApp", icon: MessageCircle },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useCurrentUser();
  const displayName = user?.name?.trim() || "Staff";
  const isDean = user?.role === "dean";
  const nav = isDean ? [{ href: "/dean", label: "Dean Overview", icon: BarChart3 }, ...adminNav] : adminNav;

  return (
    <div className="min-h-screen app-surface">
      <div className="app-bg fixed inset-0 -z-10" />
      <div className="grid min-h-screen lg:grid-cols-[300px_1fr]">
        <aside className="hidden border-r border-[var(--border-soft)] bg-[var(--panel)] p-5 backdrop-blur-xl lg:block">
          <Link href={isDean ? "/dean" : "/admin"} className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-[var(--accent)] text-[#03110b]">
              <BarChart3 className="size-5" />
            </span>
            <div>
              <strong>{isDean ? "SmartCampus Dean" : "SmartCampus Admin"}</strong>
              <p className="text-xs capitalize text-[var(--text-soft)]">{user?.role || "staff"} workspace</p>
            </div>
          </Link>

          <nav className="mt-8 space-y-1">
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
          </nav>

          <div className="mt-8 rounded-3xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-soft)]">Student app</p>
            <Link href="/chat" className="mt-3 inline-flex items-center gap-2 text-sm text-[var(--accent)]">
              Open student tools
            </Link>
          </div>
        </aside>

        <main className="min-w-0 p-4 md:p-8">
          <header className="mb-8 flex flex-col gap-4 rounded-3xl border border-[var(--border-soft)] bg-[var(--panel)] px-5 py-4 backdrop-blur-xl md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-[var(--accent)]">Admin workspace</p>
              <h1 className="mt-1 text-xl font-semibold">{displayName}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/settings" className="inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] px-4 py-2 text-sm text-[var(--text-main)] transition hover:border-[var(--accent-soft)] hover:text-[var(--accent)]">
                <Settings className="size-4" />
                Settings
              </Link>
              <ThemeToggle />
              <LogoutButton />
              <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs capitalize text-[var(--accent)]">{user?.role || "staff"}</span>
            </div>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
