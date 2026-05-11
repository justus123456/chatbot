"use client";

import { useEffect, useMemo, useState } from "react";
import { getAdminSystemLogs, getFreshAccessToken, type SystemLogRow } from "@/lib/api/admin";

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function friendlyKey(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function friendlyValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return "Attached data";
  return String(value);
}

function snapshotRows(value?: Record<string, unknown>) {
  if (!value || !Object.keys(value).length) return [];
  const priority = [
    "title",
    "question",
    "admin_response",
    "status",
    "role",
    "department",
    "level",
    "created_by_role",
    "target_departments",
    "target_levels",
    "resolved_at",
    "created_at",
  ];
  const keys = [
    ...priority.filter((key) => Object.prototype.hasOwnProperty.call(value, key)),
    ...Object.keys(value).filter((key) => !priority.includes(key) && !["embedding", "raw_payload"].includes(key)),
  ].slice(0, 10);
  return keys.map((key) => ({ key, value: value[key] }));
}

function changedRows(before?: Record<string, unknown>, after?: Record<string, unknown>) {
  const beforeValue = before || {};
  const afterValue = after || {};
  const keys = Array.from(new Set([...Object.keys(beforeValue), ...Object.keys(afterValue)])).filter((key) => key !== "embedding");
  return keys
    .filter((key) => JSON.stringify(beforeValue[key] ?? null) !== JSON.stringify(afterValue[key] ?? null))
    .slice(0, 12)
    .map((key) => ({ key, before: beforeValue[key], after: afterValue[key] }));
}

