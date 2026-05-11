"use client";

import { FormEvent, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { getFreshAccessToken } from "@/lib/api/admin";

type Field = { name: string; label: string; type?: "textarea" | "select" | "number"; options?: string[] };

export function SimpleAdminManager<T extends { id: string }>({
  title,
  eyebrow,
  description,
  fields,
  load,
  create,
  update,
  remove,
  render,
}: {
  title: string;
  eyebrow: string;
  description: string;
  fields: Field[];
  load: (token: string) => Promise<{ data: T[] }>;
  create: (payload: Record<string, string | number>, token: string) => Promise<T>;
  update?: (id: string, payload: Record<string, string | number>, token: string) => Promise<T>;
  remove?: (id: string, token: string) => Promise<unknown>;
  render: (item: T) => ReactNode;
}) {
  const [items, setItems] = useState<T[]>([]);
  const [editing, setEditing] = useState<T | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    setError("");
    try {
      const result = await load(await getFreshAccessToken());
      setItems(result.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load records.");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const payload: Record<string, string | number> = {};
    fields.forEach((field) => {
      const value = String(data.get(field.name) || "").trim();
      payload[field.name] = field.type === "number" && value ? Number(value) : value;
    });
    try {
      if (editing && update) {
        const updated = await update(editing.id, payload, await getFreshAccessToken());
        setItems((current) => current.map((item) => (item.id === editing.id ? updated : item)));
        setEditing(null);
      } else {
        const created = await create(payload, await getFreshAccessToken());
        setItems((current) => [created, ...current]);
      }
      event.currentTarget.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save record.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRecord(id: string) {
    if (!remove) return;
    setError("");
    try {
      await remove(id, await getFreshAccessToken());
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete record.");
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="space-y-5">
        <header className="border-b border-[var(--gov-outline)] pb-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#545f72]">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-black text-[var(--gov-primary)]">{title}</h1>
          <p className="mt-2 text-sm text-[#3c475a]">{description}</p>
        </header>
        {error ? <p className="rounded border border-[#ffdad6] bg-[#fff4f2] p-4 text-sm text-[#ba1a1a]">{error}</p> : null}
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <article key={item.id} className="gov-card rounded-lg p-5">
              {render(item)}
              {update ? (
                <button
                  type="button"
                  onClick={() => setEditing(item)}
                  className="mt-4 mr-2 rounded border border-[var(--gov-primary)] px-3 py-2 text-xs font-bold uppercase tracking-wide text-[var(--gov-primary)] hover:bg-[#d6e3ff]"
                >
                  Edit
                </button>
              ) : null}
              {remove ? (
                <button
                  type="button"
                  onClick={() => deleteRecord(item.id)}
                  className="mt-4 rounded border border-[#ba1a1a] px-3 py-2 text-xs font-bold uppercase tracking-wide text-[#ba1a1a] hover:bg-[#fff4f2]"
                >
                  Delete
                </button>
              ) : null}
            </article>
          ))}
          {!items.length ? <p className="gov-card rounded-lg p-5 text-[#545f72]">No records yet.</p> : null}
        </div>
      </section>
      <form key={editing?.id || "new"} onSubmit={submit} className="gov-card h-fit rounded-lg p-5">
        <h2 className="text-xl font-bold text-[var(--gov-primary)]">{editing ? "Edit Record" : "Add Record"}</h2>
        {fields.map((field) => (
          <label key={field.name} className="mt-4 block">
            <span className="text-sm font-medium text-[#3c475a]">{field.label}</span>
            {field.type === "textarea" ? (
              <textarea name={field.name} defaultValue={editing ? String((editing as Record<string, unknown>)[field.name] || "") : ""} className="mt-2 min-h-28 w-full rounded border border-[var(--gov-outline)] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--gov-primary)]" />
            ) : field.type === "select" ? (
              <select name={field.name} defaultValue={editing ? String((editing as Record<string, unknown>)[field.name] || "") : undefined} className="mt-2 w-full rounded border border-[var(--gov-outline)] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--gov-primary)]">
                {(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            ) : (
              <input name={field.name} defaultValue={editing ? String((editing as Record<string, unknown>)[field.name] || "") : ""} type={field.type || "text"} className="mt-2 w-full rounded border border-[var(--gov-outline)] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--gov-primary)]" />
            )}
          </label>
        ))}
        <button disabled={saving} className="mt-5 w-full rounded bg-[var(--gov-primary)] px-5 py-3 font-bold text-white disabled:opacity-60">{saving ? "Saving..." : editing ? "Update Record" : "Save Record"}</button>
        {editing ? <button type="button" onClick={() => setEditing(null)} className="mt-3 w-full rounded border border-[var(--gov-outline)] px-5 py-3 font-bold text-[var(--gov-primary)]">Cancel Edit</button> : null}
      </form>
    </div>
  );
}
