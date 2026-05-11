"use client";

import { AdminCommandCenterContent } from "@/components/governance/role-dashboards";
import { useCurrentUser } from "@/lib/hooks/use-current-user";

export default function AdminPage() {
  const { user } = useCurrentUser();
  return <AdminCommandCenterContent user={user} />;
}
