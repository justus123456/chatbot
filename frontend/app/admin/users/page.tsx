"use client";

import { useEffect, useMemo, useState } from "react";
import { createAdminUser, deleteAdminUser, getAdminUsers, getFreshAccessToken, updateAdminUser, type AdminUserRow } from "@/lib/api/admin";
import { useCurrentUser } from "@/lib/hooks/use-current-user";

const roles = ["student", "lecturer", "admin", "dean"] as const;
const editableRoles = ["student", "lecturer", "admin", "dean"] as const;
const roleLabels: Record<(typeof roles)[number], string> = {
  student: "Students",
  lecturer: "Lecturers",
  admin: "Admins",
  dean: "Dean",
};

function formatDate(value?: string | null) {
  if (!value) return "Never tracked";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Never tracked";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function isActiveRecently(value?: string | null) {
  if (!value) return false;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) && Date.now() - parsed <= 30 * 24 * 60 * 60 * 1000;
}

function preferencesLabel(preferences: Record<string, unknown>) {
  const entries = Object.entries(preferences || {});
  if (!entries.length) return "Default";
  return entries
    .slice(0, 2)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(", ");
}

export default function AdminUsersPage() {
  const { user: currentUser } = useCurrentUser();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [role, setRole] = useState<(typeof roles)[number]>("student");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const filteredUsers = useMemo(() => users.filter((user) => user.role === role), [role, users]);
  const studentCount = users.filter((user) => user.role === "student").length;
  const staffCount = users.length - studentCount;
  const roleCounts = useMemo(
    () => Object.fromEntries(roles.map((item) => [item, users.filter((user) => user.role === item).length])) as Record<(typeof roles)[number], number>,
    [users],
  );
  const isDean = currentUser?.role === "dean";
  const creatableRoles = isDean ? (["lecturer", "admin", "dean"] as const) : (["lecturer"] as const);
  const rolesForEditing = isDean ? [...editableRoles] : ["student", "lecturer"];
  const fieldClass = "rounded border border-[var(--gov-outline)] bg-white px-3 py-2 text-sm text-[#1a1c1e] placeholder:text-[#74777f] outline-none focus:ring-2 focus:ring-[var(--gov-primary)]";
  const correctionFieldClass = "rounded border border-[var(--gov-outline)] bg-white px-2 py-2 text-xs text-[#1a1c1e] placeholder:text-[#74777f] outline-none focus:ring-1 focus:ring-[var(--gov-primary)]";

  useEffect(() => {
    async function loadUsers() {
      setLoading(true);
      setError("");
      try {
        const result = await getAdminUsers(await getFreshAccessToken());
        setUsers(result.data);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not load users.");
      } finally {
        setLoading(false);
      }
    }

    loadUsers();
  }, []);

  async function saveUser(user: AdminUserRow, form: HTMLFormElement) {
    setSavingId(user.id);
    setError("");
    const data = new FormData(form);
    try {
      const updated = await updateAdminUser(
        user.id,
        {
          role: String(data.get("role") || user.role) as AdminUserRow["role"],
          name: String(data.get("name") || user.name || "").trim(),
          email: String(data.get("email") || user.email || "").trim(),
          department: String(data.get("department") || "").trim() || null,
          level: data.get("level") ? Number(data.get("level")) : null,
          is_profile_complete: data.get("is_profile_complete") === "true",
        },
        await getFreshAccessToken(),
      );
      setUsers((current) => current.map((item) => (item.id === user.id ? { ...item, ...updated } : item)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update user.");
    } finally {
      setSavingId("");
    }
  }

  async function createStaff(form: HTMLFormElement) {
    setCreating(true);
    setError("");
    const data = new FormData(form);
    try {
      const created = await createAdminUser(
        {
          name: String(data.get("name") || "").trim(),
          email: String(data.get("email") || "").trim(),
          password: String(data.get("password") || "").trim(),
          role: String(data.get("role") || "lecturer") as "lecturer" | "admin" | "dean",
          department: String(data.get("department") || "").trim() || null,
          level: data.get("level") ? Number(data.get("level")) : null,
        },
        await getFreshAccessToken(),
      );
      setUsers((current) => [created, ...current]);
      form.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create user.");
    } finally {
      setCreating(false);
    }
  }

  async function removeUser(user: AdminUserRow) {
    if (!confirm(`Soft-delete ${user.email}? This hides the account from active admin lists.`)) return;
    setSavingId(user.id);
    setError("");
    try {
      await deleteAdminUser(user.id, await getFreshAccessToken());
      setUsers((current) => current.filter((item) => item.id !== user.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete user.");
    } finally {
      setSavingId("");
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-3 border-b border-[var(--gov-outline)] pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#545f72]">Academic Cohorts</p>
          <h1 className="mt-2 text-3xl font-black text-[var(--gov-primary)]">Users</h1>
          <p className="mt-2 text-sm text-[#3c475a]">Review accounts, correct scope fields, and view aggregate activity without opening private student content.</p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="gov-card rounded p-3"><strong>{users.length}</strong><br /><span className="text-xs text-[#545f72]">Total</span></div>
          <div className="gov-card rounded p-3"><strong>{studentCount}</strong><br /><span className="text-xs text-[#545f72]">Students</span></div>
          <div className="gov-card rounded p-3"><strong>{staffCount}</strong><br /><span className="text-xs text-[#545f72]">Staff</span></div>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-4">
        {roles.map((item) => (
          <button
            key={item}
            onClick={() => setRole(item)}
            className={role === item ? "rounded-lg border-2 border-[var(--gov-primary)] bg-[#d6e3ff] px-4 py-4 text-left shadow-sm" : "rounded-lg border border-[var(--gov-outline)] bg-white px-4 py-4 text-left hover:border-[var(--gov-primary)]"}
            aria-expanded={role === item}
          >
            <span className="block text-xs font-bold uppercase tracking-[0.16em] text-[#545f72]">{role === item ? "Open" : "Open section"}</span>
            <span className="mt-2 block text-lg font-black text-[var(--gov-primary)]">{roleLabels[item]}</span>
            <span className="mt-1 block text-sm text-[#545f72]">{roleCounts[item]} records</span>
          </button>
        ))}
      </div>

      {error ? <p className="rounded border border-[#ffdad6] bg-[#fff4f2] p-4 text-sm text-[#ba1a1a]">{error}</p> : null}

      <form
        className="gov-card rounded-lg p-5"
        onSubmit={(event) => {
          event.preventDefault();
          createStaff(event.currentTarget);
        }}
      >
        <div className="mb-4">
          <h2 className="text-lg font-black text-[var(--gov-primary)]">Create staff account</h2>
          <p className="mt-1 text-sm text-[#545f72]">{isDean ? "Create lecturer, admin, or dean accounts. Students still self-register." : "Create lecturer accounts. Admin accounts are created by the dean."}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input name="name" required placeholder="Staff name" className={fieldClass} />
          <input name="email" required type="email" placeholder="Email" className={fieldClass} />
          <input name="password" required type="password" placeholder="Temporary password" className={fieldClass} />
          <select name="role" defaultValue="lecturer" className={fieldClass}>
            {creatableRoles.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <input name="department" placeholder="Department" className={fieldClass} />
          <input name="level" type="number" placeholder="Level" className={fieldClass} />
          <button disabled={creating} className="rounded bg-[var(--gov-primary)] px-4 py-2 text-sm font-bold text-white disabled:opacity-60 md:col-span-2">
            {creating ? "Creating" : "Create Staff"}
          </button>
        </div>
      </form>

      <section className="gov-card overflow-hidden rounded-lg">
        <div className="flex flex-col gap-1 border-b border-[var(--gov-outline)] bg-[#f2f1f5] px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-black text-[var(--gov-primary)]">{roleLabels[role]}</h2>
            <p className="text-sm text-[#545f72]">Only this group is shown. Open another section above to replace this list.</p>
          </div>
          <span className="rounded bg-white px-3 py-1 text-xs font-bold uppercase text-[#3c475a]">{filteredUsers.length} visible</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#f2f1f5] text-xs uppercase text-[#3c475a]">
              <tr>
                <th className="px-5 py-4">User</th>
                <th className="px-5 py-4">Role</th>
                <th className="px-5 py-4">Department</th>
                <th className="px-5 py-4">Level</th>
                <th className="px-5 py-4">Created</th>
                <th className="px-5 py-4">Last Login</th>
                <th className="px-5 py-4">Notifications</th>
                <th className="px-5 py-4">Aggregates</th>
                <th className="px-5 py-4">Profile</th>
                <th className="px-5 py-4">Correction</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="px-5 py-6 text-[#545f72]" colSpan={10}>Loading {roleLabels[role].toLowerCase()}...</td></tr>
              ) : filteredUsers.length ? filteredUsers.map((user) => (
                <tr key={user.id} className="border-t border-[var(--gov-outline)]">
                  <td className="px-5 py-4"><strong>{user.name || "Unnamed user"}</strong><br /><span className="text-xs text-[#545f72]">{user.email}</span></td>
                  <td className="px-5 py-4 capitalize">{user.role}</td>
                  <td className="px-5 py-4">{user.department || "-"}</td>
                  <td className="px-5 py-4">{user.level ? `${user.level}L` : "-"}</td>
                  <td className="px-5 py-4 text-xs text-[#545f72]">{formatDate(user.created_at)}</td>
                  <td className="px-5 py-4">
                    <span className={isActiveRecently(user.last_sign_in_at) ? "rounded bg-[#e8f5e9] px-3 py-1 text-xs font-bold text-[#0a8f31]" : "rounded bg-[#efedf1] px-3 py-1 text-xs font-bold text-[#545f72]"}>
                      {isActiveRecently(user.last_sign_in_at) ? "Active < 30d" : "Inactive/unknown"}
                    </span>
                    <p className="mt-2 text-xs text-[#545f72]">{formatDate(user.last_sign_in_at)}</p>
                  </td>
                  <td className="max-w-[220px] px-5 py-4 text-xs text-[#545f72]">{preferencesLabel(user.notification_preferences)}</td>
                  <td className="px-5 py-4 text-sm">
                    <strong>{user.document_count}</strong> docs
                    <br />
                    <strong>{user.chat_session_count}</strong> chats
                  </td>
                  <td className="px-5 py-4"><span className={user.is_profile_complete ? "rounded bg-[#e8f5e9] px-3 py-1 text-xs font-bold text-[#0a8f31]" : "rounded bg-[#fff8e1] px-3 py-1 text-xs font-bold text-[#8a5a00]"}>{user.is_profile_complete ? "Complete" : "Incomplete"}</span></td>
                  <td className="min-w-[320px] px-5 py-4">
                    <form
                      className="grid gap-2 md:grid-cols-[120px_180px_95px_1fr_80px_105px_auto_auto]"
                      onSubmit={(event) => {
                        event.preventDefault();
                        saveUser(user, event.currentTarget);
                      }}
                    >
                      <input name="name" defaultValue={user.name || ""} placeholder="Name" className={correctionFieldClass} />
                      <input name="email" defaultValue={user.email || ""} placeholder="Email" className={correctionFieldClass} />
                      <select name="role" defaultValue={user.role} className={correctionFieldClass}>
                        {rolesForEditing.includes(user.role) ? null : <option value={user.role}>{user.role}</option>}
                        {rolesForEditing.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                      <input name="department" defaultValue={user.department || ""} placeholder="Department" className={correctionFieldClass} />
                      <input name="level" defaultValue={user.level || ""} placeholder="Level" type="number" className={correctionFieldClass} />
                      <select name="is_profile_complete" defaultValue={String(user.is_profile_complete)} className={correctionFieldClass}>
                        <option value="true">Complete</option>
                        <option value="false">Incomplete</option>
                      </select>
                      <button disabled={savingId === user.id} className="rounded bg-[var(--gov-primary)] px-3 py-2 text-xs font-bold text-white disabled:opacity-60">
                        {savingId === user.id ? "Saving" : "Save"}
                      </button>
                      <button type="button" onClick={() => removeUser(user)} disabled={savingId === user.id} className="rounded border border-[#ba1a1a] px-3 py-2 text-xs font-bold text-[#ba1a1a] disabled:opacity-60">
                        Delete
                      </button>
                    </form>
                  </td>
                </tr>
              )) : (
                <tr><td className="px-5 py-6 text-[#545f72]" colSpan={10}>No {roleLabels[role].toLowerCase()} found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
