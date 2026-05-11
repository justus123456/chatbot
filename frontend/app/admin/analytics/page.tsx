"use client";

import { useEffect, useState } from "react";
import { getAdminAnalytics, getFreshAccessToken, type AdminAnalytics } from "@/lib/api/admin";

export default function AdminAnalyticsPage() {
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getFreshAccessToken()
      .then((token) => getAdminAnalytics(token))
      .then(setAnalytics)
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load analytics."));
  }, []);

  const counts = analytics?.counts || {};
  const userAnalytics = analytics?.user_analytics;
  const contentAnalytics = analytics?.content_analytics;
  const aiAnalytics = analytics?.ai_knowledge_analytics;
  const escalationAnalytics = analytics?.escalation_analytics;
  const calendarEngagement = analytics?.calendar_engagement_analytics;
  const notificationAnalytics = analytics?.notification_analytics;
  const whatsappAnalytics = analytics?.whatsapp_analytics;

  return (
    <div className="space-y-6">
      <header className="border-b border-[var(--gov-outline)] pb-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#545f72]">Analytics</p>
        <h1 className="mt-2 text-3xl font-black text-[var(--gov-primary)]">Platform Analytics</h1>
        <p className="mt-2 text-sm text-[#3c475a]">Live administrative metrics from Supabase.</p>
      </header>
      {error ? <p className="rounded border border-[#ffdad6] bg-[#fff4f2] p-4 text-sm text-[#ba1a1a]">{error}</p> : null}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Metric label="Total Registered" value={userAnalytics?.total_registered ?? counts.users ?? 0} />
        <Metric label="New This Week" value={userAnalytics?.new_registrations_week ?? 0} />
        <Metric label="New This Month" value={userAnalytics?.new_registrations_month ?? 0} />
        <Metric label="Profile Completion" value={`${userAnalytics?.profile_completion_rate ?? 0}%`} />
        <Metric label="Incomplete Profiles" value={userAnalytics?.users_without_profile_complete ?? 0} tone="warn" />
        {!analytics ? <p className="gov-card rounded-lg p-5 text-[#545f72]">Loading analytics...</p> : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Active Last 7 Days" value={userAnalytics?.active_7_days ?? 0} />
        <Metric label="Active Last 30 Days" value={userAnalytics?.active_30_days ?? 0} />
        <Metric label="Active Last 90 Days" value={userAnalytics?.active_90_days ?? 0} />
        <Metric label="Inactive Over 30 Days" value={userAnalytics?.inactive_30_days ?? 0} tone="warn" />
      </section>

      <section className="gov-card rounded-lg p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-[var(--gov-primary)]">Onboarding Completion</h2>
            <p className="text-sm text-[#545f72]">Users with completed profile versus users stuck before completing onboarding.</p>
          </div>
          <strong className="text-3xl text-[var(--gov-primary)]">{userAnalytics?.profile_completion_rate ?? 0}%</strong>
        </div>
        <div className="mt-5 h-3 overflow-hidden rounded bg-[#e3e2e6]">
          <div className="h-full rounded bg-[var(--gov-primary)]" style={{ width: `${Math.min(100, userAnalytics?.profile_completion_rate ?? 0)}%` }} />
        </div>
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <p className="rounded bg-[#e8f5e9] p-3 text-[#0a8f31]"><strong>{userAnalytics?.profile_complete ?? 0}</strong> complete profiles</p>
          <p className="rounded bg-[#fff8e1] p-3 text-[#8a5a00]"><strong>{userAnalytics?.profile_incomplete ?? 0}</strong> incomplete profiles</p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Breakdown title="Users By Department" data={analytics?.departments || {}} />
        <Breakdown title="Users By Level" data={analytics?.levels || {}} />
        <Breakdown title="Users By Role" data={analytics?.roles || {}} />
      </section>

      <section className="space-y-5 border-t border-[var(--gov-outline)] pt-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#545f72]">Content Analytics</p>
          <h2 className="mt-2 text-2xl font-black text-[var(--gov-primary)]">Announcements Performance</h2>
          <p className="mt-2 text-sm text-[#3c475a]">Announcement volume, role breakdown, publishing delay, notification open rates, and expired-feed hygiene.</p>
        </div>
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Metric label="Posted This Week" value={contentAnalytics?.announcements_this_week ?? 0} />
          <Metric label="Posted This Month" value={contentAnalytics?.announcements_this_month ?? 0} />
          <Metric label="All Time" value={contentAnalytics?.announcements_all_time ?? 0} />
          <Metric label="Avg Publish Delay" value={`${contentAnalytics?.average_creation_to_publish_hours ?? 0}h`} />
          <Metric label="Expired Still Visible" value={contentAnalytics?.expired_visible_count ?? 0} tone="warn" />
        </section>
        <section className="grid gap-6 xl:grid-cols-3">
          <Breakdown title="Announcements By Role" data={contentAnalytics?.announcement_role_breakdown || {}} />
          <div className="gov-card rounded-lg p-5">
            <h3 className="text-xl font-bold text-[var(--gov-primary)]">Highest Notification Open Rate</h3>
            <div className="mt-5 space-y-4">
              {(contentAnalytics?.highest_notification_open_rates || []).map((item) => (
                <div key={item.announcement}>
                  <p className="flex justify-between gap-3 text-sm font-bold">
                    <span className="line-clamp-1">{item.announcement}</span>
                    <span>{item.open_rate}%</span>
                  </p>
                  <p className="mt-1 text-xs text-[#545f72]">{item.read} read / {item.sent} sent</p>
                  <div className="mt-2 h-2 rounded bg-[#e3e2e6]">
                    <div className="h-2 rounded bg-[var(--gov-primary)]" style={{ width: `${Math.min(100, item.open_rate)}%` }} />
                  </div>
                </div>
              ))}
              {!contentAnalytics?.highest_notification_open_rates?.length ? <p className="text-sm text-[#545f72]">No announcement notification reads yet.</p> : null}
            </div>
          </div>
          <div className="gov-card rounded-lg p-5">
            <h3 className="text-xl font-bold text-[var(--gov-primary)]">Expired Feed Hygiene</h3>
            <div className="mt-5 space-y-3">
              {(contentAnalytics?.expired_announcements_visible || []).map((item) => (
                <div key={item.id} className="rounded border border-[#ffdad6] bg-[#fff8f7] p-3">
                  <p className="text-sm font-bold text-[#ba1a1a]">{item.title}</p>
                  <p className="mt-1 text-xs text-[#7a271f]">Expired {item.expires_at} | Status: {item.status}</p>
                </div>
              ))}
              {!contentAnalytics?.expired_announcements_visible?.length ? <p className="text-sm text-[#545f72]">No expired announcements are showing as active.</p> : null}
            </div>
          </div>
        </section>
      </section>

      <section className="space-y-5 border-t border-[var(--gov-outline)] pt-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#545f72]">AI & Knowledge Base Analytics</p>
          <h2 className="mt-2 text-2xl font-black text-[var(--gov-primary)]">Assistant Quality Signals</h2>
          <p className="mt-2 text-sm text-[#3c475a]">Chat volume, answer source mix, escalation rate, retrieval similarity, knowledge gaps, and student document storage.</p>
        </div>
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Metric label="Chats This Week" value={aiAnalytics?.chat_messages_week ?? 0} />
          <Metric label="Chats This Month" value={aiAnalytics?.chat_messages_month ?? 0} />
          <Metric label="KB Answer Rate" value={`${aiAnalytics?.knowledge_base_answer_rate ?? 0}%`} />
          <Metric label="LLM Answer Rate" value={`${aiAnalytics?.llm_answer_rate ?? 0}%`} />
          <Metric label="Escalation Rate" value={`${aiAnalytics?.escalation_rate ?? 0}%`} tone="warn" />
        </section>
        <section className="grid gap-4 md:grid-cols-3">
          <Metric label="Average Similarity" value={aiAnalytics?.average_similarity_score ?? 0} />
          <Metric label="Student Documents" value={aiAnalytics?.student_documents_uploaded ?? 0} />
          <Metric label="Storage Used" value={formatBytes(aiAnalytics?.student_document_storage_bytes ?? 0)} />
        </section>
        <section className="grid gap-6 xl:grid-cols-3">
          <Breakdown title="Answer Source Mix" data={aiAnalytics?.source_counts || {}} />
          <Breakdown title="KB Entries By Category" data={aiAnalytics?.knowledge_base_by_category || {}} />
          <Breakdown title="KB Entries By Department" data={aiAnalytics?.knowledge_base_by_department || {}} />
        </section>
        <section className="grid gap-6 xl:grid-cols-2">
          <div className="gov-card rounded-lg p-5">
            <h3 className="text-xl font-bold text-[var(--gov-primary)]">Low-Confidence / Escalated Questions</h3>
            <p className="mt-1 text-sm text-[#545f72]">Aggregated question text only, used to decide what knowledge base content to add next.</p>
            <div className="mt-5 space-y-3">
              {(aiAnalytics?.low_confidence_questions || []).map((item) => (
                <div key={item.question} className="rounded border border-[var(--gov-outline)] p-3">
                  <p className="text-sm font-bold text-[var(--gov-primary)]">{item.question}</p>
                  <p className="mt-1 text-xs text-[#545f72]">{item.count} occurrence{item.count === 1 ? "" : "s"}</p>
                </div>
              ))}
              {!aiAnalytics?.low_confidence_questions?.length ? <p className="text-sm text-[#545f72]">No low-confidence questions yet.</p> : null}
            </div>
          </div>
          <div className="gov-card rounded-lg p-5">
            <h3 className="text-xl font-bold text-[var(--gov-primary)]">Never Retrieved Entries</h3>
            <p className="mt-1 text-sm text-[#545f72]">
              {aiAnalytics?.retrieval_tracking_active ? "Entries not seen in retrieval logs." : "Retrieval tracking starts after running the updated SQL and restarting Flask."}
            </p>
            <div className="mt-5 space-y-3">
              {(aiAnalytics?.never_retrieved_entries || []).map((item) => (
                <div key={item.id} className="rounded border border-[var(--gov-outline)] p-3">
                  <p className="text-xs font-bold uppercase text-[#545f72]">{item.category} | {item.source}</p>
                  <p className="mt-2 text-sm text-[#3c475a]">{item.preview || "No preview"}</p>
                </div>
              ))}
              {!aiAnalytics?.never_retrieved_entries?.length ? <p className="text-sm text-[#545f72]">No unretrieved entries detected.</p> : null}
            </div>
          </div>
        </section>
      </section>

      <section className="space-y-5 border-t border-[var(--gov-outline)] pt-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#545f72]">Escalation Analytics</p>
          <h2 className="mt-2 text-2xl font-black text-[var(--gov-primary)]">Resolution & Knowledge Gap Signals</h2>
          <p className="mt-2 text-sm text-[#3c475a]">Track escalation pressure, lecturer response performance, and common topics that need knowledge base coverage.</p>
        </div>
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Metric label="Escalations This Week" value={escalationAnalytics?.escalations_this_week ?? 0} />
          <Metric label="Escalations This Month" value={escalationAnalytics?.escalations_this_month ?? 0} />
          <Metric label="Avg Response Time" value={`${escalationAnalytics?.average_response_hours ?? 0}h`} />
          <Metric label="Resolved <= 24h" value={`${escalationAnalytics?.resolved_within_24h_percent ?? 0}%`} />
          <Metric label="Beyond 48h" value={`${escalationAnalytics?.resolved_beyond_48h_percent ?? 0}%`} tone="warn" />
        </section>
        <section className="grid gap-6 xl:grid-cols-3">
          <Breakdown title="Escalations By Department" data={escalationAnalytics?.escalations_by_department || {}} />
          <Breakdown title="Resolution Bands" data={escalationAnalytics?.resolution_bands || {}} />
          <div className="gov-card rounded-lg p-5">
            <h3 className="text-xl font-bold text-[var(--gov-primary)]">Lecturer Response Rate</h3>
            <p className="mt-1 text-sm text-[#545f72]">Anonymized ranking. Admin can inspect a department for names when needed.</p>
            <div className="mt-5 space-y-4">
              {(escalationAnalytics?.lecturer_response_rates || []).map((item) => (
                <div key={item.lecturer_ref}>
                  <p className="flex justify-between text-sm font-bold">
                    <span>{item.lecturer_ref}</span>
                    <span>{item.response_rate}%</span>
                  </p>
                  <p className="mt-1 text-xs text-[#545f72]">{item.resolved} resolved / {item.assigned} assigned</p>
                  <div className="mt-2 h-2 rounded bg-[#e3e2e6]">
                    <div className="h-2 rounded bg-[var(--gov-primary)]" style={{ width: `${Math.min(100, item.response_rate)}%` }} />
                  </div>
                </div>
              ))}
              {!escalationAnalytics?.lecturer_response_rates?.length ? <p className="text-sm text-[#545f72]">No assigned lecturer escalations yet.</p> : null}
            </div>
          </div>
        </section>
        <section className="gov-card rounded-lg p-5">
          <h3 className="text-xl font-bold text-[var(--gov-primary)]">Most Common Escalation Topics</h3>
          <p className="mt-1 text-sm text-[#545f72]">Use these topics to add proactive knowledge base entries.</p>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(escalationAnalytics?.common_topics || []).map((item) => (
              <div key={item.topic} className="rounded border border-[var(--gov-outline)] p-3">
                <p className="text-sm font-bold text-[var(--gov-primary)]">{item.topic}</p>
                <p className="mt-1 text-xs text-[#545f72]">{item.count} escalation{item.count === 1 ? "" : "s"}</p>
              </div>
            ))}
            {!escalationAnalytics?.common_topics?.length ? <p className="text-sm text-[#545f72]">No escalation topics yet.</p> : null}
          </div>
        </section>
      </section>

      <section className="space-y-5 border-t border-[var(--gov-outline)] pt-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#545f72]">Calendar & Engagement</p>
          <h2 className="mt-2 text-2xl font-black text-[var(--gov-primary)]">Student Interaction Signals</h2>
          <p className="mt-2 text-sm text-[#3c475a]">Calendar event views, resource opens, and campus map searches recorded through engagement tracking.</p>
        </div>
        <section className="grid gap-6 xl:grid-cols-3">
          <RankedList title="Calendar Event Views" empty="No calendar view events tracked yet." items={(calendarEngagement?.calendar_event_views || []).map((item) => ({ label: item.event, value: item.views }))} />
          <RankedList title="Most Accessed Resources" empty="No resource opens tracked yet." items={(calendarEngagement?.most_accessed_resources || []).map((item) => ({ label: item.resource, value: item.opens }))} />
          <RankedList title="Campus Map Search Terms" empty="No map searches tracked yet." items={(calendarEngagement?.campus_map_search_terms || []).map((item) => ({ label: item.term, value: item.count }))} />
        </section>
      </section>

      <section className="space-y-5 border-t border-[var(--gov-outline)] pt-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#545f72]">Notification Analytics</p>
          <h2 className="mt-2 text-2xl font-black text-[var(--gov-primary)]">Delivery & Read Signals</h2>
        </div>
        <section className="grid gap-4 md:grid-cols-3">
          <Metric label="Sent This Week" value={notificationAnalytics?.notifications_sent_this_week ?? 0} />
          <Metric label="Delivery Success" value={`${notificationAnalytics?.delivery_success_rate ?? 0}%`} />
          <Metric label="Never Read" value={notificationAnalytics?.unread_notifications ?? 0} tone="warn" />
        </section>
        <section className="grid gap-6 xl:grid-cols-2">
          <Breakdown title="Notifications By Type" data={notificationAnalytics?.notifications_by_type || {}} />
          <Breakdown title="Read Rate By Type" data={notificationAnalytics?.read_rate_by_type || {}} />
        </section>
      </section>

      <section className="space-y-5 border-t border-[var(--gov-outline)] pt-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#545f72]">WhatsApp Integration</p>
          <h2 className="mt-2 text-2xl font-black text-[var(--gov-primary)]">Channel Health</h2>
        </div>
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Metric label="Incoming Messages" value={whatsappAnalytics?.incoming_messages ?? 0} />
          <Metric label="Parsed Successfully" value={whatsappAnalytics?.parsed_successfully ?? 0} />
          <Metric label="Failed Parses" value={whatsappAnalytics?.failed_parses ?? 0} tone="warn" />
          <Metric label="Outgoing Responses" value={whatsappAnalytics?.outgoing_messages ?? 0} />
          <Metric label="Web Chat Messages" value={whatsappAnalytics?.web_chat_messages ?? 0} />
        </section>
        <Breakdown title="WhatsApp Volume Versus Web Platform" data={whatsappAnalytics?.whatsapp_vs_web || {}} />
      </section>
    </div>
  );
}

