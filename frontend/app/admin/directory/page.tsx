"use client";

import { FormEvent, useEffect, useState } from "react";
import { createAdminDirectoryContact, deleteAdminDirectoryContact, getAdminDirectory, updateAdminDirectoryContact, type DirectoryContact } from "@/lib/api/admin";
import { createClient } from "@/lib/supabase/client";

const empty = { name: "", role: "", email: "", phone: "", office_location: "" };

async function token() {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}

export default function AdminDirectoryPage() {
  const [contacts, setContacts] = useState<DirectoryContact[]>([]);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const result = await getAdminDirectory(await token());
      setContacts(result.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load directory.");
    }
  }

  useEffect(() => { load(); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const created = await createAdminDirectoryContact(form, await token());
      setContacts((items) => [created, ...items]);
      setForm(empty);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save contact.");
    } finally {
      setSaving(false);
    }
  }

  async function editContact(contact: DirectoryContact) {
    const name = prompt("Name", contact.name);
    if (name === null) return;
    const role = prompt("Role", contact.role);
    if (role === null) return;
    const email = prompt("Email", contact.email);
    if (email === null) return;
    const phone = prompt("Phone", contact.phone);
    if (phone === null) return;
    const office_location = prompt("Office location", contact.office_location);
    if (office_location === null) return;
    try {
      const updated = await updateAdminDirectoryContact(contact.id, { name, role, email, phone, office_location }, await token());
      setContacts((items) => items.map((item) => item.id === contact.id ? updated : item));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update contact.");
    }
  }

  async function removeContact(contact: DirectoryContact) {
    if (!confirm(`Delete ${contact.name} from the directory?`)) return;
    try {
      await deleteAdminDirectoryContact(contact.id, await token());
      setContacts((items) => items.filter((item) => item.id !== contact.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete contact.");
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="space-y-5">
        <header className="border-b border-[var(--gov-outline)] pb-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#545f72]">Directory</p>
          <h1 className="mt-2 text-3xl font-black text-[var(--gov-primary)]">Staff Contact Directory</h1>
          <p className="mt-2 text-sm text-[#3c475a]">Manage public office contacts students can use.</p>
        </header>
        {error ? <p className="rounded border border-[#ffdad6] bg-[#fff4f2] p-4 text-sm text-[#ba1a1a]">{error}</p> : null}
        <div className="grid gap-4 md:grid-cols-2">
          {contacts.map((contact) => (
            <article key={contact.id} className="gov-card rounded-lg p-5">
              <h2 className="text-lg font-bold text-[var(--gov-primary)]">{contact.name}</h2>
              <p className="mt-1 text-sm font-semibold text-[#3c475a]">{contact.role}</p>
              <p className="mt-4 text-sm">{contact.office_location}</p>
              <p className="mt-2 text-sm text-[#545f72]">{contact.email}</p>
              <p className="text-sm text-[#545f72]">{contact.phone}</p>
              <div className="mt-4 flex gap-2">
                <button onClick={() => editContact(contact)} className="rounded border border-[var(--gov-outline)] px-3 py-1 text-xs font-bold text-[var(--gov-primary)]">Edit</button>
                <button onClick={() => removeContact(contact)} className="rounded border border-[#ba1a1a] px-3 py-1 text-xs font-bold text-[#ba1a1a]">Delete</button>
              </div>
            </article>
          ))}
          {!contacts.length ? <p className="gov-card rounded-lg p-5 text-[#545f72]">No contacts yet.</p> : null}
        </div>
      </section>
      <form onSubmit={submit} className="gov-card h-fit rounded-lg p-5">
        <h2 className="text-xl font-bold text-[var(--gov-primary)]">Add Contact</h2>
        {Object.keys(empty).map((key) => (
          <label key={key} className="mt-4 block">
            <span className="text-sm font-medium capitalize text-[#3c475a]">{key.replace("_", " ")}</span>
            <input value={form[key as keyof typeof form]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} className="mt-2 w-full rounded border border-[var(--gov-outline)] bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--gov-primary)]" />
          </label>
        ))}
        <button disabled={saving} className="mt-5 w-full rounded bg-[var(--gov-primary)] px-5 py-3 font-bold text-white disabled:opacity-60">{saving ? "Saving..." : "Save Contact"}</button>
      </form>
    </div>
  );
}
