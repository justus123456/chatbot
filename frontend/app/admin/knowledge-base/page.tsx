import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";

export default function AdminKnowledgeBasePage() {
  return <AppShell><Card><h1 className="text-3xl font-semibold">Knowledge Base</h1><p className="mt-3 text-white/55">Upload documents, inspect chunks, and refresh embeddings.</p></Card></AppShell>;
}
