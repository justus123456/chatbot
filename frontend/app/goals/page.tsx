"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { BarChart3, CalendarPlus, CheckCircle2, ListChecks, PanelRightClose, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createGoal, deleteGoal, getGoals, updateGoal, updateGoalItem, type Goal, type GoalItem } from "@/lib/api/goals";
import { disconnectGoogleCalendar, getStoredGoogleCalendarToken, isGoogleCalendarConnected, storeGoogleCalendarToken } from "@/lib/google-calendar-auth";
import { createClient } from "@/lib/supabase/client";

type GoogleTokenClient = {
  requestAccessToken: (options?: { prompt?: string }) => void;
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
            error_callback?: (error: { type?: string; message?: string }) => void;
          }) => GoogleTokenClient;
        };
      };
    };
  }
}

const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
const googleScope = "https://www.googleapis.com/auth/calendar.events";
const goalTemplates = [
  {
    title: "Prepare for upcoming exam",
    items: ["Revise lecture notes", "Create flashcards", "Practice past questions"],
  },
  {
    title: "Finish course assignment",
    items: ["Read assignment brief", "Draft answer", "Proofread and submit"],
  },
  {
    title: "Complete weekly study plan",
    items: ["Study two topics", "Summarize key points", "Review weak areas"],
  },
];
const goalItemSuggestions = ["Read chapter", "Summarize notes", "Create flashcards", "Practice past questions", "Submit before deadline"];

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [tokenClient, setTokenClient] = useState<GoogleTokenClient | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [silentReconnectTried, setSilentReconnectTried] = useState(false);
  const [pendingReminderGoal, setPendingReminderGoal] = useState<Goal | null>(null);
  const [addingReminderGoalId, setAddingReminderGoalId] = useState<string | null>(null);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const itemsInputRef = useRef<HTMLTextAreaElement>(null);
  const completedGoals = goals.filter((goal) => getGoalCompletion(goal).complete);
  const activeGoals = goals.filter((goal) => !getGoalCompletion(goal).complete);
  const totalItems = goals.reduce((sum, goal) => sum + Math.max(goal.items?.length || 0, 1), 0);
  const completedItems = goals.reduce((sum, goal) => sum + getGoalCompletion(goal).completed, 0);
  const completionRate = totalItems ? Math.round((completedItems / totalItems) * 100) : 0;

  useEffect(() => {
    setCalendarConnected(isGoogleCalendarConnected());
    const savedToken = getStoredGoogleCalendarToken();
    if (savedToken) setAccessToken(savedToken);
  }, []);

  useEffect(() => {
    const existingScript = document.querySelector<HTMLScriptElement>("script[data-google-identity]");
    if (existingScript) {
      if (window.google?.accounts?.oauth2) {
        setScriptReady(true);
        return;
      }
      const markReady = () => setScriptReady(true);
      existingScript.addEventListener("load", markReady, { once: true });
      return () => existingScript.removeEventListener("load", markReady);
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
    try {
      setTokenClient(
        window.google.accounts.oauth2.initTokenClient({
          client_id: googleClientId,
          scope: googleScope,
          callback: (response) => {
            if (response.access_token) {
              setError("");
              setAccessToken(response.access_token);
              setCalendarConnected(true);
              storeGoogleCalendarToken(response.access_token, response.expires_in || 3600);
            } else {
              setPendingReminderGoal(null);
              setError(getGoogleCalendarError(response.error));
            }
          },
          error_callback: (googleError) => {
            setPendingReminderGoal(null);
            setError(getGoogleCalendarError(googleError.type || googleError.message));
          },
        }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not initialize Google Calendar sign-in.");
    }
  }, [scriptReady]);

  useEffect(() => {
    loadGoals();
  }, []);

  useEffect(() => {
    if (accessToken && pendingReminderGoal) {
      addGoalReminder(pendingReminderGoal, accessToken);
      setPendingReminderGoal(null);
    }
  }, [accessToken, pendingReminderGoal]);

  useEffect(() => {
    if (!tokenClient || !calendarConnected || accessToken || silentReconnectTried) return;
    setSilentReconnectTried(true);
    tokenClient.requestAccessToken({ prompt: "" });
  }, [accessToken, calendarConnected, silentReconnectTried, tokenClient]);

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

  async function loadGoals() {
    setLoading(true);
    setError("");
    try {
      const token = await getAccessToken();
      const result = await getGoals(token);
      setGoals(result.data);
    } catch (caught) {
      setError(toFriendlyError(caught));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSaving(true);
    setError("");
    try {
      const form = new FormData(formElement);
      const token = await getAccessToken();
      const result = await createGoal(
        {
          title: String(form.get("title") || ""),
          description: String(form.get("description") || ""),
          deadline: String(form.get("deadline") || ""),
          target_value: Number(form.get("target_value") || 100),
          current_value: Number(form.get("current_value") || 0),
          unit: String(form.get("unit") || "percent"),
          items: String(form.get("items") || "")
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
        },
        token,
      );
      setGoals((items) => [result.goal, ...items]);
      formElement.reset();
    } catch (caught) {
      setError(toFriendlyError(caught));
    } finally {
      setSaving(false);
    }
  }

  function applyGoalTemplate(template: (typeof goalTemplates)[number]) {
    if (titleInputRef.current) {
      titleInputRef.current.value = template.title;
      titleInputRef.current.focus();
    }
    if (itemsInputRef.current) {
      itemsInputRef.current.value = template.items.join("\n");
    }
  }

  function appendGoalItemSuggestion(suggestion: string) {
    if (!itemsInputRef.current) return;
    const current = itemsInputRef.current.value.trim();
    itemsInputRef.current.value = current ? `${current}\n${suggestion}` : suggestion;
    itemsInputRef.current.focus();
  }

  async function toggleGoalComplete(goal: Goal) {
    if (goal.items?.length) {
      const complete = !getGoalCompletion(goal).complete;
      const optimisticItems = goal.items.map((item) => ({ ...item, is_completed: complete }));
      setGoals((items) => items.map((item) => item.id === goal.id ? { ...item, items: optimisticItems } : item));
      try {
        const token = await getAccessToken();
        await Promise.all(goal.items.map((item) => updateGoalItem(goal.id, item.id, { is_completed: complete }, token)));
        await loadGoals();
      } catch (caught) {
        setError(toFriendlyError(caught));
      }
      return;
    }

    const completed = !getGoalCompletion(goal).complete;
    const nextCurrentValue = completed ? goal.target_value : 0;
    const progress = completed ? 100 : 0;
    const status = completed ? "completed" : "pending";
    setGoals((items) => items.map((item) => item.id === goal.id ? { ...item, current_value: nextCurrentValue, progress, status } : item));
    try {
      const token = await getAccessToken();
      await updateGoal(goal.id, { current_value: nextCurrentValue, progress, status }, token);
    } catch (caught) {
      setError(toFriendlyError(caught));
    }
  }

  async function toggleGoalItem(goal: Goal, item: GoalItem) {
    setGoals((goals) => goals.map((currentGoal) => {
      if (currentGoal.id !== goal.id) return currentGoal;
      return {
        ...currentGoal,
        items: currentGoal.items?.map((currentItem) => currentItem.id === item.id ? { ...currentItem, is_completed: !item.is_completed } : currentItem),
      };
    }));
    try {
      const token = await getAccessToken();
      await updateGoalItem(goal.id, item.id, { is_completed: !item.is_completed }, token);
      await loadGoals();
    } catch (caught) {
      setError(toFriendlyError(caught));
    }
  }

  async function handleDeleteGoal(goalId: string) {
    setGoals((items) => items.filter((goal) => goal.id !== goalId));
    try {
      const token = await getAccessToken();
      await deleteGoal(goalId, token);
    } catch (caught) {
      setError(toFriendlyError(caught));
    }
  }

  function requestGoalReminder(goal: Goal) {
    setSuccess("");
    setError("");
    if (!goal.deadline) {
      setError("Add a deadline before creating a calendar reminder.");
      return;
    }
    if (!googleClientId) {
      setError("Add NEXT_PUBLIC_GOOGLE_CLIENT_ID to frontend/.env.local first.");
      return;
    }
    if (!scriptReady) {
      setError("Google sign-in is still loading. Try Add reminder again in a moment.");
      return;
    }
    if (!window.google?.accounts?.oauth2) {
      setError("Google sign-in did not load. Check your internet connection, ad blocker, or browser privacy settings.");
      return;
    }
    if (accessToken) {
      addGoalReminder(goal, accessToken);
      return;
    }
    if (!tokenClient) {
      setError("Google sign-in is still loading. Try Add reminder again in a moment.");
      return;
    }
    setPendingReminderGoal(goal);
    tokenClient?.requestAccessToken({ prompt: "consent" });
  }

  async function addGoalReminder(goal: Goal, googleToken: string) {
    setError("");
    setSuccess("");
    setAddingReminderGoalId(goal.id);
    try {
      const start = new Date(`${goal.deadline}T09:00:00`);
      const end = new Date(start);
      end.setHours(start.getHours() + 1);
      const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${googleToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: `Goal reminder: ${goal.title || goal.goal_text}`,
          description: goal.description || "SmartCampus goal reminder",
          start: { dateTime: start.toISOString(), timeZone: "Africa/Lagos" },
          end: { dateTime: end.toISOString(), timeZone: "Africa/Lagos" },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) {
          disconnectGoogleCalendar();
          setCalendarConnected(false);
          setAccessToken("");
          throw new Error("Google Calendar needs a fresh sign-in. Click Add reminder again to reconnect.");
        }
        throw new Error(payload.error?.message || "Could not add reminder to Google Calendar.");
      }
      setSuccess(`Reminder added to Google Calendar for ${goal.title || goal.goal_text}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add reminder to Google Calendar.");
    } finally {
      setAddingReminderGoalId(null);
    }
  }

  return (
    <AppShell>
      <div className="relative min-h-[calc(100vh-8rem)]">
        <div className="fixed right-6 top-28 z-30 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => {
              setRatingOpen(false);
              setGoalsOpen((current) => !current);
            }}
            className="grid size-12 place-items-center rounded-full border border-[var(--border-soft)] bg-[var(--panel)] text-[var(--text-main)] shadow-glass backdrop-blur-xl transition hover:border-[var(--accent-soft)] hover:text-[var(--accent)]"
            aria-label="Open active goals"
            title="Active goals"
          >
            <ListChecks className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setGoalsOpen(false);
              setRatingOpen((current) => !current);
            }}
            className="grid size-12 place-items-center rounded-full border border-[var(--border-soft)] bg-[var(--panel)] text-[var(--text-main)] shadow-glass backdrop-blur-xl transition hover:border-[var(--accent-soft)] hover:text-[var(--accent)]"
            aria-label="Open goal rating"
            title="Goal rating"
          >
            <BarChart3 className="size-5" />
          </button>
        </div>

        <Card className="mx-auto max-w-5xl overflow-hidden p-0">
          <div className="border-b border-[var(--border-soft)] bg-[var(--panel-strong)] px-6 py-6 sm:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-mint">Goals</p>
                <h1 className="mt-2 text-3xl font-semibold">Set a goal with clear steps.</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">
                  Create one goal, break it into checkbox tasks, then add a reminder to your Google Calendar when it has a deadline.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 rounded-3xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] p-3 text-center">
                <MiniStat label="Active" value={activeGoals.length} />
                <MiniStat label="Done" value={completedGoals.length} />
                <MiniStat label="Rate" value={`${completionRate}%`} />
              </div>
            </div>
          </div>

          <form className="grid gap-6 p-6 sm:p-8" onSubmit={handleCreateGoal}>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
              <div className="space-y-3">
                <label className="text-sm font-medium text-[var(--text-main)]" htmlFor="goal-title">Goal title</label>
                <input id="goal-title" ref={titleInputRef} name="title" list="goal-title-suggestions" className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] px-4 py-3 text-[var(--text-main)] outline-none placeholder:text-[var(--text-soft)] focus:border-[var(--accent-soft)]" placeholder="Example: Prepare for upcoming exam" required />
                <datalist id="goal-title-suggestions">
                  {goalTemplates.map((template) => <option key={template.title} value={template.title} />)}
                </datalist>
              </div>
              <div className="space-y-3">
                <label className="text-sm font-medium text-[var(--text-main)]" htmlFor="goal-deadline">Deadline</label>
                <input id="goal-deadline" name="deadline" className="w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] px-4 py-3 text-[var(--text-main)] outline-none focus:border-[var(--accent-soft)]" type="date" />
              </div>
            </div>

            <div className="space-y-3">
              <span className="text-sm font-medium text-[var(--text-main)]">Quick templates</span>
              <div className="flex flex-wrap gap-2">
                {goalTemplates.map((template) => (
                  <button key={template.title} type="button" onClick={() => applyGoalTemplate(template)} className="rounded-full border border-[var(--border-soft)] bg-[var(--panel-strong)] px-3 py-1.5 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent-soft)] hover:text-[var(--accent)]">
                    {template.title}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <label className="text-sm font-medium text-[var(--text-main)]" htmlFor="goal-description">Description</label>
                <textarea id="goal-description" name="description" className="min-h-40 w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] px-4 py-3 text-[var(--text-main)] outline-none placeholder:text-[var(--text-soft)] focus:border-[var(--accent-soft)]" placeholder="Why does this goal matter, and what should be different when it is done?" />
              </div>
              <div className="space-y-3">
                <label className="text-sm font-medium text-[var(--text-main)]" htmlFor="goal-items">Checklist</label>
                <textarea id="goal-items" ref={itemsInputRef} name="items" className="min-h-40 w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] px-4 py-3 text-[var(--text-main)] outline-none placeholder:text-[var(--text-soft)] focus:border-[var(--accent-soft)]" placeholder={"One task per line\nRead chapter 1\nCreate flashcards\nPractice past questions"} />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {goalItemSuggestions.map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => appendGoalItemSuggestion(suggestion)} className="rounded-full border border-[var(--border-soft)] bg-[var(--panel-strong)] px-3 py-1.5 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent-soft)] hover:text-[var(--accent)]">
                  {suggestion}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-3 border-t border-[var(--border-soft)] pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-[var(--text-muted)]">After creating it, open the goals icon to check items off or add a calendar reminder.</p>
              <Button type="submit" disabled={saving}>{saving ? "Creating..." : "Create goal"}</Button>
            </div>
            <input name="target_value" type="hidden" value="1" />
            <input name="current_value" type="hidden" value="0" />
            <input name="unit" type="hidden" value="task" />
          </form>
          {success ? <p className="mx-6 mb-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-200 sm:mx-8">{success}</p> : null}
          {error ? <p className="mx-6 mb-6 rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200 sm:mx-8">{error}</p> : null}
        </Card>

        <aside className={`fixed inset-y-0 right-0 z-40 w-full max-w-xl p-4 transition duration-300 ${goalsOpen ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-8 opacity-0"}`}>
          <Card className="flex h-full flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--border-soft)] pb-4">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-mint">Your goals</p>
                <h2 className="mt-2 text-2xl font-semibold">Active and completed</h2>
              </div>
              <button
                type="button"
                onClick={() => setGoalsOpen(false)}
                className="grid size-10 place-items-center rounded-full border border-[var(--border-soft)] bg-[var(--panel-strong)] text-[var(--text-main)] transition hover:border-[var(--accent-soft)] hover:text-[var(--accent)]"
                aria-label="Close active goals"
              >
                <PanelRightClose className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-5 pr-1">
              {loading ? <p className="text-sm text-[var(--text-muted)]">Loading goals...</p> : null}
              {!loading && activeGoals.length ? (
                <GoalGroup
                  title="Active goals"
                  goals={activeGoals}
                  onDelete={handleDeleteGoal}
                  onReminder={requestGoalReminder}
                  onToggleComplete={toggleGoalComplete}
                  onToggleItem={toggleGoalItem}
                  addingReminderGoalId={addingReminderGoalId}
                />
              ) : null}
              {!loading && completedGoals.length ? (
                <GoalGroup
                  title="Completed goals"
                  goals={completedGoals}
                  onDelete={handleDeleteGoal}
                  onReminder={requestGoalReminder}
                  onToggleComplete={toggleGoalComplete}
                  onToggleItem={toggleGoalItem}
                  addingReminderGoalId={addingReminderGoalId}
                />
              ) : null}
              {!loading && !goals.length ? <p className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] p-4 text-sm text-[var(--text-muted)]">No goals yet. Create your first goal to start tracking progress.</p> : null}
            </div>
          </Card>
        </aside>

        <aside className={`fixed inset-y-0 right-0 z-40 w-full max-w-sm p-4 transition duration-300 ${ratingOpen ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-8 opacity-0"}`}>
          <Card className="flex h-full flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--border-soft)] pb-4">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-mint">Goal rating</p>
                <h2 className="mt-2 text-3xl font-semibold">{completionRate}%</h2>
              </div>
              <button
                type="button"
                onClick={() => setRatingOpen(false)}
                className="grid size-10 place-items-center rounded-full border border-[var(--border-soft)] bg-[var(--panel-strong)] text-[var(--text-main)] transition hover:border-[var(--accent-soft)] hover:text-[var(--accent)]"
                aria-label="Close goal rating"
              >
                <PanelRightClose className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto py-5">
              <p className="text-sm text-[var(--text-muted)]">Completion rate based on your saved goals.</p>
              <div className="mt-6 space-y-3">
                <StatRow label="Completed items" value={completedItems} />
                <StatRow label="Not completed" value={Math.max(totalItems - completedItems, 0)} />
                <StatRow label="Total items" value={totalItems} />
              </div>
              <div className="mt-6 h-3 overflow-hidden rounded-full bg-[var(--panel)]">
                <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${completionRate}%` }} />
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}

function GoalGroup({
  title,
  goals,
  onDelete,
  onReminder,
  onToggleComplete,
  onToggleItem,
  addingReminderGoalId,
}: {
  title: string;
  goals: Goal[];
  onDelete: (goalId: string) => void;
  onReminder: (goal: Goal) => void;
  onToggleComplete: (goal: Goal) => void;
  onToggleItem: (goal: Goal, item: GoalItem) => void;
  addingReminderGoalId: string | null;
}) {
  return (
    <section className="space-y-4">
      <h3 className="text-sm uppercase tracking-[0.25em] text-[var(--text-soft)]">{title}</h3>
      {goals.map((goal) => (
        <article key={goal.id} className="rounded-3xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <label className="flex min-w-0 gap-3">
              <input
                type="checkbox"
                checked={getGoalCompletion(goal).complete}
                onChange={() => onToggleComplete(goal)}
                className="mt-1 size-5 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-xl font-semibold">{goal.title || goal.goal_text}</span>
                {goal.description ? <span className="mt-2 block text-sm leading-6 text-[var(--text-muted)]">{goal.description}</span> : null}
                <span className="mt-3 block text-xs text-[var(--text-soft)]">{goal.deadline ? `Deadline: ${goal.deadline}` : "No deadline set"}</span>
              </span>
            </label>
            <span className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs text-[var(--accent)]">
              <CheckCircle2 className="size-3" />
              {goal.status}
            </span>
          </div>
          {goal.items?.length ? (
            <div className="mt-5 space-y-2 rounded-2xl border border-[var(--border-soft)] bg-[var(--panel)] p-3">
              {goal.items.map((item) => (
                <label key={item.id} className="flex items-start gap-3 rounded-xl px-2 py-2 text-sm text-[var(--text-main)] transition hover:bg-[var(--panel-strong)]">
                  <input
                    type="checkbox"
                    checked={item.is_completed}
                    onChange={() => onToggleItem(goal, item)}
                    className="mt-0.5 size-4 accent-[var(--accent)]"
                  />
                  <span className={item.is_completed ? "text-[var(--text-muted)] line-through" : ""}>{item.title}</span>
                </label>
              ))}
            </div>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="button" variant="outline" onClick={() => onReminder(goal)} disabled={addingReminderGoalId === goal.id}>
              <CalendarPlus className="size-4" />
              {addingReminderGoalId === goal.id ? "Adding..." : "Add reminder"}
            </Button>
            <button type="button" onClick={() => onDelete(goal.id)} className="inline-flex items-center gap-2 rounded-full border border-red-400/20 px-4 py-2 text-sm text-red-300 transition hover:bg-red-500/10">
              <Trash2 className="size-4" />
              Delete
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}

function getGoalCompletion(goal: Goal) {
  if (goal.items?.length) {
    const completed = goal.items.filter((item) => item.is_completed).length;
    return { completed, total: goal.items.length, complete: completed === goal.items.length };
  }
  return { completed: goal.status === "completed" ? 1 : 0, total: 1, complete: goal.status === "completed" };
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="min-w-16 rounded-2xl px-3 py-2">
      <strong className="block text-lg text-[var(--text-main)]">{value}</strong>
      <span className="mt-1 block text-[11px] uppercase tracking-[0.18em] text-[var(--text-soft)]">{label}</span>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] p-4">
      <span className="text-sm text-[var(--text-muted)]">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function toFriendlyError(caught: unknown) {
  const message = caught instanceof Error ? caught.message : "Could not complete that action.";
  if (message === "Invalid token" || message === "Unauthorized") {
    return "Your login session expired. Please log out, log in again, and retry.";
  }
  return message;
}

function getGoogleCalendarError(error?: string) {
  const value = (error || "").toLowerCase();
  if (value.includes("popup_failed_to_open")) return "Google sign-in popup was blocked. Allow popups for this site and try again.";
  if (value.includes("popup_closed")) return "Google sign-in was closed before permission was granted.";
  if (value.includes("access_denied")) return "Google Calendar permission was denied.";
  if (value.includes("origin") || value.includes("redirect") || value.includes("invalid_client")) {
    return "Google OAuth is not configured for this site. In Google Cloud Console, add http://localhost:3000 to Authorized JavaScript origins for this OAuth client.";
  }
  return error ? `Google Calendar connection failed: ${error}` : "Google Calendar permission was not granted.";
}
