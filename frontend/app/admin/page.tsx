import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";

export default function AdminPage() {
  return <AppShell><Card><h1 className="text-3xl font-semibold">Admin Dashboard</h1><p className="mt-3 text-white/55">Manage announcements, calendar, RAG knowledge, users, escalations, and WhatsApp conversations.</p></Card></AppShell>;
}