function Metric({ label, value, tone = "normal" }: { label: string; value: string | number; tone?: "normal" | "warn" }) {
  return (
    <div className="gov-card rounded-lg p-5">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#545f72]">{label}</p>
      <h2 className={tone === "warn" ? "mt-2 text-3xl font-black text-[#ba1a1a]" : "mt-2 text-3xl font-black text-[var(--gov-primary)]"}>{value}</h2>
    </div>
  );
}

function Breakdown({ title, data }: { title: string; data: Record<string, number> }) {
  const max = Math.max(1, ...Object.values(data));
  return (
    <div className="gov-card rounded-lg p-5">
      <h2 className="text-xl font-bold text-[var(--gov-primary)]">{title}</h2>
      <div className="mt-5 space-y-4">
        {Object.entries(data).map(([label, value]) => (
          <div key={label}>
            <p className="flex justify-between text-sm font-bold"><span>{label}</span><span>{value}</span></p>
            <div className="mt-2 h-2 rounded bg-[#e3e2e6]"><div className="h-2 rounded bg-[var(--gov-primary)]" style={{ width: `${(value / max) * 100}%` }} /></div>
          </div>
        ))}
        {!Object.keys(data).length ? <p className="text-sm text-[#545f72]">No data yet.</p> : null}
      </div>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function RankedList({ title, items, empty }: { title: string; items: Array<{ label: string; value: number }>; empty: string }) {
  return (
    <div className="gov-card rounded-lg p-5">
      <h3 className="text-xl font-bold text-[var(--gov-primary)]">{title}</h3>
      <div className="mt-5 space-y-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3 rounded border border-[var(--gov-outline)] p-3">
            <span className="min-w-0 truncate text-sm font-bold text-[#3c475a]">{item.label}</span>
            <strong className="text-[var(--gov-primary)]">{item.value}</strong>
          </div>
        ))}
        {!items.length ? <p className="text-sm text-[#545f72]">{empty}</p> : null}
      </div>
    </div>
  );
}
