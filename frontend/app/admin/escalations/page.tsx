"use client";

import { useEffect, useMemo, useState } from "react";
import { getEscalations, getFreshAccessToken, type Escalation } from "@/lib/api/admin";

type EscalationMeta = {
  longest_open: Escalation[];
  department_rates: Array<{ department: string; count: number }>;
  unassigned_count: number;
};

function timeOpenLabel(hours = 0) {
  if (hours < 1) return "Less than 1 hour";
  if (hours < 24) return `${hours} hours`;
  return `${Math.round(hours / 24)} days`;
}

export default function AdminEscalationsPage() {
  const [items, setItems] = useState<Escalation[]>([]);
  const [meta, setMeta] = useState<EscalationMeta>({ longest_open: [], department_rates: [], unassigned_count: 0 });
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const result = await getEscalations(await getFreshAccessToken());
      setItems(result.data);
      setMeta(result.meta || { longest_open: [], department_rates: [], unassigned_count: 0 });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not load escalations.";
      setError(message === "Invalid token" || message === "Unauthorized" ? "Your login session expired. Please log out and log in again." : message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const open = items.filter((item) => item.status !== "resolved");
  const unresolved = open.length;
  const resolved = items.length - unresolved;
  const unassigned = useMemo(() => items.filter((item) => item.is_unassigned), [items]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 border-b border-[var(--gov-outline)] pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#545f72]">Escalations</p>
          <h1 className="mt-2 text-3xl font-black text-[var(--gov-primary)]">Escalation Queue</h1>
          <p className="mt-2 text-sm text-[#3c475a]">Monitor unresolved questions and lecturer responses.</p>
        </div>
        <div className="grid grid-cols-4 gap-3 text-center">
          <div className="gov-card rounded p-3"><strong>{open.length}</strong><br /><span className="text-xs text-[#545f72]">Open</span></div>
          <div className="gov-card rounded p-3"><strong>{resolved}</strong><br /><span className="text-xs text-[#545f72]">Resolved</span></div>
          <div className="gov-card rounded p-3"><strong>{meta.unassigned_count}</strong><br /><span className="text-xs text-[#545f72]">Unassigned</span></div>
          <div className="gov-card rounded p-3"><strong>{items.length}</strong><br /><span className="text-xs text-[#545f72]">Total</span></div>
        </div>
      </header>
      {error ? <p className="rounded border border-[#ffdad6] bg-[#fff4f2] p-4 text-sm text-[#ba1a1a]">{error}</p> : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="gov-card rounded-lg p-5 lg:col-span-2">
          <h2 className="text-xl font-bold text-[var(--gov-primary)]">Longest Open</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {meta.longest_open.map((item) => (
              <div key={item.id} className="rounded border border-[var(--gov-outline)] p-4">
                <p className="text-xs font-bold uppercase text-[#ba1a1a]">{timeOpenLabel(item.time_open_hours)} open</p>
                <p className="mt-2 line-clamp-2 text-sm font-bold text-[var(--gov-primary)]">{item.question}</p>
                <p className="mt-2 text-xs text-[#545f72]">{item.user_department || "General"} {item.user_level ? `${item.user_level}L` : ""}</p>
              </div>
            ))}
            {!meta.longest_open.length ? <p className="text-sm text-[#545f72]">No open escalations.</p> : null}
          </div>
        </article>
        <article className="gov-card rounded-lg p-5">
          <h2 className="text-xl font-bold text-[var(--gov-primary)]">Department Rates</h2>
          <div className="mt-4 space-y-3">
            {meta.department_rates.map((item) => (
              <div key={item.department}>
                <div className="flex justify-between text-sm"><span>{item.department}</span><strong>{item.count}</strong></div>
                <div className="mt-1 h-2 rounded bg-[#e3e2e6]"><div className="h-full rounded bg-[var(--gov-primary)]" style={{ width: `${Math.max(8, Math.min(100, (item.count / Math.max(1, items.length)) * 100))}%` }} /></div>
              </div>
            ))}
            {!meta.department_rates.length ? <p className="text-sm text-[#545f72]">No department data yet.</p> : null}
          </div>
        </article>
      </section>

      {unassigned.length ? (
        <section className="rounded-lg border border-[#ffdad6] bg-[#fff8f7] p-5">
          <h2 className="text-lg font-bold text-[#ba1a1a]">Unassigned Escalations</h2>
          <p className="mt-1 text-sm text-[#7a271f]">These came from departments/levels with no matching lecturer assignment or no assigned lecturer.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {unassigned.map((item) => (
              <div key={item.id} className="rounded border border-[#ffdad6] bg-white p-4">
                <p className="text-sm font-bold text-[var(--gov-primary)]">{item.question}</p>
                <p className="mt-2 text-xs text-[#545f72]">{item.user_department || "General"} {item.user_level ? `${item.user_level}L` : ""} | {timeOpenLabel(item.time_open_hours)} open</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-4">
        {items.map((item) => (
          <article key={item.id} className="gov-card rounded-lg p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className={item.status === "resolved" ? "rounded bg-[#e8f5e9] px-3 py-1 text-xs font-bold uppercase text-[#0a8f31]" : "rounded bg-[#ffdad6] px-3 py-1 text-xs font-bold uppercase text-[#ba1a1a]"}>{item.status}</span>
                <h2 className="mt-4 text-lg font-bold text-[var(--gov-primary)]">{item.question}</h2>
                <p className="mt-2 text-sm text-[#3c475a]">
                  {item.student_first_name ? `${item.student_first_name} - ` : ""}{item.user_department || "General"} {item.user_level ? `${item.user_level}L` : ""} | Open: {timeOpenLabel(item.time_open_hours)}
                </p>
                <p className="mt-1 text-xs text-[#545f72]">
                  Assigned lecturer: {item.assigned_lecturer?.name || "None"} {item.is_unassigned ? " | No matching lecturer assignment" : ""}
                </p>
                <p className="mt-1 text-xs text-[#545f72]">
                  Similar questions from this student: {item.similar_question_count ?? 0}
                </p>
              </div>
              <p className="text-xs text-[#545f72]">{item.created_at ? new Date(item.created_at).toLocaleString() : ""}</p>
            </div>
            {item.context ? <p className="mt-4 rounded border border-[var(--gov-outline)] bg-white p-4 text-xs text-[#545f72]">RAG context: {item.context}</p> : null}
            {item.admin_response ? (
              <div className="mt-4 rounded bg-[#f4f3f7] p-4">
                <p className="text-xs font-bold uppercase text-[#545f72]">Resolution content</p>
                <p className="mt-2 text-sm text-[#3c475a]">{item.admin_response}</p>
              </div>
            ) : (
              <p className="mt-4 rounded bg-[#fff8e1] p-4 text-sm text-[#8a5a00]">No resolution content yet.</p>
            )}
          </article>
        ))}
        {!items.length && !error ? <p className="gov-card rounded-lg p-5 text-[#545f72]">No escalations found.</p> : null}
      </section>
    </div>
  );
}
