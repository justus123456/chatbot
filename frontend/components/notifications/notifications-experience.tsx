"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bell, BellRing, CheckCheck, Clock, ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { deleteNotification, getNotifications, markAllNotificationsRead, updateNotification } from "@/lib/api/notifications";
import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/lib/types";
import { cn } from "@/lib/utils";

type Filter = "all" | "unread" | "read";

const filters: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "read", label: "Read" },
];

export function NotificationsExperience() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");

  const unreadCount = notifications.filter((item) => !item.is_read).length;
  const readCount = notifications.length - unreadCount;
  const filteredNotifications = useMemo(() => {
    if (filter === "unread") return notifications.filter((item) => !item.is_read);
    if (filter === "read") return notifications.filter((item) => item.is_read);
    return notifications;
  }, [filter, notifications]);

  useEffect(() => {
    loadNotifications();
  }, []);

  async function getAccessToken() {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    let token = data.session?.access_token;
    if (!token) {
      const refreshed = await supabase.auth.refreshSession();
      token = refreshed.data.session?.access_token;
    }
    if (!token) throw new Error("Please log in again.");
    return token;
  }

  async function loadNotifications() {
    setLoading(true);
    setError("");
    try {
      const token = await getAccessToken();
      const result = await getNotifications(token);
      setNotifications(result.data);
    } catch (caught) {
      setError(toFriendlyError(caught));
    } finally {
      setLoading(false);
    }
  }

  async function toggleRead(notification: Notification) {
    setSaving(notification.id);
    setError("");
    const nextRead = !notification.is_read;
    setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, is_read: nextRead } : item));
    try {
      const token = await getAccessToken();
      await updateNotification(notification.id, { is_read: nextRead }, token);
    } catch (caught) {
      setNotifications((items) => items.map((item) => item.id === notification.id ? notification : item));
      setError(toFriendlyError(caught));
    } finally {
      setSaving("");
    }
  }

  async function handleMarkAllRead() {
    if (!unreadCount) return;
    setSaving("all");
    setError("");
    const previous = notifications;
    setNotifications((items) => items.map((item) => ({ ...item, is_read: true })));
    try {
      const token = await getAccessToken();
      await markAllNotificationsRead(token);
    } catch (caught) {
      setNotifications(previous);
      setError(toFriendlyError(caught));
    } finally {
      setSaving("");
    }
  }

  async function handleDelete(notification: Notification) {
    setSaving(notification.id);
    setError("");
    setNotifications((items) => items.filter((item) => item.id !== notification.id));
    try {
      const token = await getAccessToken();
      await deleteNotification(notification.id, token);
    } catch (caught) {
      setNotifications((items) => [notification, ...items].sort((a, b) => b.created_at.localeCompare(a.created_at)));
      setError(toFriendlyError(caught));
    } finally {
      setSaving("");
    }
  }

  return (
      <div className="grid h-[calc(100vh-8rem)] min-h-[640px] gap-5 overflow-hidden xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <div className="border-b border-[var(--border-soft)] pb-5">
            <p className="text-sm uppercase tracking-[0.3em] text-mint">Notifications</p>
            <h1 className="mt-2 text-3xl font-semibold">Your updates.</h1>
            <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
              Review reminders, system updates, announcements, and staff responses.
            </p>
          </div>

          <div className="grid gap-3 py-5">
            <StatCard label="Unread" value={unreadCount} active={unreadCount > 0} />
            <StatCard label="Read" value={readCount} />
            <StatCard label="Total" value={notifications.length} />
          </div>

          <div className="mt-auto border-t border-[var(--border-soft)] pt-5">
            <Button type="button" className="w-full justify-center" onClick={handleMarkAllRead} disabled={!unreadCount || saving === "all"}>
              <CheckCheck className="size-4" />
              {saving === "all" ? "Updating..." : "Mark all as read"}
            </Button>
            <Button type="button" variant="outline" className="mt-3 w-full justify-center" onClick={loadNotifications} disabled={loading}>
              <Clock className="size-4" />
              Refresh
            </Button>
          </div>
        </Card>

        <Card className="flex min-h-0 flex-col overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-[var(--border-soft)] pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {filters.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFilter(item.key)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm transition",
                    filter === item.key
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "border-[var(--border-soft)] bg-[var(--panel-strong)] text-[var(--text-muted)] hover:border-[var(--accent-soft)] hover:text-[var(--accent)]",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <p className="text-sm text-[var(--text-muted)]">{filteredNotifications.length} showing</p>
          </div>

          {error ? <p className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-5 pr-1">
            {loading ? <p className="text-sm text-[var(--text-muted)]">Loading notifications...</p> : null}
            {!loading && filteredNotifications.map((notification) => (
              <article
                key={notification.id}
                className={cn(
                  "rounded-2xl border p-4 transition",
                  notification.is_read ? "border-[var(--border-soft)] bg-[var(--bg-elevated)]" : "border-[var(--accent-soft)] bg-[var(--accent-soft)]",
                )}
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="grid size-9 place-items-center rounded-full bg-[var(--panel-strong)] text-[var(--accent)]">
                        {notification.is_read ? <Bell className="size-4" /> : <BellRing className="size-4" />}
                      </span>
                      <span className="rounded-full bg-[var(--panel-strong)] px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-[var(--text-soft)]">
                        {notification.type?.replace("_", " ") || "system"}
                      </span>
                      {!notification.is_read ? <span className="rounded-full bg-[var(--accent)] px-2 py-1 text-[10px] font-semibold text-[#03110b]">New</span> : null}
                    </div>
                    <h2 className="mt-3 text-lg font-semibold text-[var(--text-main)]">{notification.title || "Notification"}</h2>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{notification.message}</p>
                    <p className="mt-3 text-xs text-[var(--text-soft)]">{formatDate(notification.created_at)}</p>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {notification.link ? (
                      <Link href={notification.link} className="inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] px-3 py-2 text-sm text-[var(--text-main)] transition hover:border-[var(--accent-soft)] hover:text-[var(--accent)]">
                        <ExternalLink className="size-4" />
                        Open
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => toggleRead(notification)}
                      disabled={saving === notification.id}
                      className="inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] px-3 py-2 text-sm text-[var(--text-main)] transition hover:border-[var(--accent-soft)] hover:text-[var(--accent)] disabled:opacity-60"
                    >
                      <CheckCheck className="size-4" />
                      {notification.is_read ? "Unread" : "Read"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(notification)}
                      disabled={saving === notification.id}
                      className="grid size-10 place-items-center rounded-full border border-red-400/20 text-red-300 transition hover:bg-red-500/10 disabled:opacity-60"
                      aria-label="Delete notification"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
            {!loading && !filteredNotifications.length ? (
              <p className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] p-5 text-sm text-[var(--text-muted)]">
                No notifications in this view yet.
              </p>
            ) : null}
          </div>
        </Card>
      </div>
  );
}

function StatCard({ label, value, active = false }: { label: string; value: number; active?: boolean }) {
  return (
    <div className={cn("rounded-2xl border p-4", active ? "border-[var(--accent-soft)] bg-[var(--accent-soft)]" : "border-[var(--border-soft)] bg-[var(--bg-elevated)]")}>
      <p className="text-sm text-[var(--text-muted)]">{label}</p>
      <strong className="mt-1 block text-2xl">{value}</strong>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function toFriendlyError(caught: unknown) {
  const message = caught instanceof Error ? caught.message : "Could not complete that action.";
  if (message === "Invalid token" || message === "Unauthorized") {
    return "Your login session expired. Please log out, log in again, and retry.";
  }
  return message;
}
