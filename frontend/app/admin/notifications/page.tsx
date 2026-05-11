"use client";

import { FormEvent, useState } from "react";
import { getFreshAccessToken, sendAdminNotification } from "@/lib/api/admin";

const levels = [100, 200, 300, 400, 500];

export default function AdminNotificationsPage() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    const data = new FormData(event.currentTarget);
    const departments = String(data.get("departments") || "").split(",").map((item) => item.trim()).filter(Boolean);
    const selectedLevels = levels.filter((level) => data.get(`level_${level}`));
    try {
      const result = await sendAdminNotification(
        {
          title: String(data.get("title") || "").trim(),
          message: String(data.get("message") || "").trim(),
          type: String(data.get("type") || "system"),
          target_departments: departments.length ? departments : "all",
          target_levels: selectedLevels.length ? selectedLevels : "all",
          date: String(data.get("date") || "") || undefined,
          link: String(data.get("link") || "") || undefined,
        },
        await getFreshAccessToken(),
      );
      setMessage(`Notification sent to ${result.sent} student${result.sent === 1 ? "" : "s"}.`);
      event.currentTarget.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send notification.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="space-y-5">
        <header className="border-b border-[var(--gov-outline)] pb-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#545f72]">Manual Notifications</p>
          <h1 className="mt-2 text-3xl font-black text-[var(--gov-primary)]">Send Reminders</h1>
          <p className="mt-2 text-sm text-[#3c475a]">Send reminders and manual notifications to any student group by department and level.</p>
        </header>
        {message ? <p className="rounded border border-[#c7eed4] bg-[#f0fff4] p-4 text-sm text-[#0a8f31]">{message}</p> : null}
        {error ? <p className="rounded border border-[#ffdad6] bg-[#fff4f2] p-4 text-sm text-[#ba1a1a]">{error}</p> : null}
        <div className="gov-card rounded-lg p-5">
          <h2 className="text-xl font-bold text-[var(--gov-primary)]">Admin Permission</h2>
          <p className="mt-2 text-sm leading-6 text-[#3c475a]">This creates rows in `notifications` for matching students only. It does not expose student private chats, documents, notes, goals, or flashcards.</p>
        </div>
      </section>
      <form onSubmit={submit} className="gov-card h-fit rounded-lg p-5">
        <h2 className="text-xl font-bold text-[var(--gov-primary)]">New Notification</h2>
        <label className="mt-4 block"><span className="text-sm font-medium text-[#3c475a]">Title</span><input name="title" required className="mt-2 w-full rounded border border-[var(--gov-outline)] px-4 py-3 text-sm" /></label>
        <label className="mt-4 block"><span className="text-sm font-medium text-[#3c475a]">Message</span><textarea name="message" required className="mt-2 min-h-28 w-full rounded border border-[var(--gov-outline)] px-4 py-3 text-sm" /></label>
        <label className="mt-4 block"><span className="text-sm font-medium text-[#3c475a]">Type</span><select name="type" className="mt-2 w-full rounded border border-[var(--gov-outline)] px-4 py-3 text-sm"><option value="reminder">reminder</option><option value="system">system</option><option value="update">update</option><option value="announcement">announcement</option></select></label>
        <label className="mt-4 block"><span className="text-sm font-medium text-[#3c475a]">Departments</span><input name="departments" placeholder="Blank for all, or Computer Science, Law" className="mt-2 w-full rounded border border-[var(--gov-outline)] px-4 py-3 text-sm" /></label>
        <div className="mt-4"><p className="text-sm font-medium text-[#3c475a]">Levels</p><div className="mt-2 grid grid-cols-2 gap-2">{levels.map((level) => <label key={level} className="rounded border border-[var(--gov-outline)] px-3 py-2 text-sm"><input type="checkbox" name={`level_${level}`} className="mr-2" />{level} Level</label>)}</div></div>
        <label className="mt-4 block"><span className="text-sm font-medium text-[#3c475a]">Date</span><input name="date" type="date" className="mt-2 w-full rounded border border-[var(--gov-outline)] px-4 py-3 text-sm" /></label>
        <label className="mt-4 block"><span className="text-sm font-medium text-[#3c475a]">Link</span><input name="link" placeholder="/calendar" className="mt-2 w-full rounded border border-[var(--gov-outline)] px-4 py-3 text-sm" /></label>
        <button disabled={saving} className="mt-5 w-full rounded bg-[var(--gov-primary)] px-5 py-3 font-bold text-white disabled:opacity-60">{saving ? "Sending..." : "Send Notification"}</button>
      </form>
    </div>
  );
}
