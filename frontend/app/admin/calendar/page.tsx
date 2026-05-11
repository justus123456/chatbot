"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createAdminCalendarEvent, deleteAdminCalendarEvent, getAdminCalendar, getFreshAccessToken, importAdminCalendarEvents, updateAdminCalendarEvent, type AdminCalendarRow } from "@/lib/api/admin";
import { useCurrentUser } from "@/lib/hooks/use-current-user";

const eventTypes = ["exam", "registration", "holiday", "fee", "event", "deadline"];
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function targetLabel(value: AdminCalendarRow["target_departments"] | AdminCalendarRow["target_levels"]) {
  if (!value || value === "all") return "All";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "All";
  return String(value);
}

export default function AdminCalendarPage() {
  const { user } = useCurrentUser();
  const [events, setEvents] = useState<AdminCalendarRow[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [calendarFileName, setCalendarFileName] = useState("");
  const [calendarFile, setCalendarFile] = useState<File | null>(null);
  const [bulkText, setBulkText] = useState("");
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));

  const days = useMemo(() => getCalendarDays(visibleMonth), [visibleMonth]);
  const eventsByDay = useMemo(() => groupEventsByDay(events), [events]);
  const selectedEvents = eventsByDay.get(selectedDate) || [];
  const upcomingEvents = useMemo(
    () => events.filter((item) => item.start_date >= toDateKey(new Date())).sort((a, b) => a.start_date.localeCompare(b.start_date)).slice(0, 8),
    [events],
  );
  const brokenImportRows = useMemo(() => events.filter((item) => isBrokenCalendarImport(item)), [events]);
  const permissionBlocked = error.toLowerCase().startsWith("forbidden");

  async function loadEvents() {
    setError("");
    try {
      const result = await getAdminCalendar(await getFreshAccessToken());
      setEvents(result.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load school calendar events.");
    }
  }

  useEffect(() => {
    loadEvents();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    const departments = String(form.get("target_departments") || "").split(",").map((item) => item.trim()).filter(Boolean);
    const levels = String(form.get("target_levels") || "").split(",").map((item) => Number(item.trim())).filter(Boolean);
    try {
      await createAdminCalendarEvent(
        {
          title: String(form.get("title") || "").trim(),
          description: String(form.get("description") || "").trim() || null,
          event_type: String(form.get("event_type") || "event"),
          start_date: String(form.get("start_date") || ""),
          end_date: String(form.get("end_date") || "") || null,
          target_departments: departments.length ? departments : "all",
          target_levels: levels.length ? levels : "all",
        },
        await getFreshAccessToken(),
      );
      event.currentTarget.reset();
      loadEvents();
      setNotice("Calendar event created.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create calendar event.");
    } finally {
      setSaving(false);
    }
  }

  async function editEvent(item: AdminCalendarRow) {
    const title = prompt("Event title", item.title);
    if (title === null) return;
    const description = prompt("Description", item.description || "");
    if (description === null) return;
    const startDate = prompt("Start date (YYYY-MM-DD)", item.start_date);
    if (startDate === null) return;
    try {
      await updateAdminCalendarEvent(item.id, { title, description, start_date: startDate }, await getFreshAccessToken());
      loadEvents();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update calendar event.");
    }
  }

  async function removeEvent(item: AdminCalendarRow) {
    if (!confirm(`Delete calendar event "${item.title}"?`)) return;
    try {
      await deleteAdminCalendarEvent(item.id, await getFreshAccessToken());
      setEvents((current) => current.filter((event) => event.id !== item.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete calendar event.");
    }
  }

  async function removeBrokenImportRows() {
    if (!brokenImportRows.length) return;
    if (!confirm(`Delete ${brokenImportRows.length} broken year-only calendar rows?`)) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const token = await getFreshAccessToken();
      for (const item of brokenImportRows) {
        await deleteAdminCalendarEvent(item.id, token);
      }
      setEvents((current) => current.filter((item) => !isBrokenCalendarImport(item)));
      setNotice(`Deleted ${brokenImportRows.length} broken calendar rows. You can re-import the PDF now.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete broken calendar rows.");
    } finally {
      setSaving(false);
    }
  }

  async function removeAllEvents() {
    if (!events.length) return;
    if (!confirm(`Delete all ${events.length} school calendar entries? This removes the imported academic calendar from Supabase.`)) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const token = await getFreshAccessToken();
      for (const item of events) {
        await deleteAdminCalendarEvent(item.id, token);
      }
      setEvents([]);
      setNotice(`Deleted ${events.length} school calendar entries. You can import the corrected academic calendar again.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete calendar entries.");
    } finally {
      setSaving(false);
    }
  }

  function parseBulkRows(text: string) {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separator = line.includes("|") ? "|" : ",";
        const [start_date, event_type, title, description = "", end_date = "", target_departments = "", target_levels = ""] = line.split(separator).map((item) => item.trim());
        return {
          start_date,
          event_type: eventTypes.includes(event_type) ? event_type : "event",
          title,
          description: description || null,
          end_date: end_date || null,
          target_departments: target_departments ? target_departments.split(";").map((item) => item.trim()).filter(Boolean) : "all",
          target_levels: target_levels ? target_levels.split(";").map((item) => Number(item.trim())).filter(Boolean) : "all",
        };
      })
      .filter((row) => row.start_date && row.title);
  }

  async function importSemesterCalendar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const importForm = event.currentTarget;
    const importFormData = new FormData(importForm);
    const defaultYear = String(importFormData.get("default_year") || "");
    setBulkImporting(true);
    setError("");
    setNotice("");
    try {
      const token = await getFreshAccessToken();
      if (calendarFile) {
        const formData = new FormData();
        formData.set("file", calendarFile);
        formData.set("default_year", defaultYear);
        const result = await importAdminCalendarEvents(formData, token);
        setNotice(`Imported ${result.imported} semester calendar events.`);
      } else {
        const rows = parseBulkRows(bulkText);
        if (!rows.length) throw new Error("Add at least one valid calendar row.");
        const formData = new FormData();
        formData.set("text", bulkText);
        formData.set("default_year", defaultYear);
        const result = await importAdminCalendarEvents(formData, token);
        setNotice(`Imported ${result.imported || rows.length} semester calendar events.`);
      }
      setBulkText("");
      setCalendarFile(null);
      setCalendarFileName("");
      importForm.reset();
      await loadEvents();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not import semester calendar.");
    } finally {
      setBulkImporting(false);
    }
  }

  async function readCalendarFile(file?: File) {
    setCalendarFile(file || null);
    setCalendarFileName(file?.name || "");
    if (!file) return;
    if (/\.(txt|csv)$/i.test(file.name)) {
      setBulkText(await file.text());
    } else {
      setBulkText("");
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="space-y-5">
        <header className="border-b border-[var(--gov-outline)] pb-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#545f72]">Calendar</p>
          <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-black text-[var(--gov-primary)]">School Calendar Events</h1>
              <p className="mt-2 text-sm text-[#3c475a]">All calendar entries across departments, levels, and event types.</p>
            </div>
            {!permissionBlocked && events.length ? (
              <button type="button" onClick={removeAllEvents} disabled={saving} className="rounded bg-[#ba1a1a] px-4 py-2 text-sm font-bold text-white shadow-sm disabled:opacity-60">
                Delete All Calendar Entries
              </button>
            ) : null}
          </div>
        </header>
        {error ? (
          <div className="rounded border border-[#ffdad6] bg-[#fff4f2] p-4 text-sm text-[#ba1a1a]">
            <p className="font-bold">{error}</p>
            {permissionBlocked ? (
              <p className="mt-2 leading-6">
                This page is for admin, dean, and lecturer accounts. Your frontend profile role is <strong>{user?.role || "not loaded"}</strong>. If you just changed this account role or updated the code, restart Flask and sign out/in so the server reads the fresh profile.
              </p>
            ) : null}
          </div>
        ) : null}
        {notice ? <p className="rounded border border-[#c7eed4] bg-[#f0fff4] p-4 text-sm text-[#0a8f31]">{notice}</p> : null}
        {brokenImportRows.length ? (
          <section className="rounded border border-[#ffdad6] bg-[#fff4f2] p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-bold text-[#93000a]">Broken import rows detected</p>
                <p className="mt-1 text-sm text-[#7a1b1b]">These are rows titled only like 2025 or 2026 from the earlier bad PDF import. Delete them before re-importing the academic calendar.</p>
              </div>
              <button type="button" onClick={removeBrokenImportRows} disabled={saving} className="rounded bg-[#ba1a1a] px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
                Delete Broken Rows
              </button>
            </div>
          </section>
        ) : null}

        {!permissionBlocked ? <section className="gov-card rounded-lg p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#545f72]">Semester overview</p>
              <h2 className="mt-1 text-2xl font-black text-[var(--gov-primary)]">
                {visibleMonth.toLocaleString("en", { month: "long", year: "numeric" })}
              </h2>
              <p className="mt-1 text-sm text-[#545f72]">Click a day to see registration windows, exams, deadlines, holidays, fees, and events.</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))}
                className="rounded border border-[var(--gov-outline)] bg-white px-4 py-2 text-sm font-bold text-[var(--gov-primary)]"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => setVisibleMonth(startOfMonth(new Date()))}
                className="rounded border border-[var(--gov-outline)] bg-white px-4 py-2 text-sm font-bold text-[var(--gov-primary)]"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))}
                className="rounded bg-[var(--gov-primary)] px-4 py-2 text-sm font-bold text-white"
              >
                Next
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-7 gap-2 text-center text-[11px] font-bold uppercase tracking-[0.16em] text-[#545f72]">
            {weekdays.map((day) => <div key={day}>{day}</div>)}
          </div>

          <div className="mt-3 grid grid-cols-7 gap-2">
            {days.map((day) => {
              const key = toDateKey(day);
              const dayEvents = eventsByDay.get(key) || [];
              const inMonth = day.getMonth() === visibleMonth.getMonth();
              const selected = key === selectedDate;
              const today = key === toDateKey(new Date());

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDate(key)}
                  className={[
                    "min-h-28 rounded border p-2 text-left transition",
                    selected ? "border-[var(--gov-primary)] bg-[#d6e3ff]" : "border-[var(--gov-outline)] bg-white hover:border-[var(--gov-primary)]",
                    inMonth ? "" : "opacity-45",
                  ].join(" ")}
                >
                  <span className={today ? "grid size-7 place-items-center rounded-full bg-[var(--gov-primary)] text-sm font-black text-white" : "text-sm font-black text-[var(--gov-primary)]"}>
                    {day.getDate()}
                  </span>
                  <div className="mt-2 space-y-1">
                    {dayEvents.slice(0, 2).map((item) => (
                      <span key={item.id} className={`block truncate rounded px-2 py-1 text-[10px] font-bold uppercase ${eventTone(item.event_type)}`}>
                        {item.event_type || "event"}: {item.title}
                      </span>
                    ))}
                    {dayEvents.length > 2 ? <span className="block text-[10px] font-bold text-[#545f72]">+{dayEvents.length - 2} more</span> : null}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <section className="rounded border border-[var(--gov-outline)] bg-[#faf9fd] p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#545f72]">Selected day</p>
              <h3 className="mt-1 text-xl font-black text-[var(--gov-primary)]">{formatLongDate(selectedDate)}</h3>
              <div className="mt-4 max-h-[360px] space-y-3 overflow-y-auto pr-1">
                {selectedEvents.map((item) => (
                  <CalendarEventCard key={item.id} item={item} onEdit={editEvent} onDelete={removeEvent} />
                ))}
                {!selectedEvents.length ? (
                  <p className="rounded border border-[var(--gov-outline)] bg-white p-4 text-sm text-[#545f72]">No school calendar event on this date.</p>
                ) : null}
              </div>
            </section>

            <section className="rounded border border-[var(--gov-outline)] bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#545f72]">What is next</p>
              <div className="mt-4 max-h-[360px] space-y-3 overflow-y-auto pr-1">
                {upcomingEvents.map((item) => (
                  <article key={item.id} className="rounded border border-[var(--gov-outline)] p-3">
                    <span className={`inline-block rounded px-2 py-1 text-[10px] font-bold uppercase ${eventTone(item.event_type)}`}>{item.event_type || "event"}</span>
                    <p className="mt-2 font-bold text-[var(--gov-primary)]">{item.title}</p>
                    <p className="mt-1 text-xs text-[#545f72]">{formatDateRange(item)}</p>
                  </article>
                ))}
                {!upcomingEvents.length ? <p className="text-sm text-[#545f72]">No upcoming school events yet.</p> : null}
              </div>
            </section>
          </div>
        </section> : null}

        {!permissionBlocked ? <section className="gov-card overflow-hidden rounded-lg">
          <div className="border-b border-[var(--gov-outline)] bg-[#f2f1f5] px-5 py-3">
            <h2 className="font-bold text-[var(--gov-primary)]">All Calendar Entries</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#f2f1f5] text-xs uppercase text-[#3c475a]">
                <tr>
                  <th className="px-5 py-3">Event</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Department</th>
                  <th className="px-5 py-3">Level</th>
                  <th className="px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {events.map((item) => (
                  <tr key={item.id} className="border-t border-[var(--gov-outline)]">
                    <td className="max-w-[360px] px-5 py-4"><strong className="text-[var(--gov-primary)]">{item.title}</strong><p className="mt-1 text-xs text-[#545f72]">{item.description || "No description"}</p></td>
                    <td className="px-5 py-4 capitalize">{item.event_type || "event"}</td>
                    <td className="px-5 py-4 text-xs text-[#545f72]">{item.start_date}{item.end_date ? ` - ${item.end_date}` : ""}</td>
                    <td className="px-5 py-4 text-xs text-[#545f72]">{targetLabel(item.target_departments)}</td>
                    <td className="px-5 py-4 text-xs text-[#545f72]">{targetLabel(item.target_levels)}</td>
                    <td className="px-5 py-4">
                      <div className="flex gap-2">
                        <button onClick={() => editEvent(item)} className="rounded border border-[var(--gov-outline)] px-3 py-1 text-xs font-bold text-[var(--gov-primary)]">Edit</button>
                        <button onClick={() => removeEvent(item)} className="rounded bg-[#ba1a1a] px-3 py-1 text-xs font-bold text-white">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!events.length ? <tr><td className="px-5 py-5 text-[#545f72]" colSpan={6}>No calendar events found.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section> : null}
      </section>

      {!permissionBlocked ? <aside className="space-y-5">
      <form onSubmit={importSemesterCalendar} className="gov-card rounded-lg p-5">
        <h2 className="text-xl font-bold text-[var(--gov-primary)]">Import Semester Calendar</h2>
        <p className="mt-2 text-sm leading-6 text-[#545f72]">Upload a PDF, DOCX, TXT, or CSV file. The text box below is only for pasting calendar rows manually when you do not want to upload a file.</p>
        <label className="mt-4 block">
          <span className="text-sm font-medium text-[#3c475a]">Calendar year</span>
          <input name="default_year" type="number" defaultValue={visibleMonth.getFullYear()} className="mt-2 w-full rounded border border-[var(--gov-outline)] bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--gov-primary)]" />
          <span className="mt-1 block text-xs leading-5 text-[#545f72]">Needed when the file says dates like "Tuesday, 12 January" without the year.</span>
        </label>
        <label className="mt-4 block rounded border border-dashed border-[var(--gov-outline)] bg-white p-4">
          <span className="block text-xs font-bold uppercase tracking-[0.12em] text-[#545f72]">Semester calendar file</span>
          <input type="file" accept=".pdf,.docx,.txt,.csv" onChange={(event) => readCalendarFile(event.target.files?.[0])} className="mt-2 w-full text-sm text-[#1a1c1e] file:mr-3 file:rounded file:border-0 file:bg-[var(--gov-primary)] file:px-3 file:py-2 file:text-sm file:font-bold file:text-white" />
        </label>
        <p className={calendarFileName ? "mt-3 rounded bg-[#f0fff4] p-3 text-sm text-[#0a8f31]" : "mt-3 rounded bg-[#f8f9fc] p-3 text-sm text-[#545f72]"}>
          {calendarFileName ? `Selected file: ${calendarFileName}${/\.(pdf|docx)$/i.test(calendarFileName) ? " - it will be extracted by the server when you import." : ""}` : "No calendar file selected. You can paste rows below instead."}
        </p>
        <textarea
          value={bulkText}
          onChange={(event) => {
            setBulkText(event.target.value);
            if (event.target.value) {
              setCalendarFile(null);
              setCalendarFileName("");
            }
          }}
          className="mt-4 min-h-40 w-full rounded border border-[var(--gov-outline)] bg-white px-4 py-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-[var(--gov-primary)]"
          placeholder={"2026-01-12 | registration | First semester registration opens | Portal opens for all students |  | all | all\n2026-02-02 | exam | GST exam week | General studies exams | 2026-02-06 | all | 100;200"}
        />
        <p className="mt-2 text-xs leading-5 text-[#545f72]">Manual paste format: date | type | title | description | end date | departments | levels. Departments and levels can be "all".</p>
        <button disabled={bulkImporting} className="mt-4 w-full rounded bg-[var(--gov-primary)] px-5 py-3 font-bold text-white disabled:opacity-60">{bulkImporting ? "Importing..." : "Import Calendar Events"}</button>
      </form>

      <form onSubmit={submit} className="gov-card rounded-lg p-5">
        <h2 className="text-xl font-bold text-[var(--gov-primary)]">Create Event</h2>
        <label className="mt-4 block"><span className="text-sm font-medium text-[#3c475a]">Title</span><input name="title" required className="mt-2 w-full rounded border border-[var(--gov-outline)] px-4 py-3 text-sm" /></label>
        <label className="mt-4 block"><span className="text-sm font-medium text-[#3c475a]">Type</span><select name="event_type" className="mt-2 w-full rounded border border-[var(--gov-outline)] px-4 py-3 text-sm">{eventTypes.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label className="mt-4 block"><span className="text-sm font-medium text-[#3c475a]">Start date</span><input name="start_date" required type="date" className="mt-2 w-full rounded border border-[var(--gov-outline)] px-4 py-3 text-sm" /></label>
        <label className="mt-4 block"><span className="text-sm font-medium text-[#3c475a]">End date</span><input name="end_date" type="date" className="mt-2 w-full rounded border border-[var(--gov-outline)] px-4 py-3 text-sm" /></label>
        <label className="mt-4 block"><span className="text-sm font-medium text-[#3c475a]">Target departments</span><input name="target_departments" placeholder="Blank for all" className="mt-2 w-full rounded border border-[var(--gov-outline)] px-4 py-3 text-sm" /></label>
        <label className="mt-4 block"><span className="text-sm font-medium text-[#3c475a]">Target levels</span><input name="target_levels" placeholder="100, 200, 300" className="mt-2 w-full rounded border border-[var(--gov-outline)] px-4 py-3 text-sm" /></label>
        <label className="mt-4 block"><span className="text-sm font-medium text-[#3c475a]">Description</span><textarea name="description" className="mt-2 min-h-24 w-full rounded border border-[var(--gov-outline)] px-4 py-3 text-sm" /></label>
        <button disabled={saving} className="mt-5 w-full rounded bg-[var(--gov-primary)] px-5 py-3 font-bold text-white disabled:opacity-60">{saving ? "Saving..." : "Save Event"}</button>
      </form>
      </aside> : null}
    </div>
  );
}

function CalendarEventCard({ item, onEdit, onDelete }: { item: AdminCalendarRow; onEdit: (item: AdminCalendarRow) => void; onDelete: (item: AdminCalendarRow) => void }) {
  return (
    <article className="rounded border border-[var(--gov-outline)] bg-white p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <span className={`inline-block rounded px-2 py-1 text-[10px] font-bold uppercase ${eventTone(item.event_type)}`}>{item.event_type || "event"}</span>
          <h4 className="mt-2 text-lg font-black text-[var(--gov-primary)]">{item.title}</h4>
          <p className="mt-1 text-xs font-bold text-[#545f72]">{formatDateRange(item)}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => onEdit(item)} className="rounded border border-[var(--gov-outline)] px-3 py-1 text-xs font-bold text-[var(--gov-primary)]">Edit</button>
          <button type="button" onClick={() => onDelete(item)} className="rounded bg-[#ba1a1a] px-3 py-1 text-xs font-bold text-white">Delete</button>
        </div>
      </div>
      {item.description ? <p className="mt-3 text-sm leading-6 text-[#3c475a]">{item.description}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold uppercase text-[#545f72]">
        <span className="rounded bg-[#f2f1f5] px-2 py-1">Departments: {targetLabel(item.target_departments)}</span>
        <span className="rounded bg-[#f2f1f5] px-2 py-1">Levels: {targetLabel(item.target_levels)}</span>
      </div>
    </article>
  );
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getCalendarDays(month: Date) {
  const first = startOfMonth(month);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function eachDate(start: string, end?: string | null) {
  const dates: string[] = [];
  const current = parseDate(start);
  const last = end ? parseDate(end) : parseDate(start);
  if (Number.isNaN(current.getTime()) || Number.isNaN(last.getTime())) return dates;
  while (current <= last) {
    dates.push(toDateKey(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function groupEventsByDay(events: AdminCalendarRow[]) {
  const map = new Map<string, AdminCalendarRow[]>();
  events.forEach((event) => {
    eachDate(event.start_date, event.end_date).forEach((key) => {
      map.set(key, [...(map.get(key) || []), event]);
    });
  });
  return map;
}

function formatLongDate(value: string) {
  const date = parseDate(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en", { dateStyle: "full" });
}

function formatDateRange(item: AdminCalendarRow) {
  return item.end_date ? `${formatLongDate(item.start_date)} - ${formatLongDate(item.end_date)}` : formatLongDate(item.start_date);
}

function eventTone(type?: string | null) {
  switch (type) {
    case "exam":
      return "bg-[#ffdad6] text-[#93000a]";
    case "registration":
      return "bg-[#d6e3ff] text-[#001b3c]";
    case "holiday":
      return "bg-[#e8f5e9] text-[#2e7d32]";
    case "fee":
      return "bg-[#fff8e1] text-[#7a4a00]";
    case "deadline":
      return "bg-[#f3e8ff] text-[#4a148c]";
    default:
      return "bg-[#e9e7eb] text-[#3c475a]";
  }
}

function isBrokenCalendarImport(item: AdminCalendarRow) {
  return /^\d{4}(\s+(first|second))?$/i.test((item.title || "").trim());
}
