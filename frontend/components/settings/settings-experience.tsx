"use client";

import { FormEvent, useEffect, useState } from "react";
import { CalendarCheck2, CheckCircle2, LogOut, Moon, Save, Sun, Unplug, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getStoredTheme, setTheme } from "@/components/theme/theme-provider";
import { apiFetch } from "@/lib/api/flask-client";
import { disconnectGoogleCalendar, isGoogleCalendarConnected } from "@/lib/google-calendar-auth";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type SettingsForm = {
  name: string;
  department: string;
  level: string;
  matric_number: string;
  phone: string;
  preferred_language: "en" | "pidgin";
  preferred_tone: "formal" | "simple";
};

const emptyForm: SettingsForm = {
  name: "",
  department: "",
  level: "",
  matric_number: "",
  phone: "",
  preferred_language: "en",
  preferred_tone: "simple",
};

export function SettingsExperience() {
  const router = useRouter();
  const [form, setForm] = useState<SettingsForm>(emptyForm);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("student");
  const [theme, setThemeState] = useState<"light" | "dark">("dark");
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setCalendarConnected(isGoogleCalendarConnected());
    setThemeState(getStoredTheme());
    loadProfile();
  }, []);

  function updateField<K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function getSessionToken() {
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

  async function loadProfile() {
    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) throw new Error("Please log in again.");

      await apiFetch("/api/auth/bootstrap-user", data.session?.access_token, { method: "POST" });
      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("name,email,role,department,level,matric_number,phone,preferred_language,preferred_tone")
        .eq("id", user.id)
        .single();

      if (profileError) throw new Error(profileError.message);
      setEmail(profile?.email || user.email || "");
      setRole(profile?.role || "student");
      setForm({
        name: profile?.name || "",
        department: profile?.department || "",
        level: profile?.level ? String(profile.level) : "",
        matric_number: profile?.matric_number || "",
        phone: profile?.phone || "",
        preferred_language: profile?.preferred_language === "pidgin" ? "pidgin" : "en",
        preferred_tone: profile?.preferred_tone === "formal" ? "formal" : "simple",
      });
    } catch (caught) {
      setError(toFriendlyError(caught));
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) throw new Error("Please log in again.");

      const payload = {
        name: form.name.trim(),
        department: form.department.trim(),
        level: form.level ? Number(form.level) : null,
        matric_number: form.matric_number.trim(),
        phone: form.phone.trim(),
        preferred_language: form.preferred_language,
        preferred_tone: form.preferred_tone,
        is_profile_complete: Boolean(form.department && form.level && form.matric_number && form.phone),
        updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase.from("users").update(payload).eq("id", user.id);
      if (updateError) throw new Error(updateError.message);
      setMessage("Settings saved.");
      router.refresh();
    } catch (caught) {
      setError(toFriendlyError(caught));
    } finally {
      setSaving(false);
    }
  }

  function handleThemeChange(nextTheme: "light" | "dark") {
    setTheme(nextTheme);
    setThemeState(nextTheme);
    setMessage(`${nextTheme === "light" ? "Light" : "Dark"} mode enabled.`);
  }

  function handleDisconnectCalendar() {
    disconnectGoogleCalendar();
    setCalendarConnected(false);
    setMessage("Google Calendar has been disconnected from SmartCampus on this browser.");
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
      <div className="grid h-[calc(100vh-8rem)] min-h-[680px] gap-5 overflow-hidden xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="min-h-0 overflow-y-auto">
          <p className="text-sm uppercase tracking-[0.3em] text-mint">Settings</p>
          <h1 className="mt-2 text-3xl font-semibold">Manage your profile.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">
            Update your student profile, app preferences, and connected services.
          </p>

          {loading ? <p className="mt-6 text-sm text-[var(--text-muted)]">Loading settings...</p> : null}

          <form className="mt-6 grid gap-6" onSubmit={saveProfile}>
            <section className="rounded-3xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] p-5">
              <SectionHeader icon={<UserRound className="size-5" />} title="Profile" subtitle={email || "Student account"} />
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="Full name">
                  <input value={form.name} onChange={(event) => updateField("name", event.target.value)} className={inputClass} placeholder="Your name" />
                </Field>
                <Field label="Role">
                  <input value={role} className={cn(inputClass, "opacity-70")} disabled />
                </Field>
                <Field label="Department">
                  <input value={form.department} onChange={(event) => updateField("department", event.target.value)} className={inputClass} placeholder="Computer Science" />
                </Field>
                <Field label="Level">
                  <select value={form.level} onChange={(event) => updateField("level", event.target.value)} className={inputClass}>
                    <option value="">Select level</option>
                    {[100, 200, 300, 400, 500].map((level) => <option key={level} value={level}>{level} Level</option>)}
                  </select>
                </Field>
                <Field label="Matric number">
                  <input value={form.matric_number} onChange={(event) => updateField("matric_number", event.target.value)} className={inputClass} placeholder="VUG/CSC/23/001" />
                </Field>
                <Field label="Phone number">
                  <input value={form.phone} onChange={(event) => updateField("phone", event.target.value)} className={inputClass} placeholder="+234 801 234 5678" />
                </Field>
              </div>
            </section>

            <section className="rounded-3xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] p-5">
              <SectionHeader icon={<CheckCircle2 className="size-5" />} title="Assistant preferences" subtitle="Control how SmartCampus responds to you." />
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="Language">
                  <select value={form.preferred_language} onChange={(event) => updateField("preferred_language", event.target.value as SettingsForm["preferred_language"])} className={inputClass}>
                    <option value="en">English</option>
                    <option value="pidgin">Pidgin</option>
                  </select>
                </Field>
                <Field label="Tone">
                  <select value={form.preferred_tone} onChange={(event) => updateField("preferred_tone", event.target.value as SettingsForm["preferred_tone"])} className={inputClass}>
                    <option value="simple">Simple</option>
                    <option value="formal">Formal</option>
                  </select>
                </Field>
              </div>
            </section>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button type="submit" disabled={saving || loading}>
                <Save className="size-4" />
                {saving ? "Saving..." : "Save settings"}
              </Button>
              {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
              {error ? <p className="text-sm text-red-300">{error}</p> : null}
            </div>
          </form>
        </Card>

        <div className="min-h-0 space-y-5 overflow-y-auto">
          <Card>
            <SectionHeader icon={<Sun className="size-5" />} title="Appearance" subtitle="Choose the display mode for this browser." />
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => handleThemeChange("light")} className={themeButtonClass(theme === "light")}>
                <Sun className="size-4" />
                Light
              </button>
              <button type="button" onClick={() => handleThemeChange("dark")} className={themeButtonClass(theme === "dark")}>
                <Moon className="size-4" />
                Dark
              </button>
            </div>
          </Card>

          <Card>
            <SectionHeader icon={<CalendarCheck2 className="size-5" />} title="Google Calendar" subtitle="Keep Calendar connected until you disconnect it here." />
            <p className="mt-4 text-sm font-medium text-[var(--text-main)]">
              Status: {calendarConnected ? "Connected" : "Not connected"}
            </p>
            <Button type="button" variant="outline" className="mt-5 w-full justify-center" onClick={handleDisconnectCalendar} disabled={!calendarConnected}>
              <Unplug className="size-4" />
              Disconnect Calendar
            </Button>
          </Card>

          <Card>
            <SectionHeader icon={<LogOut className="size-5" />} title="Session" subtitle="Leave this device safely." />
            <Button type="button" variant="outline" className="mt-5 w-full justify-center" onClick={handleLogout}>
              <LogOut className="size-4" />
              Log out
            </Button>
          </Card>
        </div>
      </div>
  );
}

const inputClass = "w-full rounded-2xl border border-[var(--border-soft)] bg-[var(--panel)] px-4 py-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-soft)] focus:border-[var(--accent-soft)]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-medium text-[var(--text-main)]">{label}</span>
      {children}
    </label>
  );
}

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">{icon}</span>
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">{subtitle}</p>
      </div>
    </div>
  );
}

function themeButtonClass(active: boolean) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm transition",
    active
      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
      : "border-[var(--border-soft)] bg-[var(--bg-elevated)] text-[var(--text-main)] hover:border-[var(--accent-soft)]",
  );
}

function toFriendlyError(caught: unknown) {
  const message = caught instanceof Error ? caught.message : "Could not complete that action.";
  if (message === "Invalid token" || message === "Unauthorized") {
    return "Your login session expired. Please log out, log in again, and retry.";
  }
  return message;
}
