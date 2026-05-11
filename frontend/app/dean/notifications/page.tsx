"use client";

import { GovernancePageFrame, GovernanceShell } from "@/components/governance/role-dashboards";
import { NotificationsExperience } from "@/components/notifications/notifications-experience";
import { useCurrentUser } from "@/lib/hooks/use-current-user";

export default function DeanNotificationsPage() {
  const { user } = useCurrentUser();

  return (
    <GovernanceShell role="dean" user={user}>
      <GovernancePageFrame>
        <NotificationsExperience />
      </GovernancePageFrame>
    </GovernanceShell>
  );
}
