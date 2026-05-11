import { apiFetch } from "@/lib/api/flask-client";
import type { CalendarEvent, PaginatedResponse } from "@/lib/types";

export function getCalendarEvents(accessToken?: string) {
  return apiFetch<PaginatedResponse<CalendarEvent>>("/api/calendar", accessToken);
}
