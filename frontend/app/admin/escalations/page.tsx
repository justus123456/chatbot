import { AppShell } from "@/components/layout/app-shell";
import { EscalationsPanel } from "@/components/admin/escalations-panel";
import { Card } from "@/components/ui/card";

export default function AdminEscalationsPage() {
  return (
    <AppShell>
      <Card>
        <h1 className="text-3xl font-semibold">Escalations</h1>
        <p className="mt-3 text-white/55">Answer questions that RAG could not resolve confidently.</p>
        <EscalationsPanel />
      </Card>
    </AppShell>
  );
}
