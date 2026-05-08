"use client";

import { useState } from "react";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { uploadDocument, type UploadDocumentResponse } from "@/lib/api/documents";

export function UploadDocumentForm({
  embedded = false,
  onUploaded,
}: {
  embedded?: boolean;
  onUploaded?: (result: UploadDocumentResponse) => void;
}) {
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setStatus("");
    setError("");
    setLoading(true);
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const result = await uploadDocument(formData, data.session?.access_token);
      setStatus(`Added ${result.document.title}. You can now ask questions about it in chat.`);
      onUploaded?.(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form action={handleSubmit} className={embedded ? "grid gap-3" : "mt-8 grid gap-4"}>
      <input type="hidden" name="source_type" value="upload" />
      {!embedded ? (
        <input name="title" className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] px-4 py-3 text-[var(--text-main)] outline-none placeholder:text-[var(--text-soft)]" placeholder="Document title" />
      ) : null}
      <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] px-4 py-3 text-sm text-[var(--text-main)]">
        Upload a lecture note, handout, or text file, then ask questions from it in chat.
      </div>
      {!embedded ? (
        <div className="grid gap-4 md:grid-cols-2">
          <input name="department" className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] px-4 py-3 text-[var(--text-main)] outline-none placeholder:text-[var(--text-soft)]" placeholder="Department or all" />
          <input name="level" className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] px-4 py-3 text-[var(--text-main)] outline-none placeholder:text-[var(--text-soft)]" placeholder="Level or blank" type="number" />
        </div>
      ) : null}
      <input
        name="file"
        className="rounded-2xl border border-dashed border-mint/25 bg-mint/5 px-4 py-5 text-[var(--text-main)] outline-none file:mr-4 file:rounded-full file:border-0 file:bg-[var(--accent)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#03110b]"
        type="file"
        accept=".pdf,.docx,.txt"
        required
      />
      {status && <p className="rounded-2xl border border-mint/20 bg-mint/10 p-3 text-sm text-mint">{status}</p>}
      {error && <p className="rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
      <Button disabled={loading}>
        {loading ? "Uploading..." : embedded ? <><Paperclip className="size-4" /> Add file to chat</> : "Upload file"}
      </Button>
    </form>
  );
}
