import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";

export default function CalendarPage() {
  return <AppShell><Card><h1 className="text-3xl font-semibold">Smart Calendar</h1><p className="mt-3 text-white/55">Whole school calendar plus department and level filtered events.</p></Card></AppShell>;
}