export default function AdminSystemLogsPage() {
  const [logs, setLogs] = useState<SystemLogRow[]>([]);
  const [selected, setSelected] = useState<SystemLogRow | null>(null);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const token = await getFreshAccessToken();
      const result = await getAdminSystemLogs(token);
      setLogs(result.data || []);
      setSelected((current) => current || result.data?.[0] || null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load system logs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return logs.filter((log) => {
      const roleOk = role === "all" || log.actor_role === role;
      const text = `${log.action} ${log.table_name} ${log.actor_role || ""} ${log.record_id || ""}`.toLowerCase();
      return roleOk && (!needle || text.includes(needle));
    });
  }, [logs, query, role]);

  const counts = useMemo(() => {
    return {
      total: logs.length,
      admin: logs.filter((log) => log.actor_role === "admin").length,
      dean: logs.filter((log) => log.actor_role === "dean").length,
      lecturer: logs.filter((log) => log.actor_role === "lecturer").length,
    };
  }, [logs]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-[var(--gov-outline)] pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#545f72]">System Logs</p>
          <h1 className="mt-2 text-3xl font-black text-[var(--gov-primary)]">Immutable Audit Log</h1>
          <p className="mt-2 text-sm text-[#3c475a]">
            Admin and dean operational actions from Supabase audit records. Student private chats, documents, notes, goals, and flashcards are not shown here.
          </p>
        </div>
        <button onClick={load} className="rounded bg-[var(--gov-primary)] px-5 py-3 text-sm font-bold text-white">
          Refresh Logs
        </button>
      </header>

      {error ? <p className="rounded border border-[#ffdad6] bg-[#fff4f2] p-4 text-sm font-semibold text-[#ba1a1a]">{error}</p> : null}

      <section className="grid gap-4 md:grid-cols-4">
        <LogStat label="Total records" value={counts.total} />
        <LogStat label="Admin actions" value={counts.admin} />
        <LogStat label="Dean actions" value={counts.dean} />
        <LogStat label="Lecturer actions" value={counts.lecturer} />
      </section>

      <section className="gov-card rounded-lg p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_220px]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="rounded border border-[var(--gov-outline)] bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--gov-primary)]"
            placeholder="Search action, table, role, or record id..."
          />
          <select
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className="rounded border border-[var(--gov-outline)] bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--gov-primary)]"
          >
            <option value="all">All roles</option>
            <option value="admin">Admin</option>
            <option value="dean">Dean</option>
            <option value="lecturer">Lecturer</option>
          </select>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="gov-card overflow-hidden rounded-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-[#f2f1f5] text-xs uppercase text-[#3c475a]">
                <tr>
                  <th className="px-5 py-4">Action</th>
                  <th className="px-5 py-4">Table</th>
                  <th className="px-5 py-4">Role</th>
                  <th className="px-5 py-4">Time</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => (
                  <tr key={log.id} onClick={() => setSelected(log)} className={`cursor-pointer border-t border-[var(--gov-outline)] hover:bg-[#f4f3f7] ${selected?.id === log.id ? "bg-[#d6e3ff]" : ""}`}>
                    <td className="px-5 py-4 font-bold text-[var(--gov-primary)]">{log.action}</td>
                    <td className="px-5 py-4">{log.table_name}</td>
                    <td className="px-5 py-4 capitalize">{log.actor_role || "-"}</td>
                    <td className="px-5 py-4 text-sm text-[#545f72]">{formatDate(log.created_at)}</td>
                  </tr>
                ))}
                {!filtered.length ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-[#545f72]">
                      {loading ? "Loading system logs..." : "No system logs found. Make sure admin_privileges_policies.sql has been run and actions are writing audit logs."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="gov-card h-fit rounded-lg p-5">
          <h2 className="text-xl font-black text-[var(--gov-primary)]">Log Detail</h2>
          {selected ? (
            <div className="mt-5 space-y-4">
              <Detail label="Action" value={selected.action} />
              <Detail label="Table" value={selected.table_name} />
              <Detail label="Actor role" value={selected.actor_role || "-"} />
              <Detail label="Actor ID" value={selected.actor_id || "-"} />
              <Detail label="Record ID" value={selected.record_id || "-"} />
              <Detail label="Time" value={formatDate(selected.created_at)} />
              <ChangeSummary before={selected.before_snapshot} after={selected.after_snapshot} />
              <Snapshot title="Record before action" value={selected.before_snapshot} />
              <Snapshot title="Record after action" value={selected.after_snapshot} />
            </div>
          ) : (
            <p className="mt-4 rounded border border-dashed border-[var(--gov-outline)] p-4 text-sm text-[#545f72]">Select a log row to inspect the before and after snapshots.</p>
          )}
        </aside>
      </section>
    </div>
  );
}

function LogStat({ label, value }: { label: string; value: number }) {
  return (
    <article className="gov-card rounded-lg p-5">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#545f72]">{label}</p>
      <h2 className="mt-2 text-3xl font-black text-[var(--gov-primary)]">{value}</h2>
    </article>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-[var(--gov-outline)] p-3">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#545f72]">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-[var(--gov-primary)]">{value}</p>
    </div>
  );
}

function ChangeSummary({ before, after }: { before?: Record<string, unknown>; after?: Record<string, unknown> }) {
  const rows = changedRows(before, after);
  return (
    <div className="rounded border border-[var(--gov-outline)] bg-[#f8f9fc] p-3">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#545f72]">What changed</p>
      {!rows.length ? <p className="mt-2 text-sm text-[#545f72]">No field changes were recorded for this action.</p> : null}
      <div className="mt-3 space-y-3">
        {rows.map((row) => (
          <div key={row.key} className="rounded bg-white p-3">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--gov-primary)]">{friendlyKey(row.key)}</p>
            <div className="mt-2 grid gap-2 text-sm">
              <p><span className="font-semibold text-[#545f72]">Before:</span> <span className="text-[#1a1c1e]">{friendlyValue(row.before)}</span></p>
              <p><span className="font-semibold text-[#545f72]">After:</span> <span className="text-[#1a1c1e]">{friendlyValue(row.after)}</span></p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Snapshot({ title, value }: { title: string; value?: Record<string, unknown> }) {
  const rows = snapshotRows(value);
  return (
    <div className="rounded border border-[var(--gov-outline)] p-3">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#545f72]">{title}</p>
      {!rows.length ? <p className="mt-2 text-sm text-[#545f72]">No record details were stored for this side of the action.</p> : null}
      {rows.length ? (
        <dl className="mt-3 divide-y divide-[var(--gov-outline)] text-sm">
          {rows.map((row) => (
            <div key={row.key} className="grid gap-1 py-2 sm:grid-cols-[130px_1fr]">
              <dt className="font-semibold text-[#545f72]">{friendlyKey(row.key)}</dt>
              <dd className="break-words text-[#1a1c1e]">{friendlyValue(row.value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
