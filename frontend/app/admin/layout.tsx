"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { GovernanceLoading, GovernancePageFrame, GovernanceRestricted, GovernanceShell } from "@/components/governance/role-dashboards";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { canAccessAdmin } from "@/lib/roles";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useCurrentUser();

  useEffect(() => {
    if (!loading && user && !canAccessAdmin(user.role)) {
      router.replace(user.role === "lecturer" ? "/lecturer" : "/dashboard");
    }
  }, [loading, router, user]);

  if (loading) {
    return <GovernanceLoading message="Checking your staff role..." />;
  }

  if (!user || !canAccessAdmin(user.role)) {
    return <GovernanceRestricted message="Only admins and deans can open this section." />;
  }

  return (
    <GovernanceShell role={user.role === "dean" ? "dean" : "admin"} user={user}>
      <GovernancePageFrame>{children}</GovernancePageFrame>
    </GovernanceShell>
  );
}
