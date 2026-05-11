"use client";

import { GovernancePageFrame, GovernanceShell } from "@/components/governance/role-dashboards";
import { NotificationsExperience } from "@/components/notifications/notifications-experience";
import { useCurrentUser } from "@/lib/hooks/use-current-user";

export default function LecturerNotificationsPage() {
  const { user } = useCurrentUser();

  return (
    <GovernanceShell role="lecturer" user={user}>
      <GovernancePageFrame>
        <NotificationsExperience />
      </GovernancePageFrame>
    </GovernanceShell>
  );
}
