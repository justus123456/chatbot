"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { createAdminAnnouncement, deleteAdminAnnouncement, getAdminAnnouncements, getFreshAccessToken, updateAdminAnnouncement, type AdminAnnouncementRow } from "@/lib/api/admin";

const levels = [100, 200, 300, 400, 500];

export default function AdminPostPage() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [departments, setDepartments] = useState("");
  const [selectedLevels, setSelectedLevels] = useState<number[]>(levels);
  const [expiresAt, setExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [announcements, setAnnouncements] = useState<AdminAnnouncementRow[]>([]);

  function toggleLevel(level: number) {
    setSelectedLevels((current) => current.includes(level) ? current.filter((item) => item !== level) : [...current, level].sort());
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      if (!title.trim() || !content.trim()) {
        throw new Error("Title and announcement body are required.");
      }
      if (!selectedLevels.length) {
        throw new Error("Select at least one student level.");
      }

      const targetDepartments = departments
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      await createAdminAnnouncement(
        {
          title: title.trim(),
          content: content.trim(),
          target_departments: targetDepartments.length ? targetDepartments : "all",
          target_levels: selectedLevels,
          expires_at: expiresAt || null,
        },
        await getFreshAccessToken(),
      );
      loadAnnouncements();

      setTitle("");
      setContent("");
      setDepartments("");
      setSelectedLevels(levels);
      setExpiresAt("");
      setMessage("Announcement published. Matching students will see it in Announcements and receive a notification.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not publish announcement.");
    } finally {
      setSaving(false);
    }
  }

  async function loadAnnouncements() {
    try {
      const result = await getAdminAnnouncements(await getFreshAccessToken());
      setAnnouncements(result.data);
    } catch {
      setAnnouncements([]);
    }
  }

  async function editAnnouncement(item: AdminAnnouncementRow) {
    const nextTitle = prompt("Announcement title", item.title);
    if (nextTitle === null) return;
    const nextContent = prompt("Announcement body", item.content);
    if (nextContent === null) return;
    const nextStatus = prompt("Status: draft, scheduled, published, expired", item.status || item.computed_state || "published");
    if (nextStatus === null) return;
    try {
      await updateAdminAnnouncement(item.id, { title: nextTitle, content: nextContent, status: nextStatus }, await getFreshAccessToken());
      loadAnnouncements();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update announcement.");
    }
  }

  async function removeAnnouncement(item: AdminAnnouncementRow) {
    if (!confirm(`Delete announcement "${item.title}"?`)) return;
    try {
      await deleteAdminAnnouncement(item.id, await getFreshAccessToken());
      setAnnouncements((current) => current.filter((announcement) => announcement.id !== item.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete announcement.");
    }
  }

  useEffect(() => {
    loadAnnouncements();
  }, []);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-3 border-b border-[var(--gov-outline)] pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#545f72]">Announcements</p>
          <h1 className="mt-2 text-3xl font-black text-[var(--gov-primary)]">Create Announcement</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#3c475a]">
            Publish school updates to students by department and level. The post is saved to Supabase and appears on the student announcement feed.
          </p>
        </div>
        <Link href="/announcements" className="rounded border border-[var(--gov-outline)] px-4 py-2 text-sm font-bold text-[var(--gov-primary)]">
          Preview student feed
        </Link>
      </section>

      <form className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]" onSubmit={handleSubmit}>
        <section className="gov-card rounded-lg p-5">
          <label className="block">
            <span className="text-sm font-bold text-[var(--gov-primary)]">Announcement title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-2 w-full rounded border border-[var(--gov-outline)] bg-white px-4 py-3 text-sm text-[var(--gov-text)] outline-none focus:ring-2 focus:ring-[var(--gov-primary)]"
              placeholder="Registration deadline update"
            />
          </label>

          <label className="mt-5 block">
            <span className="text-sm font-bold text-[var(--gov-primary)]">Announcement body</span>
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className="mt-2 min-h-56 w-full rounded border border-[var(--gov-outline)] bg-white px-4 py-3 text-sm leading-6 text-[var(--gov-text)] outline-none focus:ring-2 focus:ring-[var(--gov-primary)]"
              placeholder="Write the full announcement students should see..."
            />
          </label>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button disabled={saving} className="rounded bg-[var(--gov-primary)] px-6 py-3 font-bold text-white disabled:opacity-60">
              {saving ? "Publishing..." : "Publish Announcement"}
            </button>
            {message ? <p className="text-sm font-semibold text-[#0a8f31]">{message}</p> : null}
            {error ? <p className="text-sm font-semibold text-[#ba1a1a]">{error}</p> : null}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="gov-card rounded-lg p-5">
            <h2 className="text-lg font-bold text-[var(--gov-primary)]">Target Students</h2>
            <label className="mt-4 block">
              <span className="text-sm font-medium text-[#3c475a]">Departments</span>
              <input
                value={departments}
                onChange={(event) => setDepartments(event.target.value)}
                className="mt-2 w-full rounded border border-[var(--gov-outline)] bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--gov-primary)]"
                placeholder="Leave blank for all, or type Computer Science, Law"
              />
            </label>

            <div className="mt-5">
              <p className="text-sm font-medium text-[#3c475a]">Levels</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {levels.map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => toggleLevel(level)}
                    className={selectedLevels.includes(level) ? "rounded bg-[#d6e3ff] px-3 py-2 text-sm font-bold text-[var(--gov-primary)]" : "rounded border border-[var(--gov-outline)] px-3 py-2 text-sm text-[#3c475a]"}
                  >
                    {level} Level
                  </button>
                ))}
              </div>
            </div>

            <label className="mt-5 block">
              <span className="text-sm font-medium text-[#3c475a]">Expires at</span>
              <input
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                type="date"
                className="mt-2 w-full rounded border border-[var(--gov-outline)] bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--gov-primary)]"
              />
            </label>
          </section>

          <section className="rounded-lg bg-[var(--gov-primary)] p-5 text-white">
            <h2 className="font-bold">How students receive it</h2>
            <p className="mt-2 text-sm leading-6 text-white/85">
              The announcement is inserted into `announcements`. The API also creates notification rows for matching students so it shows up in their Notifications page.
            </p>
          </section>
        </aside>
      </form>

      <section className="gov-card overflow-hidden rounded-lg">
        <div className="border-b border-[var(--gov-outline)] bg-[#f4f3f7] px-5 py-4">
          <h2 className="text-xl font-bold text-[var(--gov-primary)]">All Announcements</h2>
          <p className="mt-1 text-sm text-[#545f72]">Draft, scheduled, published, and expired records across all departments and roles.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#f2f1f5] text-xs uppercase text-[#3c475a]">
              <tr>
                <th className="px-5 py-3">Title</th>
                <th className="px-5 py-3">State</th>
                <th className="px-5 py-3">Author Role</th>
                <th className="px-5 py-3">Audience</th>
                <th className="px-5 py-3">Expires</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {announcements.map((item) => (
                <tr key={item.id} className="border-t border-[var(--gov-outline)]">
                  <td className="max-w-[420px] px-5 py-4">
                    <strong className="text-[var(--gov-primary)]">{item.title}</strong>
                    <p className="mt-1 line-clamp-2 text-xs text-[#545f72]">{item.content}</p>
                  </td>
                  <td className="px-5 py-4"><span className="rounded bg-[#d6e3ff] px-3 py-1 text-xs font-bold uppercase text-[var(--gov-primary)]">{item.computed_state || item.status || "published"}</span></td>
                  <td className="px-5 py-4 capitalize">{item.created_by_role || "unknown"}</td>
                  <td className="px-5 py-4 text-xs text-[#545f72]">{JSON.stringify(item.target_departments || "all")} / {JSON.stringify(item.target_levels || "all")}</td>
                  <td className="px-5 py-4 text-xs text-[#545f72]">{item.expires_at || "-"}</td>
                  <td className="px-5 py-4">
                    <div className="flex gap-2">
                      <button onClick={() => editAnnouncement(item)} className="rounded border border-[var(--gov-outline)] px-3 py-1 text-xs font-bold text-[var(--gov-primary)]">Edit</button>
                      <button onClick={() => removeAnnouncement(item)} className="rounded border border-[#ba1a1a] px-3 py-1 text-xs font-bold text-[#ba1a1a]">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!announcements.length ? <tr><td className="px-5 py-5 text-[#545f72]" colSpan={6}>No announcements found.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
