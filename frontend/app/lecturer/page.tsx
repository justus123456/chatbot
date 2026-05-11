"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { GovernanceLoading, GovernanceRestricted, LecturerDashboard } from "@/components/governance/role-dashboards";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { canAccessLecturer, getRoleHome } from "@/lib/roles";

export default function LecturerPage() {
  const router = useRouter();
  const { user, loading } = useCurrentUser();

  useEffect(() => {
    if (!loading && user && !canAccessLecturer(user.role)) {
      router.replace(getRoleHome(user.role, Boolean(user.is_profile_complete)));
    }
  }, [loading, router, user]);

  if (loading) return <GovernanceLoading message="Checking your lecturer role..." />;

  if (!user || !canAccessLecturer(user.role)) {
    return <GovernanceRestricted message="Only lecturer accounts can open the level adviser dashboard." />;
  }

  return <LecturerDashboard user={user} />;
}
