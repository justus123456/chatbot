"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getAdminOverview, getDeanOversight, getFreshAccessToken, type DeanOversight } from "@/lib/api/admin";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@/lib/types";

type RoleKind = "admin" | "lecturer" | "dean";
type CountKey = "users" | "staff" | "students" | "announcements" | "escalations" | "kb" | "calendar" | "resources" | "map";

type StaffRow = Pick<User, "id" | "name" | "email" | "role" | "is_profile_complete"> & {
  department: string | null;
  level: number | null;
};
type EscalationRow = {
  id: string;
  question: string;
  status: string | null;
  user_department: string | null;
  user_level: number | null;
  created_at: string | null;
};
type AnnouncementRow = {
  id: string;
  title: string;
  content: string;
  created_at: string | null;
  target_departments?: string[] | string | null;
  target_levels?: number[] | string | null;
};
type CalendarRow = {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  event_type: string | null;
};

type DashboardData = {
  counts: Record<CountKey, number>;
  staff: StaffRow[];
  escalations: EscalationRow[];
  announcements: AnnouncementRow[];
  calendar: CalendarRow[];
  lecturer_details?: any;
  error: string;
};

const emptyCounts: Record<CountKey, number> = {
  users: 0,
  staff: 0,
  students: 0,
  announcements: 0,
  escalations: 0,
  kb: 0,
  calendar: 0,
  resources: 0,
  map: 0,
};

const nav = {
  admin: [
    ["Dashboard", "dashboard", "/admin"],
    ["Analytics", "bar_chart", "/admin/analytics"],
    ["Academic Cohorts", "groups", "/admin/users"],
    ["Knowledge Base", "auto_stories", "/admin/knowledge-base"],
    ["FAQs", "quiz", "/admin/faqs"],
    ["Resources", "folder", "/admin/resources"],
    ["School Services", "support_agent", "/admin/services"],
    ["Calendar", "calendar_month", "/admin/calendar"],
    ["Escalations", "priority_high", "/admin/escalations"],
    ["Campus Map", "map", "/admin/campus-map"],
    ["Directory", "badge", "/admin/directory"],
    ["Rules Management", "gavel", "/admin/rules"],
    ["WhatsApp Log", "chat", "/admin/whatsapp"],
    ["System Logs", "history", "/admin/system-logs"],
  ],
  lecturer: [
    ["Dashboard", "dashboard", "/lecturer"],
    ["Analytics", "bar_chart", "/lecturer/analytics"],
    ["Academic Cohorts", "groups", "/lecturer/cohorts"],
    ["Announcements", "campaign", "/lecturer/announcements"],
    ["Calendar", "calendar_month", "/lecturer/schedules"],
    ["Knowledge Base", "auto_stories", "/lecturer/knowledge-base"],
    ["Resources", "folder", "/lecturer/resources"],
    ["Escalations", "priority_high", "/lecturer/escalations"],
  ],
  dean: [
    ["Dashboard", "dashboard", "/dean"],
    ["Analytics", "bar_chart", "/dean/analytics"],
    ["Staff Management", "admin_panel_settings", "/admin/users"],
    ["Audit Log", "history_edu", "/admin/system-logs"],
    ["Knowledge Hub", "auto_stories", "/admin/knowledge-base"],
    ["System Health", "health_and_safety", "/dean"],
    ["Campus Map", "map", "/admin/campus-map"],
  ],
} satisfies Record<RoleKind, string[][]>;

function Icon({ name, className = "" }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>;
}

function initials(name?: string) {
  return (name?.trim() || "Staff")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en", { notation: value > 9999 ? "compact" : "standard" }).format(value);
}

function formatDate(value?: string | null) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

