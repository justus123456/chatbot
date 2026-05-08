import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";

export default function FlashcardsPage() {
  return <AppShell><Card><h1 className="text-3xl font-semibold">Flashcards</h1><p className="mt-3 text-white/55">AI-generated cards from your notes and uploaded documents.</p></Card></AppShell>;
}
