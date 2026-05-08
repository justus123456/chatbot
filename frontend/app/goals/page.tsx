import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";

export default function GoalsPage() {
  return <AppShell><Card><h1 className="text-3xl font-semibold">Goals</h1><p className="mt-3 text-white/55">Set goals, track progress, and receive smart reminders.</p></Card></AppShell>;
}
