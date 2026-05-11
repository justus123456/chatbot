"use client";

import { FormEvent, useEffect, useState } from "react";
import { createAdminKnowledgeBaseEntry, deleteAdminKnowledgeBaseEntry, getAdminKnowledgeBase, updateAdminKnowledgeBaseEntry, type KnowledgeBaseRow } from "@/lib/api/admin";
import { uploadDocument } from "@/lib/api/documents";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { createClient } from "@/lib/supabase/client";

export default function AdminKnowledgeBasePage() {
  const { user } = useCurrentUser();
  const [entries, setEntries] = useState<KnowledgeBaseRow[]>([]);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("general");
  const [source, setSource] = useState("admin");
  const [authoritative, setAuthoritative] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [selectedDocumentName, setSelectedDocumentName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function getToken() {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    let token = data.session?.access_token;
    if (!token) token = (await supabase.auth.refreshSession()).data.session?.access_token;
    if (!token) throw new Error("Please log in again.");
    return token;
  }

  async function loadEntries() {
    setLoading(true);
    setError("");
    try {
      const result = await getAdminKnowledgeBase(await getToken());
      setEntries(result.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load knowledge base.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEntries();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      if (!content.trim()) throw new Error("Type knowledge base content first.");
      const created = await createAdminKnowledgeBaseEntry(
        {
          content: content.trim(),
          category: authoritative ? (category.trim() || "university_policy") : (category.trim() || "general"),
          source: authoritative ? "official_university_policy" : (source.trim() || "admin"),
          authoritative_policy: authoritative,
          authority_weight: authoritative ? 2 : 1,
        },
        await getToken(),
      );
      setEntries((items) => [created, ...items]);
      setContent("");
      setAuthoritative(false);
      setMessage("Knowledge base entry saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save entry.");
    } finally {
      setSaving(false);
    }
  }

  async function editEntry(entry: KnowledgeBaseRow) {
    const nextContent = window.prompt("Edit knowledge base content", entry.content);
    if (nextContent === null) return;
    const nextCategory = window.prompt("Category", entry.category || "general");
    if (nextCategory === null) return;
    const nextSource = window.prompt("Source", entry.source || "admin");
    if (nextSource === null) return;
    const nextAuthoritative = user?.role === "dean" ? window.confirm("Mark this as an authoritative university policy source?") : Boolean(entry.is_authoritative);
    setError("");
    try {
      const updated = await updateAdminKnowledgeBaseEntry(
        entry.id,
        {
          content: nextContent,
          category: nextAuthoritative ? (nextCategory || "university_policy") : nextCategory,
          source: nextAuthoritative ? "official_university_policy" : nextSource,
          ...(user?.role === "dean" ? { is_authoritative: nextAuthoritative, authority_weight: nextAuthoritative ? 2 : 1 } : {}),
        },
        await getToken(),
      );
      setEntries((items) => items.map((item) => (item.id === entry.id ? { ...item, ...updated } : item)));
      setMessage("Knowledge base entry updated.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update entry.");
    }
  }

  async function deleteEntry(entry: KnowledgeBaseRow) {
    setError("");
    try {
      await deleteAdminKnowledgeBaseEntry(entry.id, await getToken());
      setEntries((items) => items.filter((item) => item.id !== entry.id));
      setMessage("Knowledge base entry deleted.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete entry.");
    }
  }

  async function uploadKnowledgeDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploadingDocument(true);
    setError("");
    setMessage("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set("source_type", "knowledge_upload");
    formData.set("category", String(formData.get("category") || "knowledge"));
    try {
      const result = await uploadDocument(formData, await getToken());
      setMessage(`Document indexed: ${result.chunks_created} searchable chunks created for the chatbot.`);
      setSelectedDocumentName("");
      form.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not upload document.");
    } finally {
      setUploadingDocument(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="space-y-5">
        <div className="border-b border-[var(--gov-outline)] pb-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#545f72]">Knowledge Base</p>
          <h1 className="mt-2 text-3xl font-black text-[var(--gov-primary)]">Manage Index</h1>
          <p className="mt-2 text-sm text-[#3c475a]">Review and add official information the assistant can use.</p>
        </div>

        {error ? <p className="rounded border border-[#ffdad6] bg-[#fff4f2] p-4 text-sm text-[#ba1a1a]">{error}</p> : null}
        {message ? <p className="rounded border border-[#c7eed4] bg-[#f0fff4] p-4 text-sm text-[#0a8f31]">{message}</p> : null}

        <div className="space-y-3">
          {loading ? <p className="gov-card rounded p-5 text-[#545f72]">Loading knowledge base...</p> : null}
          {!loading && !entries.length ? <p className="gov-card rounded p-5 text-[#545f72]">No knowledge base entries found.</p> : null}
          {entries.map((entry) => (
            <article key={entry.id} className="gov-card rounded p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded bg-[#d6e3ff] px-3 py-1 text-xs font-bold uppercase text-[var(--gov-primary)]">{entry.category || "general"}</span>
                  <span className={entry.embedding_status === "indexed" ? "rounded bg-[#e8f5e9] px-3 py-1 text-xs font-bold uppercase text-[#0a8f31]" : "rounded bg-[#fff8e1] px-3 py-1 text-xs font-bold uppercase text-[#8a5a00]"}>
                    {entry.embedding_status || "not_indexed"}
                  </span>
                  {entry.is_authoritative ? (
                    <span className="rounded bg-[var(--gov-primary)] px-3 py-1 text-xs font-bold uppercase text-white">Dean policy x{entry.authority_weight || 2}</span>
                  ) : null}
                </div>
                <span className="text-xs text-[#545f72]">Source: {entry.source || "manual"}</span>
              </div>
              <p className="mt-4 text-sm leading-6 text-[#1a1c1e]">{entry.content}</p>
              <p className="mt-4 text-xs text-[#545f72]">Created: {entry.created_at ? new Date(entry.created_at).toLocaleString() : "Unknown"}{entry.updated_at ? ` | Updated: ${new Date(entry.updated_at).toLocaleString()}` : ""}</p>
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={() => editEntry(entry)} className="rounded border border-[var(--gov-primary)] px-3 py-2 text-xs font-bold uppercase text-[var(--gov-primary)]">Edit</button>
                <button type="button" onClick={() => deleteEntry(entry)} className="rounded border border-[#ba1a1a] px-3 py-2 text-xs font-bold uppercase text-[#ba1a1a]">Delete</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <aside className="space-y-5">
      <form className="gov-card rounded-lg p-5" onSubmit={uploadKnowledgeDocument}>
        <h2 className="text-xl font-bold text-[var(--gov-primary)]">Upload Document to AI Index</h2>
        <p className="mt-2 text-sm leading-6 text-[#545f72]">Use this for PDF, DOCX, or TXT files the chatbot should answer from.</p>
        <label className="mt-4 block">
          <span className="text-sm font-medium text-[#3c475a]">Document title</span>
          <input name="title" required className="mt-2 w-full rounded border border-[var(--gov-outline)] bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--gov-primary)]" placeholder="Semester timetable, handbook..." />
        </label>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input name="department" className="rounded border border-[var(--gov-outline)] bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--gov-primary)]" placeholder="Department or all" />
          <input name="level" type="number" className="rounded border border-[var(--gov-outline)] bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--gov-primary)]" placeholder="Level or blank" />
        </div>
        <input name="category" type="hidden" value="knowledge" />
        <label className="mt-4 block rounded border border-dashed border-[var(--gov-outline)] bg-white p-4">
          <span className="block text-xs font-bold uppercase tracking-[0.12em] text-[#545f72]">PDF, DOCX, or TXT</span>
          <input
            name="file"
            required
            type="file"
            accept=".pdf,.docx,.txt"
            onChange={(event) => setSelectedDocumentName(event.target.files?.[0]?.name || "")}
            className="mt-2 w-full text-sm text-[#1a1c1e] file:mr-3 file:rounded file:border-0 file:bg-[var(--gov-primary)] file:px-3 file:py-2 file:text-sm file:font-bold file:text-white"
          />
        </label>
        <p className={selectedDocumentName ? "mt-3 rounded bg-[#f0fff4] p-3 text-sm text-[#0a8f31]" : "mt-3 rounded bg-[#f8f9fc] p-3 text-sm text-[#545f72]"}>
          {selectedDocumentName ? `Selected file: ${selectedDocumentName}` : "No document selected yet."}
        </p>
        <button disabled={uploadingDocument} className="mt-4 w-full rounded bg-[var(--gov-primary)] px-5 py-3 font-bold text-white disabled:opacity-60">
          {uploadingDocument ? "Indexing..." : "Upload and Index Document"}
        </button>
      </form>

      <form className="gov-card rounded-lg p-5" onSubmit={handleSubmit}>
        <h2 className="text-xl font-bold text-[var(--gov-primary)]">Add Knowledge</h2>
        <label className="mt-5 block">
          <span className="text-sm font-medium text-[#3c475a]">Category</span>
          <input value={category} onChange={(event) => setCategory(event.target.value)} className="mt-2 w-full rounded border border-[var(--gov-outline)] bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--gov-primary)]" />
        </label>
        <label className="mt-4 block">
          <span className="text-sm font-medium text-[#3c475a]">Source</span>
          <input value={source} onChange={(event) => setSource(event.target.value)} className="mt-2 w-full rounded border border-[var(--gov-outline)] bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--gov-primary)]" />
        </label>
        {user?.role === "dean" ? (
          <label className="mt-4 flex items-start gap-3 rounded border border-[var(--gov-outline)] bg-[#f8f9fc] p-3">
            <input type="checkbox" checked={authoritative} onChange={(event) => setAuthoritative(event.target.checked)} className="mt-1" />
            <span>
              <span className="block text-sm font-bold text-[var(--gov-primary)]">Official university policy</span>
              <span className="mt-1 block text-xs leading-5 text-[#545f72]">Dean-only. Tags this entry as authoritative and gives it a higher retrieval weight.</span>
            </span>
          </label>
        ) : null}
        <label className="mt-4 block">
          <span className="text-sm font-medium text-[#3c475a]">Content</span>
          <textarea value={content} onChange={(event) => setContent(event.target.value)} className="mt-2 min-h-44 w-full rounded border border-[var(--gov-outline)] bg-white px-4 py-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-[var(--gov-primary)]" placeholder="Example: Course registration opens on..." />
        </label>
        <button disabled={saving} className="mt-5 w-full rounded bg-[var(--gov-primary)] px-5 py-3 font-bold text-white disabled:opacity-60">
          {saving ? "Saving..." : "Save Entry"}
        </button>
      </form>
      </aside>
    </div>
  );
}
