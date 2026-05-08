import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";

export default function PlannerPage() {
  return <AppShell><Card><h1 className="text-3xl font-semibold">Planner</h1><p className="mt-3 text-white/55">Plan study sessions around calendar events and goals.</p></Card></AppShell>;
}
