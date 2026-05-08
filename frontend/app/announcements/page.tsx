import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";

export default function AnnouncementsPage() {
  return <AppShell><Card><h1 className="text-3xl font-semibold">Announcements</h1><p className="mt-3 text-white/55">Personalized updates filtered by department and level.</p></Card></AppShell>;
}
