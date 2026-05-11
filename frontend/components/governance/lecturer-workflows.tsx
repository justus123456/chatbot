"use client";

import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  createAdminAnnouncement,
  createAdminCalendarEvent,
  createAdminKnowledgeBaseEntry,
  createAdminResource,
  deleteAdminAnnouncement,
  deleteAdminCalendarEvent,
  deleteAdminResource,
  getAdminAnnouncements,
  getAdminCalendar,
  getAdminKnowledgeBase,
  getAdminResources,
  getEscalations,
  getFreshAccessToken,
  replyToEscalation,
  updateAdminAnnouncement,
  updateAdminCalendarEvent,
  updateAdminKnowledgeBaseEntry,
  updateAdminResource,
  type AdminAnnouncementRow,
  type AdminCalendarRow,
  type Escalation,
  type KnowledgeBaseRow,
  type ResourceRow,
} from "@/lib/api/admin";
import type { User } from "@/lib/types";

type LoadState<T> = { rows: T[]; loading: boolean; error: string; notice: string };

const fieldClass = "w-full rounded border border-[var(--gov-outline)] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--gov-primary)]";
const primaryButton = "rounded bg-[var(--gov-primary)] px-4 py-2 text-sm font-bold text-white hover:opacity-90";
const secondaryButton = "rounded border border-[var(--gov-outline)] px-4 py-2 text-sm font-bold text-[var(--gov-primary)] hover:bg-[#f4f3f7]";
const dangerButton = "rounded border border-[#ba1a1a] px-4 py-2 text-sm font-bold text-[#ba1a1a] hover:bg-[#ffdad6]";

function LockedScope({ user }: { user: User | null }) {
  return (
    <div className="rounded border border-[#bcc7dd] bg-[#f4f7fd] px-4 py-3 text-sm text-[#3c475a]">
      Locked target: <strong>{user?.department || "No department assigned"}</strong> - <strong>{user?.level || "No level assigned"}L</strong>.
      The server also enforces this, so the target cannot be changed from the browser.
    </div>
  );
}

function Message({ error, notice }: { error: string; notice: string }) {
  if (error) return <p className="rounded border border-[#ba1a1a] bg-[#ffdad6] p-3 text-sm font-bold text-[#93000a]">{error}</p>;
  if (notice) return <p className="rounded border border-[#2e7d32] bg-[#e8f5e9] p-3 text-sm font-bold text-[#2e7d32]">{notice}</p>;
  return null;
}

function emptyState(text: string) {
  return <p className="rounded border border-dashed border-[var(--gov-outline)] p-4 text-sm text-[#545f72]">{text}</p>;
}

function dateText(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "No date";
}

function isMine(row: { created_by?: string | null }, user: User | null) {
  return Boolean(row.created_by && user?.id && row.created_by === user.id);
}

