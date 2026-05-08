"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { type Escalation, getEscalations, replyToEscalation } from "@/lib/api/admin";

export function EscalationsPanel() {
  const [items, setItems] = useState<Escalation[]>([]);
  const [status, setStatus] = useState("Loading escalations...");

  useEffect(() => {
    let supabase;

    try {
      supabase = createClient();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Supabase is not configured yet.");
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      getEscalations(data.session?.access_token)
        .then((result) => {
          setItems(result.data);
          setStatus(result.data.length ? "" : "No escalations yet.");
        })
        .catch((error) => setStatus(error instanceof Error ? error.message : "Could not load escalations."));
    });
  }, []);

  async function handleReply(formData: FormData) {
    const id = String(formData.get("id") || "");
    const response = String(formData.get("response") || "").trim();
    if (!id || !response) return;
    let supabase;

    try {
      supabase = createClient();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Supabase is not configured yet.");
      return;
    }

    const { data } = await supabase.auth.getSession();
    const updated = await replyToEscalation(id, response, data.session?.access_token);
    setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  }

  return (
    <div className="mt-8 space-y-4">
      {status && <p className="text-sm text-white/55">{status}</p>}
      {items.map((item) => (
        <article key={item.id} className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <strong>{item.question}</strong>
            <span className="rounded-full bg-mint/10 px-3 py-1 text-xs text-mint">{item.status}</span>
          </div>
          <p className="mt-2 text-sm text-white/45">{item.user_department || "General"} {item.user_level || ""}</p>
          <form action={handleReply} className="mt-4 flex flex-col gap-3 md:flex-row">
            <input type="hidden" name="id" value={item.id} />
            <input name="response" className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none" placeholder="Reply to student..." />
            <Button>Send reply</Button>
          </form>
        </article>
      ))}
    </div>
  );
}
