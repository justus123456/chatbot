"use client";

import { FormEvent, useEffect, useState } from "react";
import { createAdminRule, deleteAdminRule, getAdminRules, updateAdminRule, type RuleRow } from "@/lib/api/admin";
import { createClient } from "@/lib/supabase/client";

async function token() {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}

export default function AdminRulesPage() {
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("general");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const result = await getAdminRules(await token());
      setRules(result.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load rules.");
    }
  }

  useEffect(() => { load(); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const created = await createAdminRule({ title, category, content }, await token());
      setRules((items) => [created, ...items]);
      setTitle("");
      setCategory("general");
      setContent("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save rule.");
    } finally {
      setSaving(false);
    }
  }

  async function editRule(rule: RuleRow) {
    const nextTitle = prompt("Rule title", rule.title);
    if (nextTitle === null) return;
    const nextCategory = prompt("Category", rule.category);
    if (nextCategory === null) return;
    const nextContent = prompt("Rule content", rule.content);
    if (nextContent === null) return;
    try {
      const updated = await updateAdminRule(rule.id, { title: nextTitle, category: nextCategory, content: nextContent }, await token());
      setRules((items) => items.map((item) => item.id === rule.id ? updated : item));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update rule.");
    }
  }

  async function removeRule(rule: RuleRow) {
    if (!confirm(`Delete rule "${rule.title}"?`)) return;
    try {
      await deleteAdminRule(rule.id, await token());
      setRules((items) => items.filter((item) => item.id !== rule.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete rule.");
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="space-y-5">
        <header className="border-b border-[var(--gov-outline)] pb-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#545f72]">Rules Management</p>
          <h1 className="mt-2 text-3xl font-black text-[var(--gov-primary)]">University Rules</h1>
          <p className="mt-2 text-sm text-[#3c475a]">Manage official rules and policy content.</p>
        </header>
        {error ? <p className="rounded border border-[#ffdad6] bg-[#fff4f2] p-4 text-sm text-[#ba1a1a]">{error}</p> : null}
        {rules.map((rule) => (
          <article key={rule.id} className="gov-card rounded-lg p-5">
            <span className="rounded bg-[#d6e3ff] px-3 py-1 text-xs font-bold uppercase text-[var(--gov-primary)]">{rule.category}</span>
            <h2 className="mt-4 text-xl font-bold text-[var(--gov-primary)]">{rule.title}</h2>
            <p className="mt-3 text-sm leading-6 text-[#3c475a]">{rule.content}</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => editRule(rule)} className="rounded border border-[var(--gov-outline)] px-3 py-1 text-xs font-bold text-[var(--gov-primary)]">Edit</button>
              <button onClick={() => removeRule(rule)} className="rounded border border-[#ba1a1a] px-3 py-1 text-xs font-bold text-[#ba1a1a]">Delete</button>
            </div>
          </article>
        ))}
        {!rules.length ? <p className="gov-card rounded-lg p-5 text-[#545f72]">No rules yet.</p> : null}
      </section>
      <form onSubmit={submit} className="gov-card h-fit rounded-lg p-5">
        <h2 className="text-xl font-bold text-[var(--gov-primary)]">Add Rule</h2>
        <label className="mt-4 block"><span className="text-sm font-medium text-[#3c475a]">Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 w-full rounded border border-[var(--gov-outline)] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--gov-primary)]" /></label>
        <label className="mt-4 block"><span className="text-sm font-medium text-[#3c475a]">Category</span><input value={category} onChange={(event) => setCategory(event.target.value)} className="mt-2 w-full rounded border border-[var(--gov-outline)] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--gov-primary)]" /></label>
        <label className="mt-4 block"><span className="text-sm font-medium text-[#3c475a]">Content</span><textarea value={content} onChange={(event) => setContent(event.target.value)} className="mt-2 min-h-40 w-full rounded border border-[var(--gov-outline)] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--gov-primary)]" /></label>
        <button disabled={saving} className="mt-5 w-full rounded bg-[var(--gov-primary)] px-5 py-3 font-bold text-white disabled:opacity-60">{saving ? "Saving..." : "Save Rule"}</button>
      </form>
    </div>
  );
}
