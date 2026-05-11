"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { convertWhatsappToAnnouncement, getAdminWhatsappMessages, getFreshAccessToken, type WhatsappMessageRow } from "@/lib/api/admin";
import { uploadDocument } from "@/lib/api/documents";

export default function AdminWhatsappPage() {
  const [messages, setMessages] = useState<WhatsappMessageRow[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [convertingId, setConvertingId] = useState("");
  const [importing, setImporting] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedMessage, setSelectedMessage] = useState<WhatsappMessageRow | null>(null);
  const pageSize = 20;

  const filteredMessages = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return messages;
    return messages.filter((item) => `${item.message} ${item.phone_number} ${item.response_source || ""} ${JSON.stringify(item.raw_payload || {})}`.toLowerCase().includes(value));
  }, [messages, query]);
  const totalPages = Math.max(1, Math.ceil(filteredMessages.length / pageSize));
  const visibleMessages = filteredMessages.slice((page - 1) * pageSize, page * pageSize);

  async function load() {
    setError("");
    try {
      const result = await getAdminWhatsappMessages(await getFreshAccessToken());
      setMessages(result.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load WhatsApp integration log.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function convertMessage(item: WhatsappMessageRow) {
    const title = prompt("Announcement title", "WhatsApp announcement");
    if (title === null) return;
    const departments = prompt("Target departments, comma-separated. Blank means all departments.", "");
    if (departments === null) return;
    const levels = prompt("Target levels, comma-separated. Example: 100,200,300. Blank means all levels.", "");
    if (levels === null) return;
    setConvertingId(item.id);
    setError("");
    try {
      await convertWhatsappToAnnouncement(
        item.id,
        {
          title,
          content: item.message,
          target_departments: departments.trim() ? departments.split(",").map((value) => value.trim()).filter(Boolean) : "all",
          target_levels: levels.trim() ? levels.split(",").map((value) => Number(value.trim())).filter(Boolean) : "all",
        },
        await getFreshAccessToken(),
      );
      setMessages((current) => current.map((message) => message.id === item.id ? { ...message, response_source: "converted_to_announcement" } : message));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not convert WhatsApp message.");
    } finally {
      setConvertingId("");
    }
  }

  async function importExport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setImporting(true);
    setError("");
    setNotice("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set("source_type", "whatsapp_export");
    formData.set("category", "whatsapp_archive");
    try {
      const result = await uploadDocument(formData, await getFreshAccessToken());
      setNotice(`Imported ${result.whatsapp_messages} WhatsApp messages into ${result.chunks_created} searchable chunks.`);
      await load();
      form.reset();
      setSelectedFileName("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not import WhatsApp export.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="border-b border-[var(--gov-outline)] pb-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#545f72]">WhatsApp Integration</p>
        <h1 className="mt-2 text-3xl font-black text-[var(--gov-primary)]">Message Log</h1>
        <p className="mt-2 text-sm text-[#3c475a]">Incoming and outgoing WhatsApp records, parser payloads, response source, and confidence.</p>
      </header>
      {error ? <p className="rounded border border-[#ffdad6] bg-[#fff4f2] p-4 text-sm text-[#ba1a1a]">{error}</p> : null}
      {notice ? <p className="rounded border border-[#c7eed4] bg-[#f0fff4] p-4 text-sm text-[#0a8f31]">{notice}</p> : null}

      <form onSubmit={importExport} className="gov-card rounded-lg p-5">
        <div className="flex flex-col gap-2 border-b border-[var(--gov-outline)] pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-black text-[var(--gov-primary)]">Import Official Group Chat Export</h2>
            <p className="mt-1 text-sm leading-6 text-[#545f72]">
              Upload WhatsApp exported .txt files as a searchable archive. Choose the department and level so only the right students retrieve it.
            </p>
          </div>
          <span className="rounded bg-[#d6e3ff] px-3 py-1 text-xs font-bold uppercase text-[var(--gov-primary)]">RAG Index</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_180px_150px_220px]">
          <input name="title" required placeholder="Archive title, e.g. CSC 300L WhatsApp Notices 2026" className="rounded border border-[var(--gov-outline)] bg-white px-4 py-3 text-sm text-[#1a1c1e] outline-none focus:ring-2 focus:ring-[var(--gov-primary)]" />
          <input name="department" placeholder="Department or all" className="rounded border border-[var(--gov-outline)] bg-white px-4 py-3 text-sm text-[#1a1c1e] outline-none focus:ring-2 focus:ring-[var(--gov-primary)]" />
          <input name="level" type="number" placeholder="Level" className="rounded border border-[var(--gov-outline)] bg-white px-4 py-3 text-sm text-[#1a1c1e] outline-none focus:ring-2 focus:ring-[var(--gov-primary)]" />
          <label className="rounded border border-dashed border-[var(--gov-outline)] bg-white px-4 py-3 text-sm text-[#1a1c1e]">
            <span className="block text-xs font-bold uppercase tracking-[0.12em] text-[#545f72]">WhatsApp .txt file</span>
            <input
              name="file"
              required
              type="file"
              accept=".txt"
              onChange={(event) => setSelectedFileName(event.target.files?.[0]?.name || "")}
              className="mt-2 w-full text-sm text-[#1a1c1e] file:mr-3 file:rounded file:border-0 file:bg-[var(--gov-primary)] file:px-3 file:py-2 file:text-sm file:font-bold file:text-white"
            />
          </label>
        </div>
        <div className={selectedFileName ? "mt-4 rounded border border-[#c7eed4] bg-[#f0fff4] p-4 text-sm text-[#0a8f31]" : "mt-4 rounded border border-dashed border-[var(--gov-outline)] bg-[#f8f9fc] p-4 text-sm text-[#545f72]"}>
          {selectedFileName ? (
            <span><strong>Selected file:</strong> {selectedFileName}. You can now click Import WhatsApp Archive.</span>
          ) : (
            <span>No .txt file selected yet.</span>
          )}
        </div>
        <div className="mt-4 rounded border border-[var(--gov-outline)] bg-[#f8f9fc] p-4 text-sm leading-6 text-[#3c475a]">
          This does not train the model permanently. It creates embeddings from the official chat archive so the chatbot can retrieve old notices when students ask.
        </div>
        <button disabled={importing} className="mt-4 rounded bg-[var(--gov-primary)] px-5 py-3 text-sm font-bold text-white disabled:opacity-60">
          {importing ? "Importing..." : "Import WhatsApp Archive"}
        </button>
      </form>

      <section className="gov-card overflow-hidden rounded-lg">
        <div className="grid gap-3 border-b border-[var(--gov-outline)] bg-[#f8f9fc] p-4 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h2 className="text-lg font-black text-[var(--gov-primary)]">Imported Message Review</h2>
            <p className="mt-1 text-sm text-[#545f72]">
              Showing {visibleMessages.length} of {filteredMessages.length} matching messages. Raw parser details are hidden until you open a row.
            </p>
          </div>
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            className="rounded border border-[var(--gov-outline)] bg-white px-4 py-3 text-sm text-[#1a1c1e] outline-none focus:ring-2 focus:ring-[var(--gov-primary)]"
            placeholder="Search imported messages..."
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#f2f1f5] text-xs uppercase text-[#3c475a]">
              <tr>
                <th className="px-5 py-3">Source</th>
                <th className="px-5 py-3">Message</th>
                <th className="px-5 py-3">Archive Date</th>
                <th className="px-5 py-3">Confidence</th>
                <th className="px-5 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleMessages.map((item) => (
                <tr key={item.id} className="border-t border-[var(--gov-outline)]">
                  <td className="px-5 py-4">
                    <strong className="text-[var(--gov-primary)]">{String(item.raw_payload?.archive_title || item.phone_number)}</strong>
                    <p className="mt-1 text-xs text-[#545f72]">{String(item.raw_payload?.sender || item.direction)}</p>
                  </td>
                  <td className="max-w-[560px] px-5 py-4 text-[#3c475a]">
                    <p className="line-clamp-3">{item.message}</p>
                    <p className="mt-2 text-xs font-bold uppercase text-[#545f72]">{item.response_source || "not parsed"}</p>
                  </td>
                  <td className="px-5 py-4 text-xs text-[#545f72]">
                    {String(item.raw_payload?.date || "-")} {String(item.raw_payload?.time || "")}
                  </td>
                  <td className="px-5 py-4">{Math.round(Number(item.confidence_score || 0) * 100)}%</td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => setSelectedMessage(item)} className="rounded border border-[var(--gov-outline)] px-3 py-2 text-xs font-bold text-[var(--gov-primary)]">
                        Details
                      </button>
                      {item.direction === "inbound" ? (
                        <button onClick={() => convertMessage(item)} disabled={convertingId === item.id} className="rounded bg-[var(--gov-primary)] px-3 py-2 text-xs font-bold text-white disabled:opacity-60">
                          {convertingId === item.id ? "Converting" : "Make Announcement"}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!visibleMessages.length ? <tr><td className="px-5 py-5 text-[#545f72]" colSpan={5}>No WhatsApp messages found.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-[var(--gov-outline)] p-4 text-sm">
          <button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded border border-[var(--gov-outline)] px-3 py-2 font-bold text-[var(--gov-primary)] disabled:opacity-40">Previous</button>
          <span className="text-[#545f72]">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="rounded border border-[var(--gov-outline)] px-3 py-2 font-bold text-[var(--gov-primary)] disabled:opacity-40">Next</button>
        </div>
      </section>
      {selectedMessage ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setSelectedMessage(null)}>
          <section className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-[var(--gov-primary)]">Message Details</h2>
                <p className="mt-1 text-sm text-[#545f72]">{String(selectedMessage.raw_payload?.archive_title || selectedMessage.phone_number)}</p>
              </div>
              <button onClick={() => setSelectedMessage(null)} className="rounded border border-[var(--gov-outline)] px-3 py-2 text-sm font-bold text-[var(--gov-primary)]">Close</button>
            </div>
            <p className="mt-5 rounded border border-[var(--gov-outline)] bg-[#f8f9fc] p-4 text-sm leading-6 text-[#1a1c1e]">{selectedMessage.message}</p>
            <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
              {Object.entries(selectedMessage.raw_payload || {}).map(([key, value]) => (
                <div key={key} className="rounded border border-[var(--gov-outline)] p-3">
                  <dt className="text-xs font-bold uppercase tracking-[0.12em] text-[#545f72]">{key.replace(/_/g, " ")}</dt>
                  <dd className="mt-1 break-words text-[#1a1c1e]">{String(value ?? "-")}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      ) : null}
    </div>
  );
}