export function LecturerAnnouncementsWorkflow({ user }: { user: User | null }) {
  const [state, setState] = useState<LoadState<AdminAnnouncementRow>>({ rows: [], loading: true, error: "", notice: "" });
  const [editing, setEditing] = useState<AdminAnnouncementRow | null>(null);
  const [form, setForm] = useState({ title: "", content: "", status: "published", expires_at: "" });

  async function load() {
    try {
      const token = await getFreshAccessToken();
      const result = await getAdminAnnouncements(token);
      setState({ rows: result.data || [], loading: false, error: "", notice: "" });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : "Could not load announcements." }));
    }
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(row: AdminAnnouncementRow) {
    setEditing(row);
    setForm({ title: row.title || "", content: row.content || "", status: row.status || "published", expires_at: row.expires_at || "" });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const token = await getFreshAccessToken();
      const payload = {
        title: form.title,
        content: form.content,
        status: form.status,
        expires_at: form.expires_at || null,
        target_departments: [user?.department || ""],
        target_levels: [Number(user?.level || 0)],
      };
      if (editing) {
        await updateAdminAnnouncement(editing.id, payload, token);
      } else {
        await createAdminAnnouncement(payload, token);
      }
      setForm({ title: "", content: "", status: "published", expires_at: "" });
      setEditing(null);
      await load();
      setState((current) => ({ ...current, notice: editing ? "Announcement updated and students were notified." : "Announcement published to your assigned cohort." }));
    } catch (error) {
      setState((current) => ({ ...current, error: error instanceof Error ? error.message : "Could not save announcement." }));
    }
  }

  async function remove(row: AdminAnnouncementRow) {
    try {
      const token = await getFreshAccessToken();
      await deleteAdminAnnouncement(row.id, token);
      await load();
      setState((current) => ({ ...current, notice: "Announcement removed and recipients were notified." }));
    } catch (error) {
      setState((current) => ({ ...current, error: error instanceof Error ? error.message : "Could not delete announcement." }));
    }
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <form onSubmit={submit} className="gov-card space-y-4 rounded-lg p-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#545f72]">Lecturer announcements</p>
          <h1 className="mt-2 text-2xl font-black text-[var(--gov-primary)]">{editing ? "Edit cohort announcement" : "Create cohort announcement"}</h1>
        </div>
        <LockedScope user={user} />
        <Message error={state.error} notice={state.notice} />
        <input className={fieldClass} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Announcement title" required />
        <textarea className={`${fieldClass} min-h-36`} value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} placeholder="Write the announcement for your cohort" required />
        <div className="grid gap-3 md:grid-cols-2">
          <select className={fieldClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
          </select>
          <input className={fieldClass} type="date" value={form.expires_at} onChange={(event) => setForm({ ...form, expires_at: event.target.value })} />
        </div>
        <div className="flex gap-3">
          <button className={primaryButton} type="submit">{editing ? "Save changes" : "Publish announcement"}</button>
          {editing ? <button className={secondaryButton} type="button" onClick={() => { setEditing(null); setForm({ title: "", content: "", status: "published", expires_at: "" }); }}>Cancel</button> : null}
        </div>
      </form>

      <div className="gov-card rounded-lg p-5">
        <h2 className="text-xl font-black text-[var(--gov-primary)]">My announcement history</h2>
        <p className="mt-1 text-sm text-[#545f72]">Published, scheduled, and draft notices created by you.</p>
        <div className="mt-5 space-y-3">
          {state.loading ? emptyState("Loading announcements...") : null}
          {!state.loading && !state.rows.length ? emptyState("No announcements created by you yet.") : null}
          {state.rows.map((row) => (
            <article key={row.id} className="rounded border border-[var(--gov-outline)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-black">{row.title}</h3>
                  <p className="mt-1 text-xs font-bold uppercase text-[#545f72]">{row.computed_state || row.status || "published"} - {dateText(row.created_at)}</p>
                </div>
                <div className="flex gap-2">
                  <button className={secondaryButton} onClick={() => startEdit(row)} type="button">Edit</button>
                  <button className={dangerButton} onClick={() => remove(row)} type="button">Delete</button>
                </div>
              </div>
              <p className="mt-3 line-clamp-2 text-sm text-[#3c475a]">{row.content}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function LecturerScheduleWorkflow({ user }: { user: User | null }) {
  const [state, setState] = useState<LoadState<AdminCalendarRow>>({ rows: [], loading: true, error: "", notice: "" });
  const [editing, setEditing] = useState<AdminCalendarRow | null>(null);
  const [form, setForm] = useState({ title: "", event_type: "event", start_date: "", end_date: "", description: "" });

  async function load() {
    try {
      const token = await getFreshAccessToken();
      const result = await getAdminCalendar(token);
      setState({ rows: result.data || [], loading: false, error: "", notice: "" });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : "Could not load schedule." }));
    }
  }

  useEffect(() => {
    load();
  }, []);

  function startEdit(row: AdminCalendarRow) {
    setEditing(row);
    setForm({ title: row.title || "", event_type: row.event_type || "event", start_date: row.start_date || "", end_date: row.end_date || "", description: row.description || "" });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const token = await getFreshAccessToken();
      const payload = {
        ...form,
        end_date: form.end_date || null,
        target_departments: [user?.department || ""],
        target_levels: [Number(user?.level || 0)],
      };
      if (editing) await updateAdminCalendarEvent(editing.id, payload, token);
      else await createAdminCalendarEvent(payload, token);
      setEditing(null);
      setForm({ title: "", event_type: "event", start_date: "", end_date: "", description: "" });
      await load();
      setState((current) => ({ ...current, notice: editing ? "Calendar event updated." : "Calendar event created for your cohort." }));
    } catch (error) {
      setState((current) => ({ ...current, error: error instanceof Error ? error.message : "Could not save calendar event." }));
    }
  }

  async function remove(row: AdminCalendarRow) {
    try {
      const token = await getFreshAccessToken();
      await deleteAdminCalendarEvent(row.id, token);
      await load();
      setState((current) => ({ ...current, notice: "Calendar event deleted." }));
    } catch (error) {
      setState((current) => ({ ...current, error: error instanceof Error ? error.message : "Could not delete calendar event." }));
    }
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
      <form onSubmit={submit} className="gov-card space-y-4 rounded-lg p-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#545f72]">Cohort calendar</p>
          <h1 className="mt-2 text-2xl font-black text-[var(--gov-primary)]">{editing ? "Edit calendar event" : "Create calendar event"}</h1>
        </div>
        <LockedScope user={user} />
        <Message error={state.error} notice={state.notice} />
        <input className={fieldClass} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Event title" required />
        <div className="grid gap-3 md:grid-cols-2">
          <select className={fieldClass} value={form.event_type} onChange={(event) => setForm({ ...form, event_type: event.target.value })}>
            <option value="event">Event</option>
            <option value="deadline">Deadline</option>
            <option value="exam">Exam</option>
            <option value="registration">Registration</option>
          </select>
          <input className={fieldClass} type="date" value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} required />
        </div>
        <input className={fieldClass} type="date" value={form.end_date} onChange={(event) => setForm({ ...form, end_date: event.target.value })} />
        <textarea className={`${fieldClass} min-h-28`} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Description" />
        <button className={primaryButton} type="submit">{editing ? "Save event" : "Create event"}</button>
      </form>
      <RecordList title="My calendar events" rows={state.rows} loading={state.loading} empty="No calendar events created by you yet." render={(row: AdminCalendarRow) => (
        <article key={row.id} className="rounded border border-[var(--gov-outline)] p-4">
          <div className="flex justify-between gap-3">
            <div><h3 className="font-black">{row.title}</h3><p className="mt-1 text-xs text-[#545f72]">{row.event_type || "event"} - {row.start_date}</p></div>
            <div className="flex gap-2"><button className={secondaryButton} onClick={() => startEdit(row)} type="button">Edit</button><button className={dangerButton} onClick={() => remove(row)} type="button">Delete</button></div>
          </div>
          {row.description ? <p className="mt-3 text-sm text-[#3c475a]">{row.description}</p> : null}
        </article>
      )} />
    </section>
  );
}

