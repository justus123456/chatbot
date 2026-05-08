"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);

    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } finally {
      setLoading(false);
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <Button type="button" variant="outline" onClick={handleLogout} disabled={loading}>
      <LogOut className="size-4" />
      {loading ? "Signing out..." : "Logout"}
    </Button>
  );
}
