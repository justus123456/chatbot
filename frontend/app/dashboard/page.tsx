"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Bell, Calendar, MessageSquare, Sparkles } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api/flask-client";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { getRoleHome, isStaffRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";
import type { Announcement, CalendarEvent, Notification, PaginatedResponse } from "@/lib/types";

type DashboardState = {
  announcements: Announcement[];
  notifications: Notification[];
  events: CalendarEvent[];
};

const initialState: DashboardState = {
  announcements: [],
  notifications: [],
  events: [],
};

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useCurrentUser();
  const [data, setData] = useState<DashboardState>(initialState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!userLoading && isStaffRole(user?.role)) {
      router.replace(getRoleHome(user?.role, true));
    }
  }, [router, user?.role, userLoading]);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      try {
        const supabase = createClient();
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;

        if (!token) {
          if (!cancelled) {
            setLoading(false);
            setError("Please log in to load your dashboard.");
          }
          return;
        }

        const [announcements, notifications, events] = await Promise.all([
          apiFetch<PaginatedResponse<Announcement>>("/api/announcements", token),
          apiFetch<PaginatedResponse<Notification>>("/api/notifications", token),
          apiFetch<PaginatedResponse<CalendarEvent>>("/api/calendar", token),
        ]);

        if (!cancelled) {
          setData({
            announcements: announcements.data,
            notifications: notifications.data,
            events: events.data,
          });
          setLoading(false);
        }
      } catch (caught) {
        if (!cancelled) {
          setLoading(false);
          setError(caught instanceof Error ? caught.message : "Could not load your dashboard.");
        }
      }
    }

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, []);

  const greeting = useMemo(() => getGreeting(), []);
  const firstName = user?.name?.split(" ")[0] || "there";
  const todaySummary = getTodaySummary(data.events, data.notifications);
  const profileLabel = user?.department && user?.level ? `${user.department} ${user.level}L` : "Complete your profile";
  const dashboardWarning = getDashboardWarning(error);

  return (
    <AppShell>
      <section className="grid gap-5 lg:grid-cols-[1.45fr_0.95fr]">
        <Card className="overflow-hidden">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-mint">{greeting}</p>
              <h2 className="mt-4 text-4xl font-semibold">Here&apos;s what matters today, {firstName}.</h2>
              <p className="mt-4 max-w-2xl text-white/55">
                {userLoading
                  ? "Loading your student profile..."
                  : `Your dashboard is personalized for ${profileLabel}. Check notices, deadlines, and school updates in one place.`}
              </p>
            </div>
            <span className="hidden rounded-full bg-mint/10 px-4 py-2 text-xs text-mint md:block">{profileLabel}</span>
          </div>

          <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-white/50">Today</p>
            <p className="mt-2 text-lg font-medium">{todaySummary}</p>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button href="/chat">
              <MessageSquare className="size-4" />
              Ask the assistant
            </Button>
            <Button href="/calendar" variant="outline">
              <Calendar className="size-4" />
              Check calendar
            </Button>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/50">Profile status</p>
              <h3 className="mt-1 text-2xl font-semibold">{user?.is_profile_complete ? "Ready" : "Needs setup"}</h3>
            </div>
            <Sparkles className="size-9 text-mint" />
          </div>
          <div className="mt-5 space-y-3 text-sm text-white/65">
            <p><strong className="text-white">Department:</strong> {user?.department || "Not set yet"}</p>
            <p><strong className="text-white">Level:</strong> {user?.level ? `${user.level}L` : "Not set yet"}</p>
            <p><strong className="text-white">Language:</strong> {user?.preferred_language === "pidgin" ? "Pidgin" : "English"}</p>
            <p><strong className="text-white">Tone:</strong> {user?.preferred_tone === "formal" ? "Formal" : "Simple"}</p>
          </div>
          {!user?.is_profile_complete ? (
            <div className="mt-5">
              <Button href="/complete-profile" variant="outline">Finish onboarding</Button>
            </div>
          ) : null}
        </Card>
      </section>

      <section className="mt-5 grid gap-5 md:grid-cols-3">
        <Card>
          <Bell className="mb-4 size-6 text-mint" />
          <p className="text-sm text-white/50">Notifications</p>
          <h3 className="mt-1 text-2xl font-semibold">{data.notifications.length}</h3>
          <p className="mt-3 text-sm text-white/55">
            {data.notifications.length ? "New updates are waiting for you." : "No notifications yet."}
          </p>
        </Card>
        <Card>
          <Calendar className="mb-4 size-6 text-mint" />
          <p className="text-sm text-white/50">School calendar</p>
          <h3 className="mt-1 text-2xl font-semibold">{data.events.length}</h3>
          <p className="mt-3 text-sm text-white/55">
            {data.events.length ? "Upcoming dates have been added for you." : "No calendar entries yet from admin."}
          </p>
        </Card>
        <Card>
          <MessageSquare className="mb-4 size-6 text-mint" />
          <p className="text-sm text-white/50">Support</p>
          <h3 className="mt-1 text-2xl font-semibold">Ask freely</h3>
          <p className="mt-3 text-sm text-white/55">Use the assistant anytime for fees, registration, hostel, clearance, or campus questions.</p>
        </Card>
      </section>

      {dashboardWarning ? (
        <section className="mt-5">
          <Card>
            <p className="text-sm text-amber-200">{dashboardWarning}</p>
          </Card>
        </section>
      ) : null}

      <section className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-xl font-semibold">Announcements</h3>
            <Button href="/announcements" variant="ghost">
              View all <ArrowRight className="size-4" />
            </Button>
          </div>
          {loading ? (
            <p className="text-sm text-white/55">Loading announcements...</p>
          ) : data.announcements.length ? (
            <div className="space-y-3">
              {data.announcements.slice(0, 3).map((item) => (
                <article key={item.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <strong>{item.title}</strong>
                  <p className="mt-2 text-sm text-white/55">{item.content}</p>
                </article>
              ))}
            </div>
          ) : (
            <EmptyMessage
              title="No announcements yet"
              body="When school staff post updates for your department or level, they will show here."
            />
          )}
        </Card>

        <Card>
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-xl font-semibold">Upcoming dates</h3>
            <Button href="/calendar" variant="ghost">
              Open <ArrowRight className="size-4" />
            </Button>
          </div>
          {loading ? (
            <p className="text-sm text-white/55">Loading calendar...</p>
          ) : data.events.length ? (
            <div className="space-y-3">
              {data.events.slice(0, 3).map((item) => (
                <article key={item.id} className="rounded-2xl border border-mint/15 bg-mint/10 p-4">
                  <strong>{item.title}</strong>
                  <p className="mt-2 text-sm text-white/55">{item.description || "No extra details yet."}</p>
                </article>
              ))}
            </div>
          ) : (
            <EmptyMessage
              title="No calendar updates yet"
              body="This section will stay empty until an admin adds dates for your department or level."
            />
          )}
        </Card>
      </section>
    </AppShell>
  );
}

function EmptyMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="font-medium">{title}</p>
      <p className="mt-2 text-sm text-white/55">{body}</p>
    </div>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getTodaySummary(events: CalendarEvent[], notifications: Notification[]) {
  if (events.length) return `You have ${events.length} school update${events.length > 1 ? "s" : ""} waiting in your calendar.`;
  if (notifications.length) return `You have ${notifications.length} notification${notifications.length > 1 ? "s" : ""} to review.`;
  return "No new announcements or calendar updates have been posted for you yet.";
}

function getDashboardWarning(error: string) {
  if (!error) return "";
  if (error === "Failed to fetch") {
    return "We could not reach the school service just now, so some sections may stay empty until the connection comes back.";
  }
  if (error === "Please log in to load your dashboard.") {
    return "";
  }
  return error;
}