function RecordList<T>({ title, rows, loading, empty, render }: { title: string; rows: T[]; loading: boolean; empty: string; render: (row: T) => ReactNode }) {
  return (
    <div className="gov-card rounded-lg p-5">
      <h2 className="text-xl font-black text-[var(--gov-primary)]">{title}</h2>
      <div className="mt-5 space-y-3">
        {loading ? emptyState("Loading records...") : null}
        {!loading && !rows.length ? emptyState(empty) : null}
        {rows.map(render)}
      </div>
    </div>
  );
}

export function LecturerKnowledgeWorkflow({ user }: { user: User | null }) {
  const [state, setState] = useState<LoadState<KnowledgeBaseRow>>({ rows: [], loading: true, error: "", notice: "" });
  const [editing, setEditing] = useState<KnowledgeBaseRow | null>(null);
  const [form, setForm] = useState({ category: "general", source: "lecturer_entry", content: "" });

  async function load() {
    try {
      const token = await getFreshAccessToken();
      const result = await getAdminKnowledgeBase(token);
      setState({ rows: result.data || [], loading: false, error: "", notice: "" });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : "Could not load knowledge base." }));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const token = await getFreshAccessToken();
      if (editing) await updateAdminKnowledgeBaseEntry(editing.id, form, token);
      else await createAdminKnowledgeBaseEntry(form, token);
      setEditing(null);
      setForm({ category: "general", source: "lecturer_entry", content: "" });
      await load();
      setState((current) => ({ ...current, notice: editing ? "Knowledge entry updated." : "Knowledge entry created for your department." }));
    } catch (error) {
      setState((current) => ({ ...current, error: error instanceof Error ? error.message : "Could not save knowledge entry." }));
    }
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
      <form onSubmit={submit} className="gov-card space-y-4 rounded-lg p-5">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#545f72]">Knowledge base</p><h1 className="mt-2 text-2xl font-black text-[var(--gov-primary)]">{editing ? "Edit my knowledge entry" : "Create knowledge entry"}</h1></div>
        <LockedScope user={user} />
        <Message error={state.error} notice={state.notice} />
        <div className="grid gap-3 md:grid-cols-2">
          <input className={fieldClass} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="Category" required />
          <input className={fieldClass} value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} placeholder="Source" required />
        </div>
        <textarea className={`${fieldClass} min-h-44`} value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} placeholder="Official answer or reusable student guidance" required />
        <button className={primaryButton} type="submit">{editing ? "Save entry" : "Create entry"}</button>
      </form>
      <RecordList title="Department knowledge entries" rows={state.rows} loading={state.loading} empty="No department knowledge entries loaded." render={(row) => (
        <article key={row.id} className="rounded border border-[var(--gov-outline)] p-4">
          <div className="flex justify-between gap-3">
            <div><h3 className="font-black">{row.category || "general"}</h3><p className="mt-1 text-xs text-[#545f72]">{row.source || "manual"} - {row.embedding_status || "not indexed"}</p></div>
            {isMine(row, user) ? <button className={secondaryButton} onClick={() => { setEditing(row); setForm({ category: row.category || "general", source: row.source || "lecturer_entry", content: row.content || "" }); }} type="button">Edit</button> : null}
          </div>
          <p className="mt-3 line-clamp-3 text-sm text-[#3c475a]">{row.content}</p>
        </article>
      )} />
    </section>
  );
}

