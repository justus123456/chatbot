"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getDeanInstitutionalAnalytics,
  getFreshAccessToken,
  restoreDeanDeletedContent,
  type DeanInstitutionalAnalytics,
} from "@/lib/api/admin";
import { GovernanceLoading, GovernancePageFrame, GovernanceRestricted, GovernanceShell } from "@/components/governance/role-dashboards";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { canAccessDean, getRoleHome } from "@/lib/roles";

function Metric({ label, value, tone = "normal" }: { label: string; value: string | number; tone?: "normal" | "warn" }) {
  return (
    <article className="gov-card rounded-lg p-5">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#545f72]">{label}</p>
      <h2 className={tone === "warn" ? "mt-2 text-3xl font-black text-[#ba1a1a]" : "mt-2 text-3xl font-black text-[var(--gov-primary)]"}>{value}</h2>
    </article>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "No date";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "No date" : date.toLocaleString();
}

export default function DeanAnalyticsPage() {
  const router = useRouter();
  const { user, loading } = useCurrentUser();
  const [analytics, setAnalytics] = useState<DeanInstitutionalAnalytics | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!loading && user && !canAccessDean(user.role)) {
      router.replace(getRoleHome(user.role, Boolean(user.is_profile_complete)));
    }
  }, [loading, router, user]);

  async function load() {
    setError("");
    try {
      const token = await getFreshAccessToken();
      setAnalytics(await getDeanInstitutionalAnalytics(token));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load dean analytics.");
    }
  }

  useEffect(() => {
    if (user && canAccessDean(user.role)) load();
  }, [user]);

  async function restore(logId: string) {
    setError("");
    setNotice("");
    try {
      const token = await getFreshAccessToken();
      await restoreDeanDeletedContent(logId, token);
      setNotice("Deleted content restored from audit snapshot.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not restore deleted content.");
    }
  }

  const lowEngagement = useMemo(() => {
    return [...(analytics?.student_engagement_by_cohort || [])].sort((a, b) => a.engagement_rate - b.engagement_rate).slice(0, 6);
  }, [analytics]);

  if (loading) return <GovernanceLoading message="Checking dean role..." />;
  if (!user || !canAccessDean(user.role)) return <GovernanceRestricted message="Only the dean account can open institutional analytics." />;

  const health = analytics?.platform_health;
  const oversight = analytics?.content_oversight;

  return (
    <GovernanceShell role="dean" user={user}>
      <GovernancePageFrame>
        <div className="space-y-6">
          <header className="border-b border-[var(--gov-outline)] pb-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#545f72]">Institutional analytics</p>
            <h1 className="mt-2 text-3xl font-black text-[var(--gov-primary)]">Full Platform Picture</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#3c475a]">
              Dean-only institutional analytics, accountability reporting, platform health, onboarding, cohort engagement, and content oversight.
            </p>
          </header>

          {error ? <p className="rounded border border-[#ffdad6] bg-[#fff4f2] p-4 text-sm font-semibold text-[#ba1a1a]">{error}</p> : null}
          {notice ? <p className="rounded border border-[#b7dfc0] bg-[#f0fff4] p-4 text-sm font-semibold text-[#0a8f31]">{notice}</p> : null}
          {!analytics && !error ? <p className="gov-card rounded-lg p-5 text-[#545f72]">Loading institutional analytics...</p> : null}

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Metric label="KB Quality Score" value={`${health?.knowledge_base_quality_score ?? 0}%`} />
            <Metric label="Escalation Resolution" value={`${health?.escalation_resolution_rate ?? 0}%`} />
            <Metric label="AI Quality This Week" value={`${health?.ai_answer_quality_current_week ?? 0}%`} />
            <Metric label="Previous Week" value={`${health?.ai_answer_quality_previous_week ?? 0}%`} />
            <Metric label="Student Retention 30d" value={`${health?.student_retention_30d ?? 0}%`} />
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
            <Panel title="Department Performance Comparison" subtitle="Escalation rate, KB coverage, announcement frequency, and engagement by department.">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#f2f1f5] text-xs uppercase text-[#3c475a]">
                    <tr><th className="px-4 py-3">Department</th><th className="px-4 py-3">Engagement</th><th className="px-4 py-3">Escalation Rate</th><th className="px-4 py-3">KB</th><th className="px-4 py-3">Announcements</th></tr>
                  </thead>
                  <tbody>
                    {(analytics?.department_performance || []).map((row) => (
                      <tr key={row.department} className="border-t border-[var(--gov-outline)]">
                        <td className="px-4 py-3 font-bold text-[var(--gov-primary)]">{row.department}</td>
                        <td className="px-4 py-3">{row.engagement_rate}%</td>
                        <td className="px-4 py-3">{row.escalation_rate}%</td>
                        <td className="px-4 py-3">{row.knowledge_entries}</td>
                        <td className="px-4 py-3">{row.announcement_frequency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
            <Panel title="Summary Reports" subtitle="Narrative weekly and monthly health summaries.">
              <div className="space-y-4">
                <div className="rounded border border-[var(--gov-outline)] p-4"><strong>Weekly</strong><p className="mt-2 text-sm text-[#3c475a]">{analytics?.summary_reports.weekly || "No weekly summary yet."}</p></div>
                <div className="rounded border border-[var(--gov-outline)] p-4"><strong>Monthly</strong><p className="mt-2 text-sm text-[#3c475a]">{analytics?.summary_reports.monthly || "No monthly summary yet."}</p></div>
              </div>
            </Panel>
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <Panel title="Lecturer Engagement Report" subtitle="Names are visible to the dean for institutional accountability.">
              <div className="space-y-3">
                {(analytics?.lecturer_engagement || []).map((row) => (
                  <div key={row.id} className="rounded border border-[var(--gov-outline)] p-4">
                    <div className="flex flex-wrap justify-between gap-3"><strong className="text-[var(--gov-primary)]">{row.name}</strong><span className={row.has_not_posted_30d || row.unanswered_escalations_over_48h ? "text-sm font-bold text-[#ba1a1a]" : "text-sm font-bold text-[#2e7d32]"}>{row.has_not_posted_30d ? "No post in 30d" : "Posting"}</span></div>
                    <p className="mt-1 text-xs text-[#545f72]">{row.department || "No department"} - {row.level || "?"}L | {row.announcements_last_30d} posts in 30d | {row.unanswered_escalations_over_48h} unanswered &gt;48h</p>
                  </div>
                ))}
                {!analytics?.lecturer_engagement?.length ? <p className="text-sm text-[#545f72]">No lecturer records.</p> : null}
              </div>
            </Panel>
            <Panel title="Admin Activity Report" subtitle="Actions each admin has taken in the last 30 days.">
              <div className="space-y-3">
                {(analytics?.admin_activity_report || []).map((row) => (
                  <div key={row.id} className="flex justify-between gap-3 rounded border border-[var(--gov-outline)] p-4">
                    <div><strong className="text-[var(--gov-primary)]">{row.name}</strong><p className="mt-1 text-xs text-[#545f72]">{row.email} | Last action: {formatDate(row.last_action_at)}</p></div>
                    <strong>{row.actions_last_30d}</strong>
                  </div>
                ))}
                {!analytics?.admin_activity_report?.length ? <p className="text-sm text-[#545f72]">No admin activity.</p> : null}
              </div>
            </Panel>
          </section>

          <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
            <Panel title="Onboarding Completion Funnel" subtitle="Registration to completed profile.">
              <div className="space-y-4">
                {(analytics?.onboarding_funnel || []).map((step) => (
                  <div key={step.step}>
                    <p className="flex justify-between text-sm font-bold"><span>{step.step}</span><span>{step.count}</span></p>
                    <div className="mt-2 h-2 rounded bg-[#e3e2e6]"><div className="h-2 rounded bg-[var(--gov-primary)]" style={{ width: `${Math.min(100, step.count)}%` }} /></div>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="Lowest Engagement Cohorts" subtitle="Departments and levels where the dean may ask lecturers to encourage adoption.">
              <div className="grid gap-3 md:grid-cols-2">
                {lowEngagement.map((row) => (
                  <div key={`${row.department}-${row.level}`} className="rounded border border-[var(--gov-outline)] p-4">
                    <strong className="text-[var(--gov-primary)]">{row.department} - {row.level}L</strong>
                    <p className="mt-1 text-sm text-[#545f72]">{row.active_30d}/{row.students} active in 30 days</p>
                    <p className="mt-2 text-xl font-black">{row.engagement_rate}%</p>
                  </div>
                ))}
              </div>
            </Panel>
          </section>

          <section className="space-y-5 border-t border-[var(--gov-outline)] pt-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#545f72]">Content oversight</p>
              <h2 className="mt-2 text-2xl font-black text-[var(--gov-primary)]">Announcements, Knowledge, Escalations, and Deleted Content</h2>
            </div>
            <section className="grid gap-6 xl:grid-cols-2">
              <Panel title="All Announcements, All States" subtitle="Draft, scheduled, published, and expired across all roles.">
                <div className="max-h-[420px] space-y-3 overflow-auto pr-1">
                  {(oversight?.all_announcements || []).map((item) => (
                    <div key={item.id} className="rounded border border-[var(--gov-outline)] p-3">
                      <div className="flex justify-between gap-3"><strong>{item.title}</strong><span className="rounded bg-[#efedf1] px-2 py-1 text-xs font-bold uppercase">{item.status || item.computed_state || "published"}</span></div>
                      <p className="mt-1 text-xs text-[#545f72]">{item.created_by_role || "staff"} | {formatDate(item.created_at)}</p>
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel title="Knowledge Base Quality Indicators" subtitle="Retrieval count and average similarity by entry.">
                <div className="max-h-[420px] space-y-3 overflow-auto pr-1">
                  {(oversight?.knowledge_base_quality || []).map((item) => (
                    <div key={item.id} className="rounded border border-[var(--gov-outline)] p-3">
                      <div className="flex justify-between gap-3"><strong>{item.category || "General"}</strong><span>{item.retrieval_count} uses</span></div>
                      <p className="mt-1 text-xs text-[#545f72]">Avg similarity: {item.average_similarity} | {item.department || "Unassigned"}</p>
                      <p className="mt-2 line-clamp-2 text-sm text-[#3c475a]">{item.preview}</p>
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel title="Full Escalation History" subtitle="Complete institutional escalation record, not only recent items.">
                <div className="max-h-[420px] space-y-3 overflow-auto pr-1">
                  {(oversight?.full_escalation_history || []).map((item) => (
                    <div key={item.id} className="rounded border border-[var(--gov-outline)] p-3">
                      <div className="flex justify-between gap-3"><strong>{item.status}</strong><span>{item.user_department || "General"} {item.user_level || ""}</span></div>
                      <p className="mt-2 line-clamp-2 text-sm text-[#3c475a]">{item.question}</p>
                      <p className="mt-1 text-xs text-[#545f72]">{formatDate(item.created_at)}</p>
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel title="Deleted Content & Restore" subtitle="Restore supported records from their audit before-snapshot.">
                <div className="max-h-[420px] space-y-3 overflow-auto pr-1">
                  {(oversight?.deleted_content || []).map((log) => (
                    <div key={log.id} className="rounded border border-[#ffdad6] bg-[#fff8f7] p-3">
                      <div className="flex flex-wrap justify-between gap-3"><strong className="text-[#ba1a1a]">{log.action}</strong><span className="text-xs text-[#545f72]">{log.table_name}</span></div>
                      <p className="mt-1 text-xs text-[#545f72]">{formatDate(log.created_at)}</p>
                      <button onClick={() => restore(log.id)} className="mt-3 rounded bg-[var(--gov-primary)] px-3 py-2 text-xs font-bold text-white">Restore</button>
                    </div>
                  ))}
                  {!oversight?.deleted_content?.length ? <p className="text-sm text-[#545f72]">No deleted content records.</p> : null}
                </div>
              </Panel>
            </section>
          </section>
        </div>
      </GovernancePageFrame>
    </GovernanceShell>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="gov-card rounded-lg p-5">
      <h2 className="text-xl font-black text-[var(--gov-primary)]">{title}</h2>
      <p className="mt-1 text-sm text-[#545f72]">{subtitle}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}
