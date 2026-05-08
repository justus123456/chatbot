import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";

export default function AdminPostPage() {
  return <AppShell><Card><h1 className="text-3xl font-semibold">Create Announcement</h1><p className="mt-3 text-white/55">Target posts by role, department, and level.</p></Card></AppShell>;
}
