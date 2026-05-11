import { apiFetch } from "@/lib/api/flask-client";

export function getChatSuggestions(accessToken?: string) {
  return apiFetch<{ suggestions: string[]; context_preview?: string }>("/api/personalization/chat-suggestions", accessToken);
}
