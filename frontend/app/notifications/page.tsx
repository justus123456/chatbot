import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";

export default function NotificationsPage() {
  return <AppShell><Card><h1 className="text-3xl font-semibold">Notifications</h1><p className="mt-3 text-white/55">Realtime Supabase notification stream.</p></Card></AppShell>;
}
