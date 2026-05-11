import { apiFetch } from "@/lib/api/flask-client";
import type { Notification, PaginatedResponse } from "@/lib/types";

export function getNotifications(accessToken?: string) {
  return apiFetch<PaginatedResponse<Notification>>("/api/notifications", accessToken);
}

export function updateNotification(notificationId: string, updates: { is_read?: boolean }, accessToken?: string) {
  return apiFetch<{ notification: Notification }>(`/api/notifications/${notificationId}`, accessToken, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export function markAllNotificationsRead(accessToken?: string) {
  return apiFetch<{ data: Notification[]; total: number }>("/api/notifications/mark-all-read", accessToken, {
    method: "POST",
  });
}

export function deleteNotification(notificationId: string, accessToken?: string) {
  return apiFetch<{ ok: boolean }>(`/api/notifications/${notificationId}`, accessToken, {
    method: "DELETE",
  });
}
