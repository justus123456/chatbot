import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";

export default function AdminUsersPage() {
  return <AppShell><Card><h1 className="text-3xl font-semibold">Users</h1><p className="mt-3 text-white/55">Manage students, lecturers, admins, departments, and levels.</p></Card></AppShell>;
}
