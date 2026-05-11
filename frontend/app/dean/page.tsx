"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DeanDashboard, GovernanceLoading, GovernanceRestricted } from "@/components/governance/role-dashboards";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { canAccessDean, getRoleHome } from "@/lib/roles";

export default function DeanPage() {
  const router = useRouter();
  const { user, loading } = useCurrentUser();

  useEffect(() => {
    if (!loading && user && !canAccessDean(user.role)) {
      router.replace(getRoleHome(user.role, Boolean(user.is_profile_complete)));
    }
  }, [loading, router, user]);

  if (loading) return <GovernanceLoading message="Checking dean role..." />;

  if (!user || !canAccessDean(user.role)) {
    return <GovernanceRestricted message="Only the dean account can open the institutional oversight dashboard." />;
  }

  return <DeanDashboard user={user} />;
}
