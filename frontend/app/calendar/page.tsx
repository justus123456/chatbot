"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getCalendarEvents } from "@/lib/api/calendar";
import { disconnectGoogleCalendar, getStoredGoogleCalendarToken, isGoogleCalendarConnected, storeGoogleCalendarToken } from "@/lib/google-calendar-auth";
import { createClient } from "@/lib/supabase/client";
import type { CalendarEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

type GoogleTokenClient = {
  requestAccessToken: (options?: { prompt?: string }) => void;
};

type GoogleCalendarEvent = {
  id: string;
  summary?: string;
  description?: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
  htmlLink?: string;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string; expires_in?: number }) => void;
          }) => GoogleTokenClient;
        };
      };
    };
  }
}

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
const googleScope = "https://www.googleapis.com/auth/calendar.events";

export default function CalendarPage() {
  const [events, setEvents] = useState<GoogleCalendarEvent[]>([]);
  const [schoolEvents, setSchoolEvents] = useState<CalendarEvent[]>([]);
  const [schoolPanelOpen, setSchoolPanelOpen] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [tokenClient, setTokenClient] = useState<GoogleTokenClient | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [silentReconnectTried, setSilentReconnectTried] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));

  useEffect(() => {
    setCalendarConnected(isGoogleCalendarConnected());
    const savedToken = getStoredGoogleCalendarToken();
    if (savedToken) setAccessToken(savedToken);
    loadSchoolEvents();
  }, []);

  useEffect(() => {
    const existingScript = document.querySelector<HTMLScriptElement>("script[data-google-identity]");
    if (existingScript) {
      setScriptReady(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = "true";
    script.onload = () => setScriptReady(true);
    script.onerror = () => setError("Could not load Google sign-in. Check your internet connection.");
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    if (!scriptReady || !googleClientId || !window.google?.accounts?.oauth2) return;
    setTokenClient(
      window.google.accounts.oauth2.initTokenClient({
        client_id: googleClientId,
        scope: googleScope,
        callback: (response) => {
          if (response.error || !response.access_token) {
            setError("Google Calendar permission was not granted.");
            return;
          }
          setError("");
          setAccessToken(response.access_token);
          setCalendarConnected(true);
          storeGoogleCalendarToken(response.access_token, response.expires_in || 3600);
        },
      }),
    );
  }, [scriptReady]);

  useEffect(() => {
    if (accessToken) loadGoogleEvents(accessToken, visibleMonth);
  }, [accessToken, visibleMonth]);

  useEffect(() => {
    if (!tokenClient || !calendarConnected || accessToken || silentReconnectTried) return;
    setSilentReconnectTried(true);
    tokenClient.requestAccessToken({ prompt: "" });
  }, [accessToken, calendarConnected, silentReconnectTried, tokenClient]);

  const days = useMemo(() => getCalendarDays(visibleMonth), [visibleMonth]);
  const eventsByDay = useMemo(() => groupEventsByDay(events), [events]);
  const schoolEventsByDay = useMemo(() => groupSchoolEventsByDay(schoolEvents), [schoolEvents]);
  const selectedEvents = eventsByDay.get(selectedDate) || [];
  const selectedSchoolEvents = schoolEventsByDay.get(selectedDate) || [];
  const upcomingEvents = useMemo(
    () => events.filter((event) => getEventStartKey(event) >= toDateKey(new Date())).sort((a, b) => getEventStartKey(a).localeCompare(getEventStartKey(b))).slice(0, 8),
    [events],
  );
  const academicCalendarRows = useMemo(
    () =>
      [...schoolEvents]
        .filter(isMeaningfulSchoolEvent)
        .sort((a, b) => getCalendarOrder(a) - getCalendarOrder(b) || a.start_date.localeCompare(b.start_date)),
    [schoolEvents],
  );

  async function loadSchoolEvents() {
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const result = await getCalendarEvents(data.session?.access_token);
      setSchoolEvents(result.data || []);
    } catch {
      setSchoolEvents([]);
    }
  }

  function connectGoogleCalendar() {
    if (!googleClientId) {
      setError("Add NEXT_PUBLIC_GOOGLE_CLIENT_ID to frontend/.env.local first.");
      return;
    }
    tokenClient?.requestAccessToken({ prompt: "consent" });
  }

  function disconnectCalendar() {
    disconnectGoogleCalendar();
    setAccessToken("");
    setCalendarConnected(false);
    setEvents([]);
    setError("");
  }

  async function loadGoogleEvents(token: string, month: Date) {
    setLoading(true);
    setError("");
    try {
      const timeMin = new Date(month.getFullYear(), month.getMonth(), 1).toISOString();
      const timeMax = new Date(month.getFullYear(), month.getMonth() + 1, 1).toISOString();
      const params = new URLSearchParams({
        singleEvents: "true",
        orderBy: "startTime",
        timeMin,
        timeMax,
      });
      const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          disconnectGoogleCalendar();
          setCalendarConnected(false);
          setAccessToken("");
          throw new Error("Google Calendar needs a fresh sign-in. Click Connect Google Calendar once to renew it.");
        }
        throw new Error(payload.error?.message || "Could not load Google Calendar.");
      }
      setEvents(payload.items || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load Google Calendar.");
    } finally {
      setLoading(false);
    }
  }

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) {
      connectGoogleCalendar();
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const title = String(formData.get("title") || "").trim();
    const date = String(formData.get("date") || selectedDate);
    const time = String(formData.get("time") || "09:00");
    const description = String(formData.get("description") || "").trim();
    if (!title || !date) return;

    setSaving(true);
    setError("");
    try {
      const start = new Date(`${date}T${time}:00`);
      const end = new Date(start);
      end.setHours(start.getHours() + 1);
      const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: title,
          description,
          start: { dateTime: start.toISOString(), timeZone: "Africa/Lagos" },
          end: { dateTime: end.toISOString(), timeZone: "Africa/Lagos" },
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "Could not create event.");
      form.reset();
      await loadGoogleEvents(accessToken, visibleMonth);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create event.");
    } finally {
      setSaving(false);
    }
  }

  async function addSchoolEventToGoogle(event: CalendarEvent) {
    if (!accessToken) {
      connectGoogleCalendar();
      return;
    }

    setSaving(true);
    setError("");
    try {
      const endDate = event.end_date ? addDays(parseDate(event.end_date), 1) : addDays(parseDate(event.start_date), 1);
      const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: event.title,
          description: event.description || `SmartCampus school calendar event: ${event.event_type || "event"}`,
          start: { date: event.start_date },
          end: { date: toDateKey(endDate) },
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "Could not add school event to Google Calendar.");
      await loadGoogleEvents(accessToken, visibleMonth);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add school event to Google Calendar.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteEvent(eventId: string) {
    if (!accessToken) return;
    setError("");
    try {
      const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error("Could not delete event.");
      setEvents((items) => items.filter((event) => event.id !== eventId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete event.");
    }
  }

  return (
    <AppShell>
      <div className="h-[calc(100vh-8rem)] min-h-[640px] overflow-hidden">
        <Card className="h-full min-h-0 overflow-hidden p-0">
          <div className="h-full overflow-y-auto p-5 md:p-7">
          <div className="flex flex-col gap-4 border-b border-[var(--border-soft)] pb-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-mint">Google Calendar</p>
              <h1 className="mt-2 text-3xl font-semibold">Your calendar inside SmartCampus</h1>
              <p className="mt-3 text-sm text-[var(--text-muted)]">
                Connect Google Calendar to view, create, and delete events without leaving the website.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {accessToken ? (
                <>
                  <Button type="button" variant="outline" onClick={() => loadGoogleEvents(accessToken, visibleMonth)}>
                    Refresh
                  </Button>
                  <Button type="button" variant="outline" onClick={disconnectCalendar}>
                    Disconnect
                  </Button>
                </>
              ) : (
                <Button type="button" onClick={connectGoogleCalendar} disabled={!tokenClient && !!googleClientId}>
                  {calendarConnected ? "Reconnect Google Calendar" : "Connect Google Calendar"}
                </Button>
              )}
              <button
                type="button"
                onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))}
                className="grid size-10 place-items-center rounded-full border border-[var(--border-soft)] bg-[var(--panel-strong)] transition hover:border-[var(--accent-soft)] hover:text-[var(--accent)]"
                aria-label="Previous month"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))}
                className="grid size-10 place-items-center rounded-full border border-[var(--border-soft)] bg-[var(--panel-strong)] transition hover:border-[var(--accent-soft)] hover:text-[var(--accent)]"
                aria-label="Next month"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <h2 className="text-2xl font-semibold">{visibleMonth.toLocaleString("en", { month: "long", year: "numeric" })}</h2>
            {loading ? <span className="text-sm text-[var(--text-muted)]">Loading Google events...</span> : null}
          </div>

          {error ? <p className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}

          <div className="mt-5 grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-soft)]">
            {weekdays.map((day) => <div key={day}>{day}</div>)}
          </div>

          <div className="mt-4 grid grid-cols-7 gap-3">
            {days.map((day) => {
              const key = toDateKey(day);
              const dayEvents = eventsByDay.get(key) || [];
              const daySchoolEvents = schoolEventsByDay.get(key) || [];
              const inMonth = day.getMonth() === visibleMonth.getMonth();
              const selected = key === selectedDate;
              const today = key === toDateKey(new Date());

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDate(key)}
                  className={cn(
                    "flex aspect-square min-h-16 flex-col rounded-2xl border p-2 text-left transition md:min-h-20 md:p-3",
                    selected ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border-soft)] bg-[var(--bg-elevated)] hover:border-[var(--accent-soft)]",
                    !inMonth && "opacity-45",
                  )}
                >
                  <span className={cn("grid size-7 place-items-center rounded-full text-sm font-semibold", today && "bg-[var(--accent)] text-[#03110b]")}>{day.getDate()}</span>
                  <div className="mt-auto flex flex-wrap gap-1">
                    {dayEvents.slice(0, 3).map((event) => <span key={event.id} className="size-2 rounded-full bg-[var(--accent)]" title={event.summary} />)}
                    {daySchoolEvents.slice(0, 3).map((event) => <span key={event.id} className="size-2 rounded-full bg-sky-300" title={event.title} />)}
                    {dayEvents.length + daySchoolEvents.length > 6 ? <span className="text-[10px] text-[var(--text-muted)]">+{dayEvents.length + daySchoolEvents.length - 6}</span> : null}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-8 grid min-h-0 gap-6 xl:grid-cols-[1fr_1fr]">
          <section className="rounded-[2rem] border border-[var(--border-soft)] bg-[var(--panel-strong)] p-6 text-[var(--text-main)] shadow-glass backdrop-blur-2xl">
            <p className="text-sm uppercase tracking-[0.3em] text-mint">Create event</p>
            <form className="mt-5 grid gap-3" onSubmit={createEvent}>
              <input name="title" className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] px-4 py-3 text-[var(--text-main)] outline-none placeholder:text-[var(--text-soft)]" placeholder="Event title" required />
              <div className="grid grid-cols-2 gap-3">
                <input name="date" className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] px-4 py-3 text-[var(--text-main)] outline-none" type="date" defaultValue={selectedDate} required />
                <input name="time" className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] px-4 py-3 text-[var(--text-main)] outline-none" type="time" defaultValue="09:00" />
              </div>
              <textarea name="description" className="min-h-24 rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] px-4 py-3 text-[var(--text-main)] outline-none placeholder:text-[var(--text-soft)]" placeholder="Description" />
              <Button type="submit" disabled={saving}>
                <CalendarPlus className="size-4" />
                {saving ? "Saving..." : "Add to Google Calendar"}
              </Button>
            </form>
          </section>

          <section className="rounded-[2rem] border border-[var(--border-soft)] bg-[var(--panel-strong)] p-6 text-[var(--text-main)] shadow-glass backdrop-blur-2xl">
            <p className="text-sm uppercase tracking-[0.3em] text-mint">Selected day</p>
            <h2 className="mt-2 text-2xl font-semibold">{formatDate(selectedDate)}</h2>
            <div className="mt-5 max-h-[320px] space-y-3 overflow-y-auto pr-1">
              {selectedSchoolEvents.map((event) => <SchoolEventCard key={event.id} event={event} onAdd={addSchoolEventToGoogle} adding={saving} />)}
              {selectedEvents.length ? selectedEvents.map((event) => <EventCard key={event.id} event={event} onDelete={deleteEvent} />) : (
                <p className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] p-4 text-sm text-[var(--text-muted)]">
                  {selectedSchoolEvents.length ? "No personal Google Calendar event on this date." : accessToken ? "No event on this date." : "No school event on this date. Connect Google Calendar to see personal events."}
                </p>
              )}
            </div>
          </section>

          <section className="rounded-[2rem] border border-[var(--border-soft)] bg-[var(--panel-strong)] p-6 text-[var(--text-main)] shadow-glass backdrop-blur-2xl xl:col-span-2">
            <p className="text-sm uppercase tracking-[0.3em] text-mint">Upcoming</p>
            <div className="mt-5 max-h-[320px] space-y-3 overflow-y-auto pr-1">
              {upcomingEvents.length ? upcomingEvents.map((event) => <EventCard key={event.id} event={event} compact onDelete={deleteEvent} />) : (
                <p className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] p-4 text-sm text-[var(--text-muted)]">No personal Google Calendar events loaded.</p>
              )}
            </div>
          </section>

          </div>
          </div>
        </Card>
        <button
          type="button"
          onClick={() => setSchoolPanelOpen((value) => !value)}
          className="fixed bottom-6 right-6 z-40 rounded-full bg-[var(--accent)] px-5 py-4 text-sm font-bold text-[#03110b] shadow-glass"
        >
          Academic Calendar ({academicCalendarRows.length})
        </button>
        {schoolPanelOpen ? (
          <aside className="fixed bottom-24 right-6 z-40 max-h-[560px] w-[min(780px,calc(100vw-2rem))] overflow-y-auto rounded-3xl border border-[var(--border-soft)] bg-[var(--panel-strong)] p-5 shadow-glass backdrop-blur-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-mint">Academic Calendar</p>
                <h2 className="mt-1 text-xl font-semibold">Official school schedule</h2>
              </div>
              <button type="button" onClick={() => setSchoolPanelOpen(false)} className="rounded-full border border-[var(--border-soft)] px-3 py-1 text-sm text-[var(--text-muted)]">Close</button>
            </div>
            <AcademicCalendarTable rows={academicCalendarRows} rawCount={schoolEvents.length} onAdd={addSchoolEventToGoogle} adding={saving} connected={Boolean(accessToken)} compact />
          </aside>
        ) : null}
      </div>
    </AppShell>
  );
}

