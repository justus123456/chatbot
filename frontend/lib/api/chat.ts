import type { ChatMessage } from "@/lib/types";
import { apiFetch } from "@/lib/api/flask-client";

export type ChatResponse = Pick<ChatMessage, "id" | "message" | "response" | "source" | "confidence_score" | "created_at"> & {
  escalation_id?: string | null;
};

export async function sendChatMessage(message: string, accessToken?: string) {
  return apiFetch<ChatResponse>("/api/chat/message", accessToken, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export async function getChatHistory(accessToken?: string) {
  return apiFetch<{ data: ChatMessage[] }>("/api/chat/history", accessToken);
}

export async function deleteChat(chatId: string, accessToken?: string) {
  return apiFetch<{ ok: boolean }>(`/api/chat/history/${chatId}`, accessToken, {
    method: "DELETE",
  });
}
