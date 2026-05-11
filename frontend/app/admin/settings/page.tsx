"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type AlertKey =
  | "new_escalation"
  | "escalation_24h"
  | "kb_flagged"
  | "new_registration"
  | "inactive_account"
  | "system_errors";

type Delivery = "in_app" | "email" | "both" | "off";

type AdminPreferences = Record<AlertKey, Delivery> & {
  two_factor_method?: "authenticator" | "email_otp" | "";
};

const defaultPreferences: AdminPreferences = {
  new_escalation: "both",
  escalation_24h: "both",
  kb_flagged: "both",
  new_registration: "off",
  inactive_account: "in_app",
  system_errors: "both",
  two_factor_method: "",
};

const alertRows: Array<{ key: AlertKey; title: string; description: string }> = [
  { key: "new_escalation", title: "New escalation submitted", description: "Alert when a student submits a question the AI could not answer." },
  { key: "escalation_24h", title: "Escalation unresolved after 24 hours", description: "Warn when an assigned lecturer has not responded." },
  { key: "kb_flagged", title: "Knowledge base entry flagged", description: "Alert when negative feedback suggests an answer needs review." },
  { key: "new_registration", title: "New user registration", description: "Optional registration monitoring. Off by default." },
  { key: "inactive_account", title: "User account inactive", description: "Alert when a student or lecturer crosses the inactivity threshold." },
  { key: "system_errors", title: "System errors and integration failures", description: "WhatsApp, email, AI, and operational health alerts." },
];

const inputClass = "mt-2 w-full rounded border border-[var(--gov-outline)] bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--gov-primary)]";

function formatDate(value?: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function mergePreferences(value: unknown): AdminPreferences {
  if (!value || typeof value !== "object") return defaultPreferences;
  return { ...defaultPreferences, ...(value as Partial<AdminPreferences>) };
}

export default function AdminSettingsPage() {
  const router = useRouter();
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
  const [preferences, setPreferences] = useState<AdminPreferences>(defaultPreferences);
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
    async function load() {
      try {
        const supabase = createClient();
        const auth = (await supabase.auth.getUser()).data.user;
        if (!auth) throw new Error("Please log in again.");
        const { data, error: profileError } = await supabase
          .from("users")
          .select("id,name,email,role,department,level,created_at,last_sign_in_at,notification_preferences")
          .eq("id", auth.id)
          .single();
        if (profileError) throw profileError;
        setProfile({
          id: auth.id,
          name: data?.name || "",
          email: data?.email || auth.email || "",
          role: data?.role || "",
          department: data?.department || "",
          level: data?.level ? String(data.level) : "",
          created_at: data?.created_at || "",
          last_sign_in_at: data?.last_sign_in_at || "",
        });
        setEmailDraft(data?.email || auth.email || "");
        setPreferences(mergePreferences(data?.notification_preferences));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not load settings.");
      }
    }
    load();
  }, []);

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
      setMessage("Profile and notification preferences saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save settings.");
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

  async function logout(scope: "local" | "global" = "local") {
    const supabase = createClient();
    await supabase.auth.signOut({ scope });
    router.push("/login");
  }

  return (
    <div className="space-y-6">
      <header className="border-b border-[var(--gov-outline)] pb-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#545f72]">Settings</p>
        <h1 className="mt-2 text-3xl font-black text-[var(--gov-primary)]">Admin Personal Settings</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#3c475a]">
          Manage your own account, security, sessions, alert delivery, and personal platform experience.
        </p>
      </header>

      {message ? <p className="rounded border border-[#b7dfc0] bg-[#f0fff4] p-4 text-sm font-semibold text-[#0a8f31]">{message}</p> : null}
      {error ? <p className="rounded border border-[#ffdad6] bg-[#fff4f2] p-4 text-sm font-semibold text-[#ba1a1a]">{error}</p> : null}

      <form onSubmit={saveProfile} className="space-y-6">
        <section className="gov-card rounded-lg p-5">
          <h2 className="text-xl font-black text-[var(--gov-primary)]">Profile</h2>
          <p className="mt-2 text-sm text-[#545f72]">Your display name appears on announcements, admin actions, and dashboard headers.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field label="Display name"><input value={profile.name} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} className={inputClass} /></Field>
            <Field label="Current email"><input value={profile.email} disabled className={`${inputClass} opacity-70`} /></Field>
            <Field label="New email verification"><div className="flex gap-2"><input value={emailDraft} onChange={(event) => setEmailDraft(event.target.value)} className={inputClass} /><button type="button" onClick={requestEmailChange} disabled={saving === "email" || emailDraft === profile.email} className="mt-2 rounded bg-[var(--gov-primary)] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">Verify</button></div></Field>
            <Field label="Role"><input value={profile.role} disabled className={`${inputClass} capitalize opacity-70`} /></Field>
            <Field label="Account created"><input value={formatDate(profile.created_at)} disabled className={`${inputClass} opacity-70`} /></Field>
            <Field label="Last login"><input value={formatDate(profile.last_sign_in_at)} disabled className={`${inputClass} opacity-70`} /></Field>
          </div>
        </section>

        <section className="gov-card rounded-lg p-5">
          <h2 className="text-xl font-black text-[var(--gov-primary)]">Notification Delivery</h2>
          <p className="mt-2 text-sm text-[#545f72]">Choose how each operational alert reaches you.</p>
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
          <div className="mt-5 rounded border border-[var(--gov-outline)] bg-[#f4f3f7] p-4 text-sm text-[#545f72]">
            Password history: no password change timestamps recorded yet. Add a backend security event log when you want the last five changes persisted.
          </div>
        </form>

        <section className="gov-card rounded-lg p-5">
          <h2 className="text-xl font-black text-[var(--gov-primary)]">Two-factor Authentication</h2>
          <p className="mt-2 text-sm text-[#545f72]">2FA should be mandatory for admin accounts. Choose the preferred method to store in your admin preferences.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              ["authenticator", "Authenticator app"],
              ["email_otp", "Email OTP"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setPreferences((current) => ({ ...current, two_factor_method: value as AdminPreferences["two_factor_method"] }))}
                className={preferences.two_factor_method === value ? "rounded bg-[#d6e3ff] px-4 py-3 font-bold text-[var(--gov-primary)]" : "rounded border border-[var(--gov-outline)] px-4 py-3 font-bold text-[#3c475a]"}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-4 rounded border border-[#fff0b3] bg-[#fff8e1] p-4 text-sm text-[#6f4d00]">
            Full QR-code authenticator enrollment requires enabling Supabase MFA and adding a verification step.
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
            Admin accounts can only be deleted by the dean. Contact your system administrator.
          </p>
          <button disabled className="mt-5 w-full rounded bg-[#e3e2e6] px-5 py-3 font-bold text-[#74777f]">Delete disabled</button>
        </section>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="mt-4 block"><span className="text-sm font-medium text-[#3c475a]">{label}</span>{children}</label>;
}
