import { apiFetch } from "@/lib/api/flask-client";

export function trackEngagement(
  payload: {
    event_type: string;
    target_table?: string;
    target_id?: string;
    label?: string;
    metadata?: Record<string, unknown>;
  },
  accessToken?: string,
) {
  return apiFetch("/api/engagement", accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  }).catch(() => null);
}
