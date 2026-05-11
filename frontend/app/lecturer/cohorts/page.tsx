"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAdminOverview, getFreshAccessToken, type AdminOverview } from "@/lib/api/admin";
import { GovernanceLoading, GovernancePageFrame, GovernanceRestricted, GovernanceShell } from "@/components/governance/role-dashboards";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { canAccessLecturer, getRoleHome } from "@/lib/roles";

function Stat({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <article className="gov-card rounded-lg p-5">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#545f72]">{label}</p>
      <h2 className="mt-3 text-3xl font-black text-[var(--gov-primary)]">{value}</h2>
      <p className="mt-2 text-sm text-[#3c475a]">{detail}</p>
    </article>
  );
}

export default function LecturerCohortsPage() {
  const router = useRouter();
  const { user, loading } = useCurrentUser();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && user && !canAccessLecturer(user.role)) {
      router.replace(getRoleHome(user.role, Boolean(user.is_profile_complete)));
    }
  }, [loading, router, user]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user || !canAccessLecturer(user.role)) return;
      try {
        const token = await getFreshAccessToken();
        const data = await getAdminOverview(token);
        if (!cancelled) setOverview(data);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load cohort data.");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading) return <GovernanceLoading message="Checking your lecturer role..." />;
  if (!user || !canAccessLecturer(user.role)) return <GovernanceRestricted message="Only lecturer accounts can open academic cohorts." />;

  const cohort = overview?.lecturer_details?.cohort;
  const department = user.department || "Assigned department";
  const level = user.level || "assigned level";

  return (
    <GovernanceShell role="lecturer" user={user}>
      <GovernancePageFrame>
        <section className="space-y-6">
          <header className="border-b border-[var(--gov-outline)] pb-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#545f72]">Academic cohorts</p>
            <h1 className="mt-2 text-3xl font-black text-[var(--gov-primary)]">{department} - {level}L Cohort</h1>
            <p className="mt-2 text-sm text-[#3c475a]">
              Aggregate cohort view only. This page does not expose individual student profiles, chats, documents, notes, goals, or flashcards.
            </p>
          </header>

          {error ? <p className="rounded border border-[#ba1a1a] bg-[#ffdad6] p-3 text-sm font-bold text-[#93000a]">{error}</p> : null}

          <div className="grid gap-4 md:grid-cols-4">
            <Stat label="Total students" value={cohort?.total_students ?? 0} detail="Students in your assigned department and level." />
            <Stat label="Active students" value={cohort?.active_students ?? 0} detail="Students active within the recent activity window." />
            <Stat label="Unread notices" value={cohort?.unread_announcements ?? 0} detail="Unread announcement notifications across the cohort." />
            <Stat label="Pending escalations" value={cohort?.pending_escalations ?? 0} detail="Questions still awaiting staff response." />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <article className="gov-card rounded-lg p-5">
              <h2 className="text-xl font-black text-[var(--gov-primary)]">Response summary</h2>
              <div className="mt-5 space-y-4 text-sm">
                <p className="flex justify-between border-b border-[var(--gov-outline)] pb-3">
                  <span>Escalations resolved by me</span>
                  <strong>{cohort?.resolved_by_me ?? 0}</strong>
                </p>
                <p className="flex justify-between border-b border-[var(--gov-outline)] pb-3">
                  <span>Average response time</span>
                  <strong>{cohort?.average_response_hours ?? 0}h</strong>
                </p>
              </div>
            </article>

            <article className="gov-card rounded-lg p-5">
              <h2 className="text-xl font-black text-[var(--gov-primary)]">Common escalation topics</h2>
              <div className="mt-5 space-y-3">
                {cohort?.common_topics?.length ? cohort.common_topics.map((topic) => (
                  <p key={topic.topic} className="flex justify-between rounded border border-[var(--gov-outline)] px-4 py-3 text-sm">
                    <span className="font-bold">{topic.topic}</span>
                    <span className="rounded bg-[#d6e3ff] px-3 font-black text-[var(--gov-primary)]">{topic.count}</span>
                  </p>
                )) : <p className="rounded border border-dashed border-[var(--gov-outline)] p-4 text-sm text-[#545f72]">No common topics yet.</p>}
              </div>
            </article>
          </div>
        </section>
      </GovernancePageFrame>
    </GovernanceShell>
  );
}