function minutesAgo(value?: string | null) {
  if (!value) return "Recently";
  const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

function matchesTarget(target: string[] | number[] | string | null | undefined, value: string | number | undefined) {
  if (!value || !target || target === "all") return true;
  return Array.isArray(target) ? target.map(String).includes(String(value)) : String(target).includes(String(value));
}

function safeQuestion(question: string) {
  return question.length > 90 ? `${question.slice(0, 90)}...` : question;
}

async function countRows(table: string, build?: (query: any) => any) {
  try {
    const supabase = createClient();
    const base = supabase.from(table).select("id", { count: "exact", head: true });
    const { count, error } = await (build ? build(base) : base);
    if (error) return 0;
    return count || 0;
  } catch {
    return 0;
  }
}

function useGovernanceData(role: RoleKind, user: User | null) {
  const [data, setData] = useState<DashboardData>({
    counts: emptyCounts,
    staff: [],
    escalations: [],
    announcements: [],
    calendar: [],
    lecturer_details: null,
    error: "",
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session?.access_token) {
        try {
          const overview = await getAdminOverview(sessionData.session.access_token);
          if (!cancelled) {
            setData({ ...overview, error: "" });
          }
          return;
        } catch {
          // Fall back to the browser client below so the page still renders if Flask is offline.
        }
      }

      const department = user?.department || undefined;
      const level = user?.level || undefined;

      const [
        users,
        staff,
        students,
        announcements,
        escalations,
        kb,
        calendar,
        resources,
        map,
      ] = await Promise.all([
        countRows("users"),
        countRows("users", (q) => q.in("role", ["admin", "lecturer", "dean"])),
        countRows("users", (q) => q.eq("role", "student")),
        countRows("announcements"),
        countRows("escalations", (q) => (role === "lecturer" ? q.eq("user_department", department).eq("user_level", level) : q)),
        countRows("knowledge_base"),
        countRows("school_calendar"),
        countRows("resources"),
        countRows("campus_map"),
      ]);

      const staffQuery = supabase
        .from("users")
        .select("id,name,email,role,department,level,is_profile_complete")
        .in("role", role === "lecturer" ? ["lecturer"] : ["admin", "lecturer", "dean"])
        .limit(5);
      const escalationQuery = supabase
        .from("escalations")
        .select("id,question,status,user_department,user_level,created_at")
        .order("created_at", { ascending: false })
        .limit(5);
      const announcementQuery = supabase
        .from("announcements")
        .select("id,title,content,created_at,target_departments,target_levels")
        .order("created_at", { ascending: false })
        .limit(6);
      const calendarQuery = supabase
        .from("school_calendar")
        .select("id,title,description,start_date,event_type")
        .order("start_date", { ascending: true })
        .limit(4);

      if (role === "lecturer" && department && level) {
        escalationQuery.eq("user_department", department).eq("user_level", level);
      }

      const [staffResult, escalationResult, announcementResult, calendarResult] = await Promise.all([
        staffQuery,
        escalationQuery,
        announcementQuery,
        calendarQuery,
      ]);

      const rawAnnouncements = (announcementResult.data || []) as AnnouncementRow[];
      const filteredAnnouncements =
        role === "lecturer"
          ? rawAnnouncements.filter((item) => matchesTarget(item.target_departments, department) && matchesTarget(item.target_levels, level))
          : rawAnnouncements;

      if (!cancelled) {
        setData({
          counts: { users, staff, students, announcements, escalations, kb, calendar, resources, map },
          staff: ((staffResult.data || []) as StaffRow[]).filter((staffUser) => staffUser.id !== user?.id),
          escalations: (escalationResult.data || []) as EscalationRow[],
          announcements: filteredAnnouncements.slice(0, 3),
          calendar: (calendarResult.data || []) as CalendarRow[],
          lecturer_details: null,
          error: staffResult.error || escalationResult.error || announcementResult.error || calendarResult.error ? "Some live records could not be loaded because of database access rules." : "",
        });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [role, user?.department, user?.id, user?.level]);

  return data;
}

function profileFor(role: RoleKind, user: User | null) {
  if (role === "lecturer") {
    return {
      name: user?.name?.trim() || "Level Adviser",
      subtitle: `${user?.department || "Department"} (${user?.level || 300}L)`,
      search: `Search ${user?.level || 300}L records...`,
      tabs: ["Overview", "Reports", "Schedules"],
    };
  }
  if (role === "dean") {
    return {
      name: user?.name?.trim() || "Dean Profile",
      subtitle: "Dean of Academics",
      search: "Search institutional data...",
      tabs: ["Overview", "Compliance", "Resource Planning"],
    };
  }
  return {
    name: user?.name?.trim() || "Admin Profile",
    subtitle: "Admin",
    search: "Search system records...",
    tabs: ["Overview", "Detailed Analytics", "Schedules"],
  };
}

function roleRoute(role: RoleKind, route: "settings" | "notifications") {
  if (role === "admin") return `/admin/${route}`;
  if (role === "lecturer") return `/lecturer/${route}`;
  if (route === "settings") return "/admin/settings";
  return `/dean/${route}`;
}

function topTabRoute(role: RoleKind, tab: string) {
  const normalized = tab.toLowerCase();
  if (normalized === "overview") return `/${role}`;
  if (normalized === "schedules") return role === "admin" || role === "dean" ? "/admin/calendar" : `/${role}/schedules`;
  if (normalized === "detailed analytics" || normalized === "reports") return role === "admin" ? "/admin/analytics" : `/${role}/analytics`;
  if (normalized === "compliance") return "/admin/system-logs";
  if (normalized === "resource planning") return "/admin/resources";
  return `/${role}`;
}

export function GovernanceShell({ role, user, children }: { role: RoleKind; user: User | null; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const profile = profileFor(role, user);
  const [helpOpen, setHelpOpen] = useState(false);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="gov-dashboard text-[14px]">
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[240px] flex-col border-r border-[var(--gov-outline)] bg-[var(--gov-container)] shadow-sm lg:flex">
        <div className="px-5 py-7">
          <h1 className="text-[22px] font-extrabold text-[var(--gov-primary)]">SmartCampus</h1>
          <p className="mt-1 text-xs tracking-wide text-[var(--gov-muted)]">Administrative Portal</p>
        </div>
        <nav className="gov-scrollbar flex-1 space-y-1 overflow-y-auto px-2">
          {nav[role].map(([label, icon, href], index) => (
            <Link
              key={label}
              href={href}
              className={`flex items-center gap-3 px-5 py-3 text-sm transition ${
                pathname === href || (href !== `/${role}` && pathname.startsWith(href))
                  ? "border-l-[3px] border-[var(--gov-primary)] bg-[#d5e0f7] font-medium text-[var(--gov-primary)]"
                  : "text-[#3c475a] hover:bg-[var(--gov-container-high)] hover:text-[var(--gov-primary)]"
              }`}
            >
              <Icon name={icon} className="text-[21px]" />
              <span className="flex-1">{label}</span>
            </Link>
          ))}
        </nav>
        <div className="border-t border-[var(--gov-outline)] px-2 py-5">
          <Link className="flex items-center gap-3 px-5 py-3 text-[#3c475a] hover:bg-[var(--gov-container-high)]" href={roleRoute(role, "settings")}>
            <Icon name="settings" />
            <span>Settings</span>
          </Link>
          <button onClick={handleLogout} className="flex w-full items-center gap-3 px-5 py-3 text-left text-[#3c475a] hover:bg-[var(--gov-container-high)]">
            <Icon name="logout" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <header className="fixed right-0 top-0 z-30 flex h-14 w-full items-center justify-between border-b border-[var(--gov-outline)] bg-[var(--gov-surface)] px-4 shadow-sm lg:w-[calc(100%-240px)] lg:px-6">
        <div className="flex min-w-0 items-center gap-5">
          <div className="relative hidden sm:block">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-[#6f7480]" />
            <input className="h-9 w-64 rounded-lg border border-[var(--gov-outline)] bg-[var(--gov-container-low)] pl-10 pr-4 text-sm text-[#545f72] outline-none focus:ring-2 focus:ring-[var(--gov-primary)]" placeholder={profile.search} />
          </div>
          <nav className="hidden items-center gap-6 text-sm font-semibold md:flex">
            {profile.tabs.map((tab, index) => (
              <Link
                key={tab}
                className={pathname === topTabRoute(role, tab) || (index === 0 && pathname === `/${role}`) ? "border-b-2 border-[var(--gov-primary)] py-[18px] text-[var(--gov-primary)]" : "py-[18px] text-[#1a1c1e] hover:text-[var(--gov-primary)]"}
                href={topTabRoute(role, tab)}
              >
                {tab}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Link
            aria-label="Open notifications"
            className={`rounded-full p-2 text-[#2f3848] hover:bg-[var(--gov-container-high)] ${pathname === roleRoute(role, "notifications") ? "bg-[#d6e3ff] text-[var(--gov-primary)]" : ""}`}
            href={roleRoute(role, "notifications")}
            title="Notifications"
          >
            <Icon name="notifications" />
          </Link>
          <div className="relative">
            <button
              aria-expanded={helpOpen}
              aria-label="Open help"
              className={`rounded-full p-2 text-[#2f3848] hover:bg-[var(--gov-container-high)] ${helpOpen ? "bg-[#d6e3ff] text-[var(--gov-primary)]" : ""}`}
              onClick={() => setHelpOpen((open) => !open)}
              title="Help"
            >
              <Icon name="help" />
            </button>
            {helpOpen ? (
              <div className="absolute right-0 top-12 w-80 rounded-lg border border-[var(--gov-outline)] bg-white p-4 text-sm shadow-xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-[var(--gov-primary)]">SmartCampus Help</p>
                    <p className="mt-1 text-xs leading-5 text-[#545f72]">Quick links for this administrative workspace.</p>
                  </div>
                  <button className="text-[#545f72] hover:text-[var(--gov-primary)]" onClick={() => setHelpOpen(false)} aria-label="Close help">
                    <Icon name="close" className="text-[18px]" />
                  </button>
                </div>
                <div className="mt-4 grid gap-2">
                  <Link onClick={() => setHelpOpen(false)} href={topTabRoute(role, role === "admin" ? "Detailed Analytics" : "Reports")} className="rounded border border-[var(--gov-outline)] px-3 py-2 font-bold text-[var(--gov-primary)] hover:bg-[#f4f3f7]">
                    Detailed Analytics
                  </Link>
                  <Link onClick={() => setHelpOpen(false)} href={role === "lecturer" ? "/lecturer/escalations" : "/admin/system-logs"} className="rounded border border-[var(--gov-outline)] px-3 py-2 font-bold text-[var(--gov-primary)] hover:bg-[#f4f3f7]">
                    Audit and system logs
                  </Link>
                  <Link onClick={() => setHelpOpen(false)} href={roleRoute(role, "settings")} className="rounded border border-[var(--gov-outline)] px-3 py-2 font-bold text-[var(--gov-primary)] hover:bg-[#f4f3f7]">
                    Settings
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
          <div className="hidden h-7 w-px bg-[var(--gov-outline)] sm:block" />
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="font-semibold leading-none text-[var(--gov-primary)]">{profile.name}</p>
              <p className="mt-1 text-[10px] uppercase tracking-wide text-[#3c475a]">{profile.subtitle}</p>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--gov-outline)] bg-[#d6e3ff] text-xs font-bold text-[var(--gov-primary)]">
              {initials(profile.name)}
            </div>
          </div>
        </div>
      </header>

      <main className="min-h-screen pt-14 lg:ml-[240px]">{children}</main>
    </div>
  );
}

function StatCard({ icon, label, value, detail, tone = "blue" }: { icon: string; label: string; value: string; detail: string; tone?: "blue" | "red" | "brown" }) {
  const toneClass = tone === "red" ? "bg-[#ffdad6] text-[#ba1a1a]" : tone === "brown" ? "bg-[#4f2e00] text-[#ffddba]" : "bg-[#d6e3ff] text-[var(--gov-primary)]";
  return (
    <div className="gov-card rounded-lg p-5">
      <div className={`mb-4 grid h-10 w-10 place-items-center rounded ${toneClass}`}>
        <Icon name={icon} className="text-[21px]" />
      </div>
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#3c475a]">{label}</p>
      <h3 className="mt-1 text-2xl font-black text-[var(--gov-primary)]">{value}</h3>
      <p className="mt-3 text-xs text-[#344055]">{detail}</p>
    </div>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="rounded border border-dashed border-[var(--gov-outline)] p-4 text-sm text-[#545f72]">{children}</p>;
}

export function AdminCommandCenterContent({ user }: { user: User | null }) {
  const data = useGovernanceData("admin", user);
  const openEscalations = data.escalations.filter((item) => item.status !== "resolved");

  return (
    <div className="space-y-7">
        <section className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="text-[42px] font-black leading-tight text-[var(--gov-primary)]">Command Center</h2>
            <p className="text-lg text-[#3c475a]">Live SmartCampus governance from your Supabase data.</p>
          </div>
          <Link href="/admin/post" className="rounded bg-[var(--gov-primary)] px-6 py-3 font-bold text-white">
            <Icon name="add" className="mr-2 text-[18px]" />
            New Announcement
          </Link>
        </section>

        {data.error ? <EmptyLine>{data.error}</EmptyLine> : null}

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <StatCard icon="groups" label="Total Users" value={compactNumber(data.counts.users)} detail={`${data.counts.staff} staff / ${data.counts.students} students`} />
          <StatCard icon="auto_stories" label="Knowledge Entries" value={compactNumber(data.counts.kb)} detail={`${data.counts.announcements} announcements indexed in app data`} />
          <StatCard icon="priority_high" label="Open Escalations" value={compactNumber(openEscalations.length)} detail={`${data.counts.escalations} total escalation records`} tone="red" />
          <StatCard icon="folder" label="Resources" value={compactNumber(data.counts.resources)} detail={`${data.counts.map} campus map locations`} tone="brown" />
        </section>

        <section className="grid gap-6 xl:grid-cols-[2fr_0.95fr]">
          <div className="gov-card rounded-lg">
            <div className="flex items-center justify-between border-b border-[var(--gov-outline)] bg-[var(--gov-container)] px-5 py-4">
              <h3 className="text-xl font-semibold">Staff Management</h3>
              <Link href="/admin/users" className="text-sm font-bold text-[var(--gov-primary)]">Open Users</Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[#f2f1f5] text-[11px] uppercase text-[#3c475a]">
                  <tr><th className="px-5 py-4">User</th><th className="px-5 py-4">Role</th><th className="px-5 py-4">Scope</th><th className="px-5 py-4">Profile</th></tr>
                </thead>
                <tbody>
                  {data.staff.length ? data.staff.map((staff) => (
                    <tr key={staff.id} className="border-t border-[var(--gov-outline)]">
                      <td className="flex items-center gap-4 px-5 py-4">
                        <span className="grid h-9 w-9 place-items-center rounded-full bg-[#d6e3ff] text-xs font-bold text-[var(--gov-primary)]">{initials(staff.name)}</span>
                        <span><strong className="block">{staff.name || "Unnamed staff"}</strong><span className="text-xs text-[#3c475a]">{staff.email}</span></span>
                      </td>
                      <td className="px-5 py-4 capitalize">{staff.role}</td>
                      <td className="px-5 py-4 text-sm text-[#3c475a]">{staff.department || "All departments"} {staff.level ? `- ${staff.level}L` : ""}</td>
                      <td className="px-5 py-4"><span className={staff.is_profile_complete ? "rounded bg-[#e8f5e9] px-3 py-1 text-xs font-bold text-[#0a8f31]" : "rounded bg-[#fff8e1] px-3 py-1 text-xs font-bold text-[#8a5a00]"}>{staff.is_profile_complete ? "Complete" : "Incomplete"}</span></td>
                    </tr>
                  )) : (
                    <tr><td className="px-5 py-5 text-[#545f72]" colSpan={4}>No staff records available from Supabase.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="gov-card rounded-lg">
            <div className="flex items-center justify-between border-b border-[var(--gov-outline)] px-5 py-4">
              <h3 className="text-xl font-semibold">Escalation Queue</h3>
              <span className="rounded bg-[#ffdad6] px-3 py-1 text-xs font-black text-[#ba1a1a]">{openEscalations.length} OPEN</span>
            </div>
            <div className="space-y-4 p-5">
              {openEscalations.length ? openEscalations.slice(0, 3).map((ticket) => (
                <div key={ticket.id} className="border-l-4 border-[#c9151b] bg-[#faf9fd] p-4">
                  <div className="flex justify-between gap-3"><strong>{ticket.user_department || "General"} {ticket.user_level ? `${ticket.user_level}L` : ""}</strong><span className="text-xs text-[#545f72]">{minutesAgo(ticket.created_at)}</span></div>
                  <p className="mt-2 text-sm text-[#3c475a]">{safeQuestion(ticket.question)}</p>
                  <Link href="/admin/escalations" className="mt-3 inline-block text-sm font-bold text-[var(--gov-primary)]">Review</Link>
                </div>
              )) : <EmptyLine>No open escalations from Supabase.</EmptyLine>}
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <div className="gov-card rounded-lg p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Knowledge Base Intelligence</h3>
              <Link href="/admin/knowledge-base" className="border border-[var(--gov-outline)] px-4 py-2 text-sm font-bold">Manage Index</Link>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="border border-[var(--gov-outline)] bg-[#f4f3f7] p-4"><strong>{data.counts.kb}</strong><br /><span className="text-sm text-[#3c475a]">Knowledge records</span></div>
              <div className="border border-[var(--gov-outline)] bg-[#f4f3f7] p-4"><strong>{data.counts.resources}</strong><br /><span className="text-sm text-[#3c475a]">Resources</span></div>
              <div className="border border-[var(--gov-outline)] bg-[#f4f3f7] p-4"><strong>{data.counts.announcements}</strong><br /><span className="text-sm text-[#3c475a]">Announcements</span></div>
            </div>
          </div>
          <div className="gov-card flex items-center gap-5 rounded-lg p-5">
            <span className="grid h-16 w-16 place-items-center rounded bg-[#d6e3ff]"><Icon name="map" className="text-3xl text-[#545f72]" /></span>
            <div><h3 className="text-xl font-black">Campus Geo-Directory</h3><p className="mt-1 text-[#3c475a]">{data.counts.map} locations connected</p><Link href="/admin/campus-map" className="mt-3 inline-block font-bold text-[var(--gov-primary)]">View Map</Link></div>
          </div>
        </section>
    </div>
  );
}

export function AdminCommandCenter({ user }: { user: User | null }) {
  return (
    <GovernanceShell role="admin" user={user}>
      <GovernancePageFrame>
        <AdminCommandCenterContent user={user} />
      </GovernancePageFrame>
    </GovernanceShell>
  );
}

function ContentList({ title, items, render, empty }: { title: string; items: any[]; render: (item: any) => string; empty: string }) {
  return (
    <div className="rounded border border-[var(--gov-outline)] p-4">
      <h4 className="font-black text-[var(--gov-primary)]">{title}</h4>
      <div className="mt-3 space-y-2">
        {items.length ? items.slice(0, 4).map((item) => (
          <p key={item.id} className="line-clamp-2 rounded bg-[#f4f3f7] px-3 py-2 text-xs text-[#3c475a]">{render(item)}</p>
        )) : <p className="text-xs text-[#545f72]">{empty}</p>}
      </div>
    </div>
  );
}

export function LecturerDashboard({ user }: { user: User | null }) {
  const data = useGovernanceData("lecturer", user);
  const lecturerDetails = data.lecturer_details;
  const cohort = lecturerDetails?.cohort;
  const schoolContent = lecturerDetails?.school_content;
  const level = user?.level || 300;
  const department = user?.department || "Your Department";

  return (
    <GovernanceShell role="lecturer" user={user}>
      <div className="mx-auto max-w-[1220px] space-y-6 p-5 lg:p-7">
        <section className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="text-[40px] font-black text-[var(--gov-primary)]">Level Adviser Dashboard</h2>
            <p className="mt-2 text-base"><Icon name="school" className="mr-2 text-base" />{department} - {level}L Assigned Cohort</p>
          </div>
          <Link href="/lecturer/announcements" className="rounded bg-[var(--gov-primary)] px-6 py-3 font-bold text-white">New Cohort Announcement</Link>
        </section>
        <section className="grid gap-6 xl:grid-cols-[0.8fr_1.8fr_0.85fr]">
          <div className="space-y-5">
            <div className="gov-card rounded p-5">
              <p className="font-bold uppercase tracking-[0.14em] text-[#3c475a]">{level}L Cohort</p>
              <h3 className="mt-4 text-4xl font-black text-[var(--gov-primary)]">{cohort?.total_students ?? data.counts.students}</h3>
              <p className="font-bold uppercase">Total Students</p>
              <hr className="my-5 border-[var(--gov-outline)]" />
              <p className="flex justify-between">Active Students <span className="rounded-full bg-[#d6e3ff] px-3 font-bold">{cohort?.active_students ?? 0}</span></p>
              <p className="mt-3 flex justify-between">Unread Notices <span className="rounded-full bg-[#ffdAD6] px-3 font-bold text-[#ba1a1a]">{cohort?.unread_announcements ?? 0}</span></p>
              <p className="mt-3 flex justify-between">Pending Escalations <span className="rounded-full bg-[#d6e3ff] px-3 font-bold">{cohort?.pending_escalations ?? data.escalations.length}</span></p>
            </div>
            <div className="gov-card rounded p-5">
              <p className="font-bold uppercase tracking-[0.14em] text-[#3c475a]">Cohort Data</p>
              <p className="mt-4 flex justify-between">Resolved By Me <strong>{cohort?.resolved_by_me ?? 0}</strong></p>
              <p className="mt-3 flex justify-between">Avg Response <strong>{cohort?.average_response_hours ?? 0}h</strong></p>
              <p className="mt-3 flex justify-between">My Announcements <strong>{lecturerDetails?.own_announcements?.length ?? 0}</strong></p>
              <p className="mt-3 flex justify-between">My KB Entries <strong>{lecturerDetails?.own_knowledge_base?.length ?? 0}</strong></p>
            </div>
            <div className="gov-card rounded">
              <h3 className="border-b border-[var(--gov-outline)] bg-[#efedf1] px-5 py-4 font-bold">{level}L Calendar</h3>
              <div className="space-y-4 p-5">
                {data.calendar.length ? data.calendar.slice(0, 3).map((event) => (
                  <div key={event.id} className="flex gap-4"><div className="grid h-14 w-14 place-items-center bg-[#e9edf4] text-center text-xs font-bold text-[#3c5d92]">{formatDate(event.start_date)}</div><p><strong>{event.title}</strong><br /><span className="text-sm text-[#3c475a]">{event.event_type || "event"}</span></p></div>
                )) : <EmptyLine>No calendar events loaded.</EmptyLine>}
              </div>
            </div>
          </div>

          <div className="gov-card rounded">
            <div className="flex items-center justify-between border-b border-[var(--gov-outline)] p-5">
              <div><h3 className="text-2xl font-black text-[var(--gov-primary)]">Announcements Feed</h3><p className="text-sm">Locked to: <strong>{department} - {level} Level</strong></p></div>
              <Link href="/lecturer/announcements" className="border border-[var(--gov-outline)] px-4 py-2 text-sm font-bold">Manage Mine</Link>
            </div>
            {data.announcements.length ? data.announcements.map((notice) => (
              <article key={notice.id} className="border-b border-[var(--gov-outline)] p-5">
                <div className="flex justify-between"><span className="rounded-full bg-[#d6e3ff] px-4 py-1 text-xs font-bold uppercase">Cohort Notice</span><span className="text-sm text-[#545f72]">{minutesAgo(notice.created_at)}</span></div>
                <h4 className="mt-4 text-xl font-black">{notice.title}</h4>
                <p className="mt-3 leading-6 text-[#2f3033]">{safeQuestion(notice.content)}</p>
              </article>
            )) : <div className="p-5"><EmptyLine>No matching announcements from Supabase.</EmptyLine></div>}
          </div>

          <div className="space-y-5">
            <div className="gov-card rounded">
              <div className="flex items-center justify-between border-b border-[var(--gov-outline)] bg-[#efedf1] p-5"><h3 className="font-bold">Academic Escalations</h3><span className="rounded-xl bg-[var(--gov-primary)] px-4 py-2 text-sm font-black text-white">{data.escalations.length}</span></div>
              <div className="space-y-4 p-5">{lecturerDetails?.assigned_escalations?.length ? lecturerDetails.assigned_escalations.slice(0, 3).map((item: any) => <div key={item.id} className="border border-[var(--gov-outline)] p-4"><h4 className="font-bold">{item.status || "pending"}</h4><p className="mt-2 text-sm">{safeQuestion(item.question)}</p><p className="mt-2 text-xs text-[#545f72]">Submitted: {item.created_at ? new Date(item.created_at).toLocaleString() : "No date"}</p><Link href="/lecturer/escalations" className="mt-3 inline-block text-sm font-bold text-[var(--gov-primary)]">Open detail</Link></div>) : <EmptyLine>No assigned escalations.</EmptyLine>}</div>
            </div>
            <div className="gov-card rounded bg-[#efedf1] p-5">
              <h3 className="font-bold text-[var(--gov-primary)]">Adviser Tools</h3>
              {["Cohort announcements", "Escalation replies", "Department calendar", "Knowledge contributions"].map((item) => <p key={item} className="mt-4 text-[#3c475a]"><Icon name="article" className="mr-3 text-base" />{item}</p>)}
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-3">
          <div className="gov-card rounded p-5">
            <h3 className="text-xl font-black text-[var(--gov-primary)]">My Announcements</h3>
            <p className="mt-1 text-sm text-[#545f72]">Published, scheduled, and draft notices with delivery counts.</p>
            <div className="mt-4 space-y-3">
              {lecturerDetails?.own_announcements?.length ? lecturerDetails.own_announcements.slice(0, 5).map((item: any) => (
                <div key={item.id} className="rounded border border-[var(--gov-outline)] p-3">
                  <p className="font-bold">{item.title}</p>
                  <p className="mt-1 text-xs text-[#545f72]">{item.status || "published"} - delivered to {item.delivery_count || 0} students</p>
                </div>
              )) : <EmptyLine>No announcements created by you yet.</EmptyLine>}
            </div>
          </div>

          <div className="gov-card rounded p-5">
            <h3 className="text-xl font-black text-[var(--gov-primary)]">My Calendar and KB</h3>
            <p className="mt-1 text-sm text-[#545f72]">Events and knowledge entries you contributed.</p>
            <div className="mt-4 space-y-3">
              {lecturerDetails?.own_calendar?.slice(0, 3).map((item: any) => (
                <div key={item.id} className="rounded border border-[var(--gov-outline)] p-3">
                  <p className="font-bold">{item.title}</p>
                  <p className="mt-1 text-xs text-[#545f72]">{item.event_type || "event"} - {item.start_date || "No date"}</p>
                </div>
              ))}
              {lecturerDetails?.own_knowledge_base?.slice(0, 3).map((item: any) => (
                <div key={item.id} className="rounded border border-[var(--gov-outline)] p-3">
                  <p className="font-bold">{item.category || "general"}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-[#545f72]">{item.content}</p>
                </div>
              ))}
              {!lecturerDetails?.own_calendar?.length && !lecturerDetails?.own_knowledge_base?.length ? <EmptyLine>No calendar or knowledge entries created by you yet.</EmptyLine> : null}
            </div>
          </div>

          <div className="gov-card rounded p-5">
            <h3 className="text-xl font-black text-[var(--gov-primary)]">Common Escalation Topics</h3>
            <p className="mt-1 text-sm text-[#545f72]">Aggregate topics only. No individual student profiles.</p>
            <div className="mt-4 space-y-3">
              {cohort?.common_topics?.length ? cohort.common_topics.map((item: any) => (
                <div key={item.topic} className="flex justify-between rounded border border-[var(--gov-outline)] p-3">
                  <span className="font-bold">{item.topic}</span>
                  <span className="rounded bg-[#d6e3ff] px-3 font-bold text-[var(--gov-primary)]">{item.count}</span>
                </div>
              )) : <EmptyLine>No common topics yet.</EmptyLine>}
            </div>
          </div>
        </section>

        <section className="gov-card rounded p-5">
          <h3 className="text-xl font-black text-[var(--gov-primary)]">Department School Content</h3>
          <p className="mt-1 text-sm text-[#545f72]">Published content for {department} {level}L from staff roles. This is school content only, not student private data.</p>
          <div className="mt-5 grid gap-5 xl:grid-cols-5">
            <ContentList title="Announcements" items={schoolContent?.announcements || []} render={(item: any) => `${item.title} (${item.created_by_role || "staff"})`} empty="No published department announcements." />
            <ContentList title="Calendar" items={schoolContent?.calendar || []} render={(item: any) => `${item.title} - ${item.start_date || "No date"}`} empty="No department calendar events." />
            <ContentList title="Resources" items={schoolContent?.resources || []} render={(item: any) => `${item.title} (${item.type || "resource"})`} empty="No department resources." />
            <ContentList title="FAQs" items={schoolContent?.faqs || []} render={(item: any) => item.question} empty="No department FAQs." />
            <ContentList title="Knowledge Base" items={schoolContent?.knowledge_base || []} render={(item: any) => item.category || safeQuestion(item.content || "Knowledge entry")} empty="No department KB entries." />
          </div>
        </section>
      </div>
    </GovernanceShell>
  );
}

export function DeanDashboard({ user }: { user: User | null }) {
  const data = useGovernanceData("dean", user);
  const [oversight, setOversight] = useState<DeanOversight | null>(null);
  const [oversightError, setOversightError] = useState("");
  const departments = useMemo(() => {
    const names = new Set(data.staff.map((staff) => staff.department).filter(Boolean));
    return Array.from(names).slice(0, 4);
  }, [data.staff]);

  useEffect(() => {
    let cancelled = false;
    async function loadOversight() {
      if (!user || user.role !== "dean") return;
      try {
        const token = await getFreshAccessToken();
        const result = await getDeanOversight(token);
        if (!cancelled) setOversight(result);
      } catch (caught) {
        if (!cancelled) setOversightError(caught instanceof Error ? caught.message : "Could not load dean oversight data.");
      }
    }
    loadOversight();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <GovernanceShell role="dean" user={user}>
      <div className="mx-auto max-w-[1100px] space-y-6 p-5 lg:p-7">
        <section className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div><h2 className="text-[34px] font-black text-[var(--gov-primary)]">Institutional Oversight Hub</h2><p className="text-[#3c475a]">Live institutional overview from Supabase.</p></div>
          <button className="gov-card rounded px-5 py-3"><Icon name="calendar_month" className="mr-2" />Academic Year 2023/24</button>
        </section>
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <StatCard icon="groups" label="Users" value={compactNumber(data.counts.users)} detail={`${data.counts.staff} staff accounts`} />
          <StatCard icon="auto_stories" label="Knowledge Base" value={compactNumber(data.counts.kb)} detail="Approved knowledge records" />
          <StatCard icon="priority_high" label="Escalations" value={compactNumber(data.counts.escalations)} detail="Institution-wide records" tone="red" />
          <StatCard icon="map" label="Campus Data" value={compactNumber(data.counts.map)} detail={`${data.counts.calendar} calendar events`} />
        </section>
        {oversightError ? <EmptyLine>{oversightError}</EmptyLine> : null}
        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="gov-card rounded">
            <div className="flex justify-between border-b border-[var(--gov-outline)] p-5">
              <div>
                <h3 className="text-xl font-bold">Admin Account Oversight</h3>
                <p className="text-sm text-[#3c475a]">Admin identity, recent activity, and significant action counts.</p>
              </div>
              <Link href="/admin/users" className="font-bold text-[var(--gov-primary)]">Manage Staff</Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#f2f1f5] text-xs uppercase text-[#3c475a]">
                  <tr>
                    <th className="px-5 py-3">Admin</th>
                    <th className="px-5 py-3">Created</th>
                    <th className="px-5 py-3">Last active</th>
                    <th className="px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {oversight?.admin_accounts?.length ? oversight.admin_accounts.slice(0, 6).map((admin: any) => (
                    <tr key={admin.id} className="border-t border-[var(--gov-outline)]">
                      <td className="px-5 py-4"><strong>{admin.name || "Admin"}</strong><br /><span className="text-xs text-[#545f72]">{admin.email}</span></td>
                      <td className="px-5 py-4 text-[#3c475a]">{admin.created_at ? formatDate(admin.created_at) : "No date"}</td>
                      <td className="px-5 py-4">
                        <span className={admin.is_active_7_days ? "rounded bg-[#e8f5e9] px-2 py-1 text-xs font-bold text-[#2e7d32]" : "rounded bg-[#fff8e1] px-2 py-1 text-xs font-bold text-[#7a5200]"}>
                          {admin.is_active_7_days ? "Active 7d" : "Inactive 7d"}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-black text-[var(--gov-primary)]">{admin.significant_action_count || 0}</td>
                    </tr>
                  )) : <tr><td colSpan={4} className="px-5 py-5 text-[#545f72]">No admin accounts loaded.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div className="grid gap-5">
            <StatCard icon="admin_panel_settings" label="Active Admins" value={compactNumber(oversight?.active_admins_7_days?.length || 0)} detail={`${oversight?.inactive_admins_7_days?.length || 0} admins inactive in the last 7 days`} />
            <StatCard icon="timer" label="Admin Escalation Response" value={`${oversight?.admin_response_times?.average_hours || 0}h`} detail={`${oversight?.admin_response_times?.count || 0} admin-involved resolved escalations`} />
          </div>
        </section>
        <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <div className="gov-card rounded">
            <div className="flex justify-between border-b border-[var(--gov-outline)] p-5">
              <h3 className="text-xl font-bold">All Announcements</h3>
              <Link href="/admin/post" className="font-bold text-[var(--gov-primary)]">Create</Link>
            </div>
            <div className="divide-y divide-[var(--gov-outline)]">
              {oversight?.all_announcements?.length ? oversight.all_announcements.slice(0, 5).map((item) => (
                <div key={item.id} className="p-5 text-sm">
                  <div className="flex justify-between gap-3"><strong>{item.title}</strong><span className="rounded bg-[#efedf1] px-2 py-1 text-xs font-bold uppercase">{item.status || item.computed_state || "published"}</span></div>
                  <p className="mt-2 text-xs text-[#545f72]">{item.created_by_role || "staff"} - {item.created_at ? formatDate(item.created_at) : "No date"}</p>
                </div>
              )) : <div className="p-5"><EmptyLine>No announcements loaded.</EmptyLine></div>}
            </div>
          </div>
          <div className="gov-card rounded">
            <div className="flex justify-between border-b border-[var(--gov-outline)] p-5">
              <h3 className="text-xl font-bold">Deletion History</h3>
              <Link href="/admin/system-logs" className="font-bold text-[var(--gov-primary)]">Full Audit Log</Link>
            </div>
            <div className="divide-y divide-[var(--gov-outline)]">
              {oversight?.deletion_history?.length ? oversight.deletion_history.slice(0, 5).map((log) => (
                <div key={log.id} className="p-5 text-sm">
                  <div className="flex justify-between gap-3"><strong>{log.action}</strong><span className="text-xs text-[#545f72]">{log.actor_role || "staff"}</span></div>
                  <p className="mt-2 text-xs text-[#545f72]">{log.table_name} - {log.created_at ? new Date(log.created_at).toLocaleString() : "No date"}</p>
                </div>
              )) : <div className="p-5"><EmptyLine>No deletion records found.</EmptyLine></div>}
            </div>
          </div>
        </section>
        <section className="grid gap-6 xl:grid-cols-[2fr_0.95fr]">
          <div className="gov-card rounded">
            <div className="flex justify-between border-b border-[var(--gov-outline)] p-5"><h3 className="text-xl font-bold">Departmental Staff Presence</h3><span className="text-sm text-[#545f72]">From user profiles</span></div>
            <div className="space-y-5 p-5">{departments.length ? departments.map((department) => {
              const total = data.staff.filter((staff) => staff.department === department).length;
              const width = `${Math.min(100, Math.max(8, total * 20))}%`;
              return <div key={department}><p className="flex justify-between text-sm font-bold"><span>{department}</span><span>{total} staff</span></p><div className="mt-2 h-2 rounded bg-[#e3e2e6]"><div className="h-2 rounded bg-[var(--gov-primary)]" style={{ width }} /></div></div>;
            }) : <EmptyLine>No department staff data available.</EmptyLine>}</div>
          </div>
          <div className="gov-card rounded p-5">
            <h3 className="text-xl font-bold">Platform Content</h3>
            <div className="mt-6 space-y-5 text-[#3c475a]"><p className="flex justify-between">Announcements <strong>{data.counts.announcements}</strong></p><p className="flex justify-between">Resources <strong>{data.counts.resources}</strong></p><p className="flex justify-between">Calendar Events <strong>{data.counts.calendar}</strong></p></div>
          </div>
        </section>
        <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <div className="gov-card overflow-hidden rounded border-2 border-[var(--gov-primary)]">
            <div className="bg-[#183a66] p-5 text-lg font-bold text-white"><Icon name="campaign" className="mr-3" />Institutional Broadcast</div>
            <div className="space-y-5 p-5"><textarea className="h-28 w-full border border-[var(--gov-outline)] p-4" placeholder="Write a dean-approved announcement..." /><Link href="/admin/post" className="block w-full bg-[var(--gov-primary)] py-4 text-center font-black text-white">Create Broadcast</Link></div>
          </div>
          <div className="gov-card rounded">
            <div className="flex justify-between border-b border-[var(--gov-outline)] p-5"><h3 className="text-xl font-bold">Recent Escalations</h3><Link href="/admin/escalations" className="font-bold">Open</Link></div>
            {data.escalations.length ? data.escalations.slice(0, 3).map((item) => <div key={item.id} className="grid grid-cols-[1fr_auto] gap-4 border-b border-[var(--gov-outline)] p-5 text-sm"><span>{safeQuestion(item.question)}</span><strong>{item.status || "pending"}</strong></div>) : <div className="p-5"><EmptyLine>No escalation records loaded.</EmptyLine></div>}
          </div>
        </section>
        <section className="gov-card rounded p-5">
          <div className="flex justify-between"><div><h3 className="text-xl font-bold">Administrative Staff Engagement</h3><p className="text-sm text-[#3c475a]">Staff accounts from Supabase user profiles.</p></div><Link href="/admin/users" className="rounded bg-[var(--gov-primary)] px-5 py-3 text-white">Manage Roles</Link></div>
          <div className="mt-5 grid gap-4 md:grid-cols-4">{data.staff.length ? data.staff.slice(0, 4).map((staff) => <div key={staff.id} className="flex items-center gap-3 border border-[var(--gov-outline)] bg-[#efedf1] p-3"><span className="grid h-10 w-10 place-items-center rounded bg-[#d6e3ff] text-xs font-bold">{initials(staff.name)}</span><p className="min-w-0 truncate">{staff.name || staff.email}<br /><span className="text-xs font-bold uppercase text-[#3c475a]">{staff.role}</span></p></div>) : <EmptyLine>No staff data available.</EmptyLine>}</div>
        </section>
      </div>
    </GovernanceShell>
  );
}

export function GovernanceLoading({ message }: { message: string }) {
  return <div className="gov-dashboard grid min-h-screen place-items-center"><div className="gov-card rounded-lg p-6 text-[#3c475a]">{message}</div></div>;
}

export function GovernanceRestricted({ message }: { message: string }) {
  return <div className="gov-dashboard grid min-h-screen place-items-center"><div className="gov-card max-w-md rounded-lg p-6"><h1 className="text-xl font-bold text-[var(--gov-primary)]">Access restricted</h1><p className="mt-3 text-[#3c475a]">{message}</p></div></div>;
}

export function GovernancePageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1220px] p-5 lg:p-7">
      <div className="governance-embedded">{children}</div>
    </div>
  );
}