export function LecturerResourcesWorkflow({ user }: { user: User | null }) {
  const [state, setState] = useState<LoadState<ResourceRow>>({ rows: [], loading: true, error: "", notice: "" });
  const [editing, setEditing] = useState<ResourceRow | null>(null);
  const [form, setForm] = useState({ title: "", file_url: "", type: "material" as ResourceRow["type"], description: "" });

  async function load() {
    try {
      const token = await getFreshAccessToken();
      const result = await getAdminResources(token);
      setState({ rows: result.data || [], loading: false, error: "", notice: "" });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : "Could not load resources." }));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const token = await getFreshAccessToken();
      const payload = { ...form, department: user?.department || null, level: Number(user?.level || 0) || null };
      if (editing) await updateAdminResource(editing.id, payload, token);
      else await createAdminResource(payload, token);
      setEditing(null);
      setForm({ title: "", file_url: "", type: "material", description: "" });
      await load();
      setState((current) => ({ ...current, notice: editing ? "Resource updated." : "Resource uploaded for your cohort." }));
    } catch (error) {
      setState((current) => ({ ...current, error: error instanceof Error ? error.message : "Could not save resource." }));
    }
  }

  async function remove(row: ResourceRow) {
    try {
      const token = await getFreshAccessToken();
      await deleteAdminResource(row.id, token);
      await load();
      setState((current) => ({ ...current, notice: "Resource deleted." }));
    } catch (error) {
      setState((current) => ({ ...current, error: error instanceof Error ? error.message : "Could not delete resource." }));
    }
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
      <form onSubmit={submit} className="gov-card space-y-4 rounded-lg p-5">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#545f72]">Resources</p><h1 className="mt-2 text-2xl font-black text-[var(--gov-primary)]">{editing ? "Edit resource" : "Upload resource link"}</h1></div>
        <LockedScope user={user} />
        <Message error={state.error} notice={state.notice} />
        <input className={fieldClass} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Resource title" required />
        <input className={fieldClass} value={form.file_url} onChange={(event) => setForm({ ...form, file_url: event.target.value })} placeholder="File URL" required />
        <select className={fieldClass} value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as ResourceRow["type"] })}>
          <option value="material">Material</option>
          <option value="past_question">Past question</option>
        </select>
        <textarea className={`${fieldClass} min-h-28`} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Description" required />
        <button className={primaryButton} type="submit">{editing ? "Save resource" : "Create resource"}</button>
      </form>
      <RecordList title="My uploaded resources" rows={state.rows} loading={state.loading} empty="No resources uploaded by you yet." render={(row) => (
        <article key={row.id} className="rounded border border-[var(--gov-outline)] p-4">
          <div className="flex justify-between gap-3">
            <div><h3 className="font-black">{row.title}</h3><p className="mt-1 text-xs text-[#545f72]">{row.type} - {row.file_url}</p></div>
            <div className="flex gap-2"><button className={secondaryButton} onClick={() => { setEditing(row); setForm({ title: row.title, file_url: row.file_url, type: row.type, description: row.description }); }} type="button">Edit</button><button className={dangerButton} onClick={() => remove(row)} type="button">Delete</button></div>
          </div>
          <p className="mt-3 text-sm text-[#3c475a]">{row.description}</p>
        </article>
      )} />
    </section>
  );
}

