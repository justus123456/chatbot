import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";

export default function AdminCalendarPage() {
  return <AppShell><Card><h1 className="text-3xl font-semibold">Calendar Manager</h1><p className="mt-3 text-white/55">Create exam, registration, fee, holiday, deadline, and event entries.</p></Card></AppShell>;
}
