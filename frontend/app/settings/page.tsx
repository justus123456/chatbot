import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";

export default function SettingsPage() {
  return <AppShell><Card><h1 className="text-3xl font-semibold">Settings</h1><p className="mt-3 text-white/55">Profile, language, tone, department, level, and notification preferences.</p></Card></AppShell>;
}
