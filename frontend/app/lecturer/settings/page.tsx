"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GovernanceLoading, GovernancePageFrame, GovernanceRestricted, GovernanceShell } from "@/components/governance/role-dashboards";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { canAccessLecturer, getRoleHome } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";

type AlertKey = "assigned_escalation" | "cohort_announcement" | "schedule_reminder" | "resource_activity" | "system_updates";
type Delivery = "in_app" | "email" | "both" | "off";
type LecturerPreferences = Record<AlertKey, Delivery> & { two_factor_method?: "authenticator" | "email_otp" | "" };

const defaultPreferences: LecturerPreferences = {
  assigned_escalation: "both",
  cohort_announcement: "in_app",
  schedule_reminder: "both",
  resource_activity: "in_app",
  system_updates: "in_app",
  two_factor_method: "",
};

const alertRows: Array<{ key: AlertKey; title: string; description: string }> = [
  { key: "assigned_escalation", title: "Assigned escalation", description: "Notify when a student question in your cohort needs a lecturer response." },
  { key: "cohort_announcement", title: "Cohort announcement activity", description: "Updates when your announcements are created, edited, or removed." },
  { key: "schedule_reminder", title: "Schedule reminders", description: "Reminders for tests, deadlines, seminars, and class rescheduling you create." },
  { key: "resource_activity", title: "Resource activity", description: "Alerts for resources and past questions you publish to your cohort." },
  { key: "system_updates", title: "System updates", description: "Operational alerts from SmartCampus." },
];

const inputClass = "mt-2 w-full rounded border border-[var(--gov-outline)] bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--gov-primary)]";

function mergePreferences(value: unknown): LecturerPreferences {
  if (!value || typeof value !== "object") return defaultPreferences;
  return { ...defaultPreferences, ...(value as Partial<LecturerPreferences>) };
}

function formatDate(value?: string | null) {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="mt-4 block"><span className="text-sm font-medium text-[#3c475a]">{label}</span>{children}</label>;
}

