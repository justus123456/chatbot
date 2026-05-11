"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { GovernanceLoading, GovernancePageFrame, GovernanceRestricted, GovernanceShell } from "@/components/governance/role-dashboards";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { canAccessLecturer, getRoleHome } from "@/lib/roles";

export default function LecturerAnalyticsPage() {
  const router = useRouter();
  const { user, loading } = useCurrentUser();

  useEffect(() => {
    if (!loading && user && !canAccessLecturer(user.role)) {
      router.replace(getRoleHome(user.role, Boolean(user.is_profile_complete)));
    }
  }, [loading, router, user]);

  if (loading) return <GovernanceLoading message="Checking your lecturer role..." />;
  if (!user || !canAccessLecturer(user.role)) return <GovernanceRestricted message="Only lecturer accounts can open lecturer reports." />;

  return (
    <GovernanceShell role="lecturer" user={user}>
      <GovernancePageFrame>
        <section className="space-y-5">
          <header className="border-b border-[var(--gov-outline)] pb-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#545f72]">Reports</p>
            <h1 className="mt-2 text-3xl font-black text-[var(--gov-primary)]">Lecturer Analytics</h1>
            <p className="mt-2 text-sm text-[#3c475a]">Cohort reports will show announcement reach, escalation volume, and knowledge gaps for your assigned students.</p>
          </header>
          <div className="grid gap-4 md:grid-cols-3">
            {["Announcement reach", "Pending escalations", "Knowledge gaps"].map((item) => (
              <article key={item} className="gov-card rounded-lg p-5">
                <h2 className="text-lg font-bold text-[var(--gov-primary)]">{item}</h2>
                <p className="mt-2 text-sm text-[#545f72]">Live cohort metric placeholder until lecturer analytics endpoints are expanded.</p>
              </article>
            ))}
          </div>
        </section>
      </GovernancePageFrame>
    </GovernanceShell>
  );
}