export function LecturerEscalationsWorkflow() {
  const [state, setState] = useState<LoadState<Escalation>>({ rows: [], loading: true, error: "", notice: "" });
  const [reply, setReply] = useState<Record<string, string>>({});

  async function load() {
    try {
      const token = await getFreshAccessToken();
      const result = await getEscalations(token);
      setState({ rows: result.data || [], loading: false, error: "", notice: "" });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : "Could not load escalations." }));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function submitReply(id: string) {
    try {
      const response = (reply[id] || "").trim();
      if (!response) return;
      const token = await getFreshAccessToken();
      await replyToEscalation(id, response, token);
      setReply((current) => ({ ...current, [id]: "" }));
      await load();
      setState((current) => ({ ...current, notice: "Escalation answered and saved into the knowledge base." }));
    } catch (error) {
      setState((current) => ({ ...current, error: error instanceof Error ? error.message : "Could not send response." }));
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#545f72]">Academic escalations</p>
          <h1 className="mt-2 text-3xl font-black text-[var(--gov-primary)]">Assigned cohort questions</h1>
          <p className="mt-2 text-sm text-[#3c475a]">Partial student identity only: first name, level, question, context, and similar-question count.</p>
        </div>
        <span className="rounded bg-[#d6e3ff] px-4 py-2 text-sm font-black text-[var(--gov-primary)]">{state.rows.filter((row) => row.status !== "resolved").length} open</span>
      </div>
      <Message error={state.error} notice={state.notice} />
      <div className="grid gap-4">
        {state.loading ? emptyState("Loading escalations...") : null}
        {!state.loading && !state.rows.length ? emptyState("No escalations are assigned to your cohort yet.") : null}
        {state.rows.map((row) => (
          <article key={row.id} className="gov-card rounded-lg p-5">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-[var(--gov-primary)]">{row.student_first_name || "Student"} ({row.user_level || "?"}L)</h2>
                <p className="mt-1 text-xs font-bold uppercase text-[#545f72]">{row.status} - submitted {dateText(row.created_at)} - similar questions: {row.similar_question_count || 0}</p>
              </div>
              <span className="rounded bg-[#efedf1] px-3 py-1 text-xs font-bold">{row.routing_level}</span>
            </div>
            <p className="mt-4 font-semibold">{row.question}</p>
            {row.context ? <p className="mt-3 rounded border border-[var(--gov-outline)] bg-[#f4f3f7] p-3 text-sm text-[#3c475a]">RAG context: {row.context}</p> : null}
            {row.admin_response ? <p className="mt-3 rounded border border-[#bcc7dd] bg-[#f4f7fd] p-3 text-sm text-[#183a66]">Current response: {row.admin_response}</p> : null}
            <div className="mt-4 grid gap-3">
              <textarea className={`${fieldClass} min-h-24`} value={reply[row.id] || ""} onChange={(event) => setReply({ ...reply, [row.id]: event.target.value })} placeholder={row.admin_response ? "Add a follow-up or edit if unread" : "Write the authoritative answer"} />
              <button className={`${primaryButton} justify-self-start`} type="button" onClick={() => submitReply(row.id)}>Send response</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
