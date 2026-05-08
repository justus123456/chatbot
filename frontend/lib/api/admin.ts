import type { PaginatedResponse } from "@/lib/types";
import { apiFetch } from "@/lib/api/flask-client";

export interface Escalation {
  id: string;
  user_id: string;
  user_department: string | null;
  user_level: number | null;
  question: string;
  status: "pending" | "assigned" | "resolved";
  admin_response: string | null;
  created_at: string;
}

export async function getEscalations(accessToken?: string) {
  return apiFetch<PaginatedResponse<Escalation>>("/api/admin/escalations", accessToken);
}

export async function replyToEscalation(escalationId: string, response: string, accessToken?: string) {
  return apiFetch<Escalation>(`/api/admin/escalations/${escalationId}/reply`, accessToken, {
    method: "POST",
    body: JSON.stringify({ response }),
  });
}
