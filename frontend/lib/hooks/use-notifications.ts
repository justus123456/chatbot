"use client";

import { useEffect, useState } from "react";
import type { Notification } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

export function useNotifications(userId?: string) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    if (!userId) return;
    let supabase;

    try {
      supabase = createClient();
    } catch {
      setNotifications([]);
      return;
    }

    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setNotifications((data || []) as Notification[]));

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => setNotifications((items) => [payload.new as Notification, ...items]),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return notifications;
}
