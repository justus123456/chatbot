import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";

export default function NotesPage() {
  return <AppShell><Card><h1 className="text-3xl font-semibold">Notes</h1><p className="mt-3 text-white/55">Study notes, summaries, and Q&A generation workspace.</p></Card></AppShell>;
}
