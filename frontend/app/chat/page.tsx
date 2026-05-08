"use client";

import { useState } from "react";
import { Paperclip, Send } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { UploadDocumentForm } from "@/components/documents/upload-document-form";
import { sendChatMessage } from "@/lib/api/chat";
import { createClient } from "@/lib/supabase/client";
import type { UploadDocumentResponse } from "@/lib/api/documents";

export default function ChatPage() {
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Ask me about registration, fees, hostel, clearance, calendar, or upload a document and ask me questions about it." },
  ]);
  const [isSending, setIsSending] = useState(false);
  const [showUploader, setShowUploader] = useState(false);

  async function sendMessage(formData: FormData) {
    const text = String(formData.get("message") || "").trim();
    if (!text) return;
    setMessages((items) => [...items, { role: "user", text }]);
    setIsSending(true);

    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const response = await sendChatMessage(text, data.session?.access_token);
      setMessages((items) => [
        ...items,
        {
          role: "assistant",
          text: `${response.response}\n\nSource: ${response.source} | Confidence: ${Math.round(response.confidence_score * 100)}%`,
        },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The Flask API is not available yet.";
      setMessages((items) => [...items, { role: "assistant", text: `I could not reach the RAG API yet. ${message}` }]);
    } finally {
      setIsSending(false);
    }
  }

  function handleDocumentUploaded(result: UploadDocumentResponse) {
    setShowUploader(false);
    setMessages((items) => [
      ...items,
      {
        role: "assistant",
        text: `I have added "${result.document.title}" to your study context. Ask me anything from that document and I will use it in my answer.`,
      },
    ]);
  }

  return (
    <AppShell>
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card className="flex min-h-[70vh] flex-col">
          <div className="border-b border-[var(--border-soft)] pb-4">
            <p className="text-sm uppercase tracking-[0.3em] text-mint">SmartCampus Chat</p>
            <h2 className="mt-2 text-2xl font-semibold">Ask questions or chat with a file</h2>
            <p className="mt-3 text-sm text-[var(--text-muted)]">You can upload a lecture note, handout, or text file here and then ask questions from it like a normal conversation.</p>
          </div>
          <div className="flex-1 space-y-4 overflow-auto py-6">
            {messages.map((message, index) => (
              <div key={index} className={message.role === "user" ? "text-right" : "text-left"}>
                <span className={`inline-block max-w-[75%] rounded-3xl border px-5 py-3 text-sm shadow-[0_14px_35px_rgba(0,0,0,0.08)] ${message.role === "user" ? "border-transparent bg-mint text-ink" : "border-[var(--border-soft)] bg-[var(--bg-elevated)] text-[var(--text-main)]"}`}>
                  {message.text}
                </span>
              </div>
            ))}
          </div>
          {showUploader ? (
            <div className="mb-4 rounded-3xl border border-mint/15 bg-mint/5 p-4">
              <UploadDocumentForm embedded onUploaded={handleDocumentUploaded} />
            </div>
          ) : null}
          <form action={sendMessage} className="flex gap-3 rounded-full border border-[var(--border-soft)] bg-[var(--panel-strong)] p-2">
            <button
              type="button"
              onClick={() => setShowUploader((current) => !current)}
              className="grid size-11 place-items-center rounded-full border border-[var(--border-soft)] bg-[var(--bg-elevated)] text-[var(--accent)] transition hover:border-[var(--accent-soft)] hover:bg-[var(--accent-soft)] hover:text-[var(--text-main)]"
              aria-label="Attach document"
              title="Attach document"
            >
              <Paperclip className="size-4" />
            </button>
            <input name="message" className="min-w-0 flex-1 bg-transparent px-4 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-soft)]" placeholder="Ask SmartCampus..." />
            <Button type="submit" disabled={isSending}>{isSending ? "..." : <Send className="size-4" />}</Button>
          </form>
        </Card>
        <Card>
          <h3 className="text-xl font-semibold">How to use this chat</h3>
          <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">Ask school questions directly, or attach a file first and then ask for summaries, explanations, or answers based on that document.</p>
          <div className="mt-6 space-y-3">
            {["Course registration", "School fees", "Hostel booking", "Clearance", "Summarize my handout", "Explain this note simply"].map((item) => (
              <span key={item} className="block rounded-full border border-[var(--border-soft)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text-main)]">{item}</span>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
