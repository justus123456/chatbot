"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LecturerKnowledgeWorkflow } from "@/components/governance/lecturer-workflows";
import { GovernanceLoading, GovernancePageFrame, GovernanceRestricted, GovernanceShell } from "@/components/governance/role-dashboards";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { canAccessLecturer, getRoleHome } from "@/lib/roles";

export default function LecturerKnowledgeBasePage() {
  const router = useRouter();
  const { user, loading } = useCurrentUser();

  useEffect(() => {
    if (!loading && user && !canAccessLecturer(user.role)) {
      router.replace(getRoleHome(user.role, Boolean(user.is_profile_complete)));
    }
  }, [loading, router, user]);

  if (loading) return <GovernanceLoading message="Checking your lecturer role..." />;
  if (!user || !canAccessLecturer(user.role)) return <GovernanceRestricted message="Only lecturer accounts can manage lecturer knowledge entries." />;

  return (
    <GovernanceShell role="lecturer" user={user}>
      <GovernancePageFrame>
        <LecturerKnowledgeWorkflow user={user} />
      </GovernancePageFrame>
    </GovernanceShell>
  );
}