function EventCard({ event, compact = false, onDelete }: { event: GoogleCalendarEvent; compact?: boolean; onDelete: (eventId: string) => void }) {
  return (
    <article className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{event.summary || "Untitled event"}</p>
          {!compact && event.description ? <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{event.description}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => onDelete(event.id)}
          className="grid size-8 shrink-0 place-items-center rounded-full border border-[var(--border-soft)] text-[var(--text-muted)] transition hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-300"
          aria-label="Delete event"
          title="Delete event"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      <p className="mt-3 text-xs text-[var(--text-soft)]">{formatDate(getEventStartKey(event))}</p>
      {event.htmlLink ? <a className="mt-3 inline-block text-xs text-[var(--accent)]" href={event.htmlLink} target="_blank" rel="noreferrer">Open in Google Calendar</a> : null}
    </article>
  );
}

function AcademicCalendarTable({ rows, rawCount, onAdd, adding, connected }: { rows: CalendarEvent[]; rawCount: number; onAdd: (event: CalendarEvent) => void; adding: boolean; connected: boolean; compact?: boolean }) {
  return (
    <div className="mt-5 max-h-[420px] overflow-auto rounded-2xl border border-[var(--border-soft)]">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="bg-[var(--bg-elevated)] text-xs uppercase tracking-[0.18em] text-[var(--text-soft)]">
          <tr>
            <th className="px-4 py-3">S/N</th>
            <th className="px-4 py-3">Activity / Event</th>
            <th className="px-4 py-3">Day</th>
            <th className="px-4 py-3">Date / Period</th>
            <th className="px-4 py-3">Semester</th>
            <th className="px-4 py-3">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((event) => (
            <tr key={event.id} className="border-t border-[var(--border-soft)]">
              <td className="px-4 py-4 text-xs font-semibold text-[var(--text-soft)]">{getCalendarOrderLabel(event)}</td>
              <td className="px-4 py-4">
                <p className="font-semibold">{event.title}</p>
                {event.description ? <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{cleanCalendarDescription(event.description)}</p> : null}
              </td>
              <td className="px-4 py-4 text-xs font-semibold text-[var(--text-main)]">{getCalendarDayLabel(event)}</td>
              <td className="px-4 py-4 text-xs text-[var(--text-muted)]">{getCalendarPeriodLabel(event)}</td>
              <td className="px-4 py-4"><span className="rounded-full bg-sky-300 px-3 py-1 text-[10px] font-bold uppercase text-[#03110b]">{inferSemester(event)}</span></td>
              <td className="px-4 py-4">
                <Button type="button" variant="outline" onClick={() => onAdd(event)} disabled={adding}>
                  {connected ? "Add to my calendar" : "Connect Google"}
                </Button>
              </td>
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <td className="px-4 py-5 text-[var(--text-muted)]" colSpan={6}>
                {rawCount ? "Academic calendar rows were found, but they look like a broken import. Ask admin to delete the year-only rows and re-import the PDF." : "No school calendar events have been posted for your department and level."}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
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

function groupEventsByDay(events: GoogleCalendarEvent[]) {
  const map = new Map<string, GoogleCalendarEvent[]>();
  events.forEach((event) => {
    const key = getEventStartKey(event);
    map.set(key, [...(map.get(key) || []), event]);
  });
  return map;
}

function groupSchoolEventsByDay(events: CalendarEvent[]) {
  const map = new Map<string, CalendarEvent[]>();
  events.forEach((event) => {
    const key = event.start_date;
    map.set(key, [...(map.get(key) || []), event]);
  });
  return map;
}

function eachDate(start: string, end?: string | null) {
  const dates: string[] = [];
  const current = parseDate(start);
  const last = end ? parseDate(end) : parseDate(start);
  while (current <= last) {
    dates.push(toDateKey(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function SchoolEventCard({ event, compact = false, onAdd, adding = false }: { event: CalendarEvent; compact?: boolean; onAdd?: (event: CalendarEvent) => void; adding?: boolean }) {
  return (
    <article className="rounded-2xl border border-sky-300/30 bg-sky-400/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{event.title}</p>
          {!compact && event.description ? <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{event.description}</p> : null}
        </div>
        <span className="shrink-0 rounded-full bg-sky-300 px-3 py-1 text-[10px] font-bold uppercase text-[#03110b]">{event.event_type}</span>
      </div>
      <p className="mt-3 text-xs text-[var(--text-soft)]">{formatDate(event.start_date)}{event.end_date ? ` - ${formatDate(event.end_date)}` : ""}</p>
      {onAdd ? (
        <Button type="button" variant="outline" className="mt-3" onClick={() => onAdd(event)} disabled={adding}>
          Add to my calendar
        </Button>
      ) : null}
    </article>
  );
}

function getEventStartKey(event: GoogleCalendarEvent) {
  if (event.start.date) return event.start.date;
  return toDateKey(new Date(event.start.dateTime || Date.now()));
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value: string) {
  return parseDate(value).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}

function formatWeekday(value: string) {
  return parseDate(value).toLocaleDateString("en", { weekday: "long" });
}

function formatDatePeriod(event: CalendarEvent) {
  return event.end_date ? `${formatDate(event.start_date)} - ${formatDate(event.end_date)}` : formatDate(event.start_date);
}

function getCalendarMetadata(event: CalendarEvent, key: string) {
  const description = event.description || "";
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = description.match(new RegExp(`${escapedKey}:\\s*([^;]+)`, "i"));
  const value = match?.[1]?.trim();
  return value && value !== "-" ? value : "";
}

function getCalendarOrder(event: CalendarEvent) {
  const order = Number(getCalendarMetadata(event, "Order"));
  return Number.isFinite(order) && order > 0 ? order : 9999;
}

function getCalendarOrderLabel(event: CalendarEvent) {
  const order = getCalendarOrder(event);
  return order === 9999 ? "-" : String(order);
}

function getCalendarDayLabel(event: CalendarEvent) {
  return getCalendarMetadata(event, "Day") || formatWeekday(event.start_date);
}

function getCalendarPeriodLabel(event: CalendarEvent) {
  return getCalendarMetadata(event, "Period") || formatDatePeriod(event);
}

function inferSemester(event: CalendarEvent) {
  const explicitSemester = getCalendarMetadata(event, "Semester");
  if (explicitSemester) return explicitSemester;
  const source = `${event.description || ""} ${event.title || ""}`;
  const match = source.match(/\b(first|second)\b/i);
  return match ? match[1] : "-";
}

function cleanCalendarDescription(description: string) {
  return description
    .replace(/\bOrder:\s*[^;]+;?\s*/gi, "")
    .replace(/\bSemester:\s*[^;]+;?\s*/gi, "")
    .replace(/\bDay:\s*[^;]+;?\s*/gi, "")
    .replace(/\bPeriod:\s*[^;]+;?\s*/gi, "")
    .replace(/^Source row:\s*/i, "")
    .trim();
}

function isMeaningfulSchoolEvent(event: CalendarEvent) {
  return Boolean(event.title && !/^\d{4}(\s+(first|second))?$/i.test(event.title.trim()));
}
