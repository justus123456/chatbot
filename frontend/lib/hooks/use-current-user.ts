"use client";

import { useEffect, useState } from "react";
import type { User } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

type UseCurrentUserResult = {
  user: User | null;
  loading: boolean;
  error: string;
};

export function useCurrentUser(): UseCurrentUserResult {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      try {
        const supabase = createClient();
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();

        if (!authUser) {
          if (!cancelled) {
            setUser(null);
            setLoading(false);
          }
          return;
        }

        const { data, error: profileError } = await supabase
          .from("users")
          .select("*")
          .eq("id", authUser.id)
          .single();

        if (profileError) throw profileError;

        if (!cancelled) {
          setUser(data as User);
          setLoading(false);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Could not load your profile.");
          setLoading(false);
        }
      }
    }

    loadUser();

    return () => {
      cancelled = true;
    };
  }, []);

  return { user, loading, error };
}