export default function LecturerSettingsPage() {
  const router = useRouter();
  const { user, loading } = useCurrentUser();
  const [profile, setProfile] = useState({
    id: "",
    name: "",
    email: "",
    role: "",
    department: "",
    level: "",
    created_at: "",
    last_sign_in_at: "",
  });
  const [preferences, setPreferences] = useState<LecturerPreferences>(defaultPreferences);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");

  const sessionDetails = useMemo(() => {
    if (typeof window === "undefined") return [];
    return [
      { label: "Device", value: navigator.platform || "Current device" },
      { label: "Browser", value: navigator.userAgent.split(" ").slice(-2).join(" ") || "Current browser" },
      { label: "Approximate location", value: "Current network" },
      { label: "Last active", value: "Now" },
    ];
  }, []);

  useEffect(() => {
    if (!loading && user && !canAccessLecturer(user.role)) {
      router.replace(getRoleHome(user.role, Boolean(user.is_profile_complete)));
    }
  }, [loading, router, user]);

  useEffect(() => {
    async function load() {
      if (!user?.id) return;
      try {
        const supabase = createClient();
        const { data, error: profileError } = await supabase
          .from("users")
          .select("id,name,email,role,department,level,created_at,last_sign_in_at,notification_preferences")
          .eq("id", user.id)
          .single();
        if (profileError) throw profileError;
        setProfile({
          id: data?.id || user.id,
          name: data?.name || "",
          email: data?.email || "",
          role: data?.role || "",
          department: data?.department || "",
          level: data?.level ? String(data.level) : "",
          created_at: data?.created_at || "",
          last_sign_in_at: data?.last_sign_in_at || "",
        });
        setEmailDraft(data?.email || "");
        setPreferences(mergePreferences(data?.notification_preferences));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not load lecturer settings.");
      }
    }
    load();
  }, [user?.id]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setSaving("profile");
    setError("");
    setMessage("");
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("users")
        .update({ name: profile.name, notification_preferences: preferences, updated_at: new Date().toISOString() })
        .eq("id", profile.id);
      if (updateError) throw updateError;
      setMessage("Lecturer profile and alert preferences saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save lecturer settings.");
    } finally {
      setSaving("");
    }
  }

  async function requestEmailChange() {
    if (!emailDraft || emailDraft === profile.email) return;
    setSaving("email");
    setError("");
    setMessage("");
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ email: emailDraft });
      if (updateError) throw updateError;
      setMessage("Verification email sent. The email changes only after confirmation.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start email verification.");
    } finally {
      setSaving("");
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setSaving("password");
    setError("");
    setMessage("");
    try {
      if (newPassword.length < 8) throw new Error("New password must be at least 8 characters.");
      const supabase = createClient();
      const { error: confirmError } = await supabase.auth.signInWithPassword({ email: profile.email, password: currentPassword });
      if (confirmError) throw new Error("Current password is not correct.");
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      setCurrentPassword("");
      setNewPassword("");
      setMessage("Password changed. Use the new password next time you log in.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not change password.");
    } finally {
      setSaving("");
    }
  }

  async function logout(scope: "local" | "global") {
    const supabase = createClient();
    await supabase.auth.signOut({ scope });
    router.push("/login");
  }

  if (loading) return <GovernanceLoading message="Checking your lecturer role..." />;
  if (!user || !canAccessLecturer(user.role)) return <GovernanceRestricted message="Only lecturer accounts can open lecturer settings." />;

  return (
    <GovernanceShell role="lecturer" user={user}>
      <GovernancePageFrame>
        <div className="space-y-6">
          <header className="border-b border-[var(--gov-outline)] pb-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#545f72]">Settings</p>
            <h1 className="mt-2 text-3xl font-black text-[var(--gov-primary)]">Lecturer Personal Settings</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#3c475a]">
              Manage your own profile, password, sessions, and lecturer alert delivery. Department and level assignment is read-only and controlled by admin.
            </p>
          </header>

          {message ? <p className="rounded border border-[#b7dfc0] bg-[#f0fff4] p-4 text-sm font-semibold text-[#0a8f31]">{message}</p> : null}
          {error ? <p className="rounded border border-[#ffdad6] bg-[#fff4f2] p-4 text-sm font-semibold text-[#ba1a1a]">{error}</p> : null}

          <form onSubmit={saveProfile} className="space-y-6">
            <section className="gov-card rounded-lg p-5">
              <h2 className="text-xl font-black text-[var(--gov-primary)]">Profile</h2>
              <p className="mt-2 text-sm text-[#545f72]">Your display name appears on cohort announcements, resources, and escalation responses.</p>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="Display name"><input value={profile.name} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} className={inputClass} /></Field>
                <Field label="Current email"><input value={profile.email} disabled className={`${inputClass} opacity-70`} /></Field>
                <Field label="New email verification"><div className="flex gap-2"><input value={emailDraft} onChange={(event) => setEmailDraft(event.target.value)} className={inputClass} /><button type="button" onClick={requestEmailChange} disabled={saving === "email" || emailDraft === profile.email} className="mt-2 rounded bg-[var(--gov-primary)] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">Verify</button></div></Field>
                <Field label="Role"><input value={profile.role} disabled className={`${inputClass} capitalize opacity-70`} /></Field>
                <Field label="Assigned department"><input value={profile.department || "Not assigned"} disabled className={`${inputClass} opacity-70`} /></Field>
                <Field label="Assigned level"><input value={profile.level ? `${profile.level}L` : "Not assigned"} disabled className={`${inputClass} opacity-70`} /></Field>
                <Field label="Account created"><input value={formatDate(profile.created_at)} disabled className={`${inputClass} opacity-70`} /></Field>
                <Field label="Last login"><input value={formatDate(profile.last_sign_in_at)} disabled className={`${inputClass} opacity-70`} /></Field>
              </div>
            </section>

            <section className="gov-card rounded-lg p-5">
              <h2 className="text-xl font-black text-[var(--gov-primary)]">Lecturer Alerts</h2>
              <p className="mt-2 text-sm text-[#545f72]">Choose how cohort and academic workflow alerts reach you.</p>
              <div className="mt-5 grid gap-3">
                {alertRows.map((row) => (
                  <div key={row.key} className="grid gap-3 rounded border border-[var(--gov-outline)] p-4 md:grid-cols-[minmax(0,1fr)_180px] md:items-center">
                    <div>
                      <h3 className="font-bold text-[var(--gov-primary)]">{row.title}</h3>
                      <p className="mt-1 text-sm text-[#545f72]">{row.description}</p>
                    </div>
                    <select
                      value={preferences[row.key]}
                      onChange={(event) => setPreferences((current) => ({ ...current, [row.key]: event.target.value as Delivery }))}
                      className="rounded border border-[var(--gov-outline)] px-3 py-2 text-sm"
                    >
                      <option value="in_app">In-app only</option>
                      <option value="email">Email only</option>
                      <option value="both">In-app and email</option>
                      <option value="off">Off</option>
                    </select>
                  </div>
                ))}
              </div>
              <button disabled={saving === "profile"} className="mt-5 rounded bg-[var(--gov-primary)] px-6 py-3 font-bold text-white disabled:opacity-60">{saving === "profile" ? "Saving..." : "Save Profile and Alerts"}</button>
            </section>
          </form>

          <section className="grid gap-6 xl:grid-cols-2">
            <form onSubmit={changePassword} className="gov-card rounded-lg p-5">
              <h2 className="text-xl font-black text-[var(--gov-primary)]">Password</h2>
              <p className="mt-2 text-sm text-[#545f72]">Confirm your current password before changing it.</p>
              <Field label="Current password"><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className={inputClass} /></Field>
              <Field label="New password"><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className={inputClass} /></Field>
              <button disabled={saving === "password"} className="mt-5 rounded bg-[var(--gov-primary)] px-6 py-3 font-bold text-white disabled:opacity-60">{saving === "password" ? "Changing..." : "Change Password"}</button>
            </form>

            <section className="gov-card rounded-lg p-5">
              <h2 className="text-xl font-black text-[var(--gov-primary)]">Two-factor Authentication</h2>
              <p className="mt-2 text-sm text-[#545f72]">Choose your preferred 2FA method for staff account protection.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  ["authenticator", "Authenticator app"],
                  ["email_otp", "Email OTP"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPreferences((current) => ({ ...current, two_factor_method: value as LecturerPreferences["two_factor_method"] }))}
                    className={preferences.two_factor_method === value ? "rounded bg-[#d6e3ff] px-4 py-3 font-bold text-[var(--gov-primary)]" : "rounded border border-[var(--gov-outline)] px-4 py-3 font-bold text-[#3c475a]"}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-4 rounded border border-[#fff0b3] bg-[#fff8e1] p-4 text-sm text-[#6f4d00]">
                Full MFA enrollment requires enabling Supabase MFA and adding a verification step.
              </p>
            </section>
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="gov-card rounded-lg p-5">
              <h2 className="text-xl font-black text-[var(--gov-primary)]">Active Sessions</h2>
              <p className="mt-2 text-sm text-[#545f72]">Review the current browser session and terminate sessions if access looks suspicious.</p>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {sessionDetails.map((item) => (
                  <div key={item.label} className="rounded border border-[var(--gov-outline)] p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#545f72]">{item.label}</p>
                    <p className="mt-2 text-sm font-semibold text-[var(--gov-primary)]">{item.value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" onClick={() => logout("local")} className="rounded border border-[var(--gov-outline)] px-5 py-3 font-bold text-[var(--gov-primary)]">Terminate current session</button>
                <button type="button" onClick={() => logout("global")} className="rounded bg-[var(--gov-primary)] px-5 py-3 font-bold text-white">Terminate all sessions</button>
              </div>
            </section>

            <section className="gov-card rounded-lg border-[#ffdad6] p-5">
              <h2 className="text-xl font-black text-[#ba1a1a]">Delete My Account</h2>
              <p className="mt-2 text-sm leading-6 text-[#545f72]">
                Lecturer accounts can only be deleted by an admin or dean so student-facing content keeps an accountable record.
              </p>
              <button disabled className="mt-5 w-full rounded bg-[#e3e2e6] px-5 py-3 font-bold text-[#74777f]">Delete disabled</button>
            </section>
          </section>
        </div>
      </GovernancePageFrame>
    </GovernanceShell>
  );
}
