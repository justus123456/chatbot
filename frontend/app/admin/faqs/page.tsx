"use client";

import { SimpleAdminManager } from "@/components/admin/simple-admin-manager";
import { createAdminFaq, deleteAdminFaq, getAdminFaqs, updateAdminFaq, type FaqRow } from "@/lib/api/admin";

export default function AdminFaqsPage() {
  return (
    <SimpleAdminManager<FaqRow>
      title="FAQ Management"
      eyebrow="Knowledge operations"
      description="Create and manage general FAQ answers that students can read and the assistant can reference."
      fields={[
        { name: "question", label: "Question" },
        { name: "answer", label: "Answer", type: "textarea" },
        { name: "category", label: "Category" },
        { name: "language", label: "Language", type: "select", options: ["en", "pidgin"] },
      ]}
      load={getAdminFaqs}
      create={(payload, token) =>
        createAdminFaq(
          {
            question: String(payload.question || ""),
            answer: String(payload.answer || ""),
            category: String(payload.category || "general"),
            language: String(payload.language || "en") as "en" | "pidgin",
          },
          token,
        )
      }
      remove={deleteAdminFaq}
      update={(id, payload, token) =>
        updateAdminFaq(id, {
          question: String(payload.question || ""),
          answer: String(payload.answer || ""),
          category: String(payload.category || "general"),
          language: String(payload.language || "en") as "en" | "pidgin",
        }, token)
      }
      render={(item) => (
        <>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#545f72]">{item.category}</p>
          <h2 className="mt-2 text-lg font-black text-[var(--gov-primary)]">{item.question}</h2>
          <p className="mt-3 text-sm leading-6 text-[#3c475a]">{item.answer}</p>
          <span className="mt-4 inline-flex rounded-full bg-[#d6e3ff] px-3 py-1 text-xs font-bold text-[var(--gov-primary)]">
            {item.language}
          </span>
        </>
      )}
    />
  );
}
