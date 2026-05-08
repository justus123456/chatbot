import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";

export default function AdminWhatsappPage() {
  return <AppShell><Card><h1 className="text-3xl font-semibold">WhatsApp Inbox</h1><p className="mt-3 text-white/55">Monitor WhatsApp API messages, unknown numbers, and escalations.</p></Card></AppShell>;
}
