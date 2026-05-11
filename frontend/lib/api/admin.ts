import { apiFetch } from "@/lib/api/flask-client";
import { createClient } from "@/lib/supabase/client";

export async function getFreshAccessToken(forceRefresh = false) {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  let session = data.session;
  const expiresAtMs = session?.expires_at ? session.expires_at * 1000 : 0;
  if (forceRefresh || !session?.access_token || expiresAtMs - Date.now() < 60_000) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session;
  }
  const token = session?.access_token;
  if (!token) throw new Error("Your login session expired. Please log out and log in again.");
  return token;
}

export type AdminOverview = {
  counts: {
    users: number;
    staff: number;
    students: number;
    announcements: number;
    escalations: number;
    kb: number;
    calendar: number;
    resources: number;
    map: number;
  };
  staff: Array<{
    id: string;
    name: string;
    email: string;
    role: "student" | "admin" | "lecturer" | "dean";
    department: string | null;
    level: number | null;
    is_profile_complete: boolean;
  }>;
  escalations: Array<{
    id: string;
    question: string;
    status: string | null;
    user_department: string | null;
    user_level: number | null;
    created_at: string | null;
  }>;
  announcements: Array<{
    id: string;
    title: string;
    content: string;
    created_at: string | null;
    target_departments?: string[] | string | null;
    target_levels?: number[] | string | null;
  }>;
  calendar: Array<{
    id: string;
    title: string;
    description: string | null;
    start_date: string;
    event_type: string | null;
  }>;
  lecturer_details?: {
    profile: {
      name: string | null;
      email: string | null;
      department: string | null;
      level: number | null;
    };
    own_announcements: Array<{
      id: string;
      title: string;
      status?: string | null;
      created_at?: string | null;
      delivery_count?: number;
    }>;
    own_calendar: Array<{
      id: string;
      title: string;
      event_type?: string | null;
      start_date?: string | null;
      end_date?: string | null;
    }>;
    own_knowledge_base: Array<{
      id: string;
      content: string;
      category?: string | null;
      source?: string | null;
      created_at?: string | null;
    }>;
    assigned_escalations: Array<{
      id: string;
      question: string;
      status?: string | null;
      created_at?: string | null;
      resolved_at?: string | null;
    }>;
    cohort: {
      total_students: number;
      active_students: number;
      unread_announcements: number;
      pending_escalations: number;
      resolved_by_me: number;
      average_response_hours: number;
      common_topics: Array<{ topic: string; count: number }>;
    };
    school_content: {
      announcements: Array<AdminAnnouncementRow>;
      calendar: Array<AdminCalendarRow>;
      resources: Array<ResourceRow>;
      faqs: Array<FaqRow>;
      knowledge_base: Array<KnowledgeBaseRow>;
    };
  } | null;
};

export function getAdminOverview(accessToken?: string) {
  return apiFetch<AdminOverview>("/api/admin/overview", accessToken);
}

export type AnnouncementPayload = {
  title: string;
  content: string;
  target_departments: string[] | "all";
  target_levels: number[] | "all";
  expires_at?: string | null;
};

export function createAdminAnnouncement(payload: AnnouncementPayload, accessToken?: string) {
  return apiFetch("/api/admin/announcements", accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type AdminAnnouncementRow = {
  id: string;
  title: string;
  content: string;
  created_by?: string | null;
  source?: string | null;
  status?: "draft" | "scheduled" | "published" | "expired" | string | null;
  computed_state?: string;
  created_by_role?: string | null;
  created_at: string;
  expires_at?: string | null;
  publish_at?: string | null;
  target_departments?: string[] | string | null;
  target_levels?: number[] | string | null;
};

export function getAdminAnnouncements(accessToken?: string) {
  return apiFetch<{ data: AdminAnnouncementRow[]; total: number }>("/api/admin/announcements", accessToken);
}

export function updateAdminAnnouncement(id: string, payload: Partial<AnnouncementPayload & { status: string; publish_at: string | null }>, accessToken?: string) {
  return apiFetch<AdminAnnouncementRow>(`/api/admin/announcements/${id}`, accessToken, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteAdminAnnouncement(id: string, accessToken?: string) {
  return apiFetch<{ ok: boolean }>(`/api/admin/announcements/${id}`, accessToken, { method: "DELETE" });
}

export type AdminCalendarRow = {
  id: string;
  title: string;
  description: string | null;
  event_type: string | null;
  start_date: string;
  end_date: string | null;
  created_by?: string | null;
  created_at?: string | null;
  target_departments?: string[] | string | null;
  target_levels?: number[] | string | null;
};

export function getAdminCalendar(accessToken?: string) {
  return apiFetch<{ data: AdminCalendarRow[]; total: number }>("/api/admin/calendar", accessToken);
}

export function createAdminCalendarEvent(payload: Partial<AdminCalendarRow>, accessToken?: string) {
  return apiFetch<AdminCalendarRow>("/api/admin/calendar", accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function importAdminCalendarEvents(payload: FormData, accessToken?: string) {
  return apiFetch<{ data: AdminCalendarRow[]; imported: number }>("/api/admin/calendar/import", accessToken, {
    method: "POST",
    body: payload,
  });
}

export function updateAdminCalendarEvent(id: string, payload: Partial<AdminCalendarRow>, accessToken?: string) {
  return apiFetch<AdminCalendarRow>(`/api/admin/calendar/${id}`, accessToken, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteAdminCalendarEvent(id: string, accessToken?: string) {
  return apiFetch<{ ok: boolean }>(`/api/admin/calendar/${id}`, accessToken, { method: "DELETE" });
}

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: "student" | "admin" | "lecturer" | "dean";
  department: string | null;
  level: number | null;
  matric_number: string | null;
  phone: string | null;
  is_profile_complete: boolean;
  created_at: string;
  updated_at: string;
  last_sign_in_at: string | null;
  notification_preferences: Record<string, unknown>;
  document_count: number;
  chat_session_count: number;
};

export function getAdminUsers(accessToken?: string) {
  return apiFetch<{ data: AdminUserRow[]; total: number }>("/api/admin/users", accessToken);
}

export function updateAdminUser(id: string, payload: Partial<Pick<AdminUserRow, "name" | "email" | "role" | "department" | "level" | "matric_number" | "phone" | "is_profile_complete">>, accessToken?: string) {
  return apiFetch<AdminUserRow>(`/api/admin/users/${id}`, accessToken, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function createAdminUser(payload: { name: string; email: string; password: string; role: "lecturer" | "admin" | "dean"; department?: string | null; level?: number | null }, accessToken?: string) {
  return apiFetch<AdminUserRow>("/api/admin/users", accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteAdminUser(id: string, accessToken?: string) {
  return apiFetch<AdminUserRow>(`/api/admin/users/${id}`, accessToken, { method: "DELETE" });
}

export type KnowledgeBaseRow = {
  id: string;
  content: string;
  category: string | null;
  source: string | null;
  is_authoritative?: boolean;
  authority_weight?: number;
  department?: string | null;
  level?: number | null;
  created_by?: string | null;
  created_by_role?: string | null;
  created_at: string | null;
  updated_at?: string | null;
  embedding_status?: "indexed" | "not_indexed" | string;
};

export function getAdminKnowledgeBase(accessToken?: string) {
  return apiFetch<{ data: KnowledgeBaseRow[]; total: number }>("/api/admin/knowledge-base", accessToken);
}

export function createAdminKnowledgeBaseEntry(payload: { content: string; category: string; source: string; authoritative_policy?: boolean; is_authoritative?: boolean; authority_weight?: number }, accessToken?: string) {
  return apiFetch<KnowledgeBaseRow>("/api/admin/knowledge-base", accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAdminKnowledgeBaseEntry(id: string, payload: Partial<{ content: string; category: string; source: string; department: string; authoritative_policy: boolean; is_authoritative: boolean; authority_weight: number }>, accessToken?: string) {
  return apiFetch<KnowledgeBaseRow>(`/api/admin/knowledge-base/${id}`, accessToken, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteAdminKnowledgeBaseEntry(id: string, accessToken?: string) {
  return apiFetch<{ ok: boolean }>(`/api/admin/knowledge-base/${id}`, accessToken, { method: "DELETE" });
}

export type Escalation = {
  id: string;
  user_id?: string;
  question: string;
  status: "pending" | "assigned" | "resolved";
  assigned_to: string | null;
  admin_response: string | null;
  created_at: string;
  resolved_at: string | null;
  user_department: string | null;
  user_level: number | null;
  context: string | null;
  routing_level: string;
  assigned_lecturer?: { id: string; name: string; email: string } | null;
  time_open_hours?: number;
  is_unassigned?: boolean;
  student_first_name?: string;
  similar_question_count?: number;
};

export function getEscalations(accessToken?: string) {
  return apiFetch<{
    data: Escalation[];
    total: number;
    page: number;
    per_page: number;
    has_more: boolean;
    meta?: {
      longest_open: Escalation[];
      department_rates: Array<{ department: string; count: number }>;
      unassigned_count: number;
    };
  }>("/api/admin/escalations", accessToken);
}

export function replyToEscalation(id: string, response: string, accessToken?: string) {
  return apiFetch<Escalation>(`/api/admin/escalations/${id}/reply`, accessToken, {
    method: "POST",
    body: JSON.stringify({ response }),
  });
}

export type AdminAnalytics = {
  counts: Record<string, number>;
  departments: Record<string, number>;
  levels: Record<string, number>;
  roles: Record<string, number>;
  user_analytics: {
    total_registered: number;
    new_registrations_week: number;
    new_registrations_month: number;
    profile_completion_rate: number;
    profile_complete: number;
    profile_incomplete: number;
    active_7_days: number;
    active_30_days: number;
    active_90_days: number;
    inactive_30_days: number;
    users_without_profile_complete: number;
  };
  content_analytics: {
    announcements_this_week: number;
    announcements_this_month: number;
    announcements_all_time: number;
    announcement_role_breakdown: Record<string, number>;
    average_creation_to_publish_hours: number;
    highest_notification_open_rates: Array<{
      announcement: string;
      sent: number;
      read: number;
      open_rate: number;
    }>;
    expired_announcements_visible: Array<{
      id: string;
      title: string;
      expires_at: string;
      status: string;
    }>;
    expired_visible_count: number;
  };
  ai_knowledge_analytics: {
    chat_messages_week: number;
    chat_messages_month: number;
    total_chat_messages: number;
    source_counts: Record<string, number>;
    knowledge_base_answer_rate: number;
    llm_answer_rate: number;
    escalation_rate: number;
    average_similarity_score: number;
    low_confidence_questions: Array<{ question: string; count: number }>;
    knowledge_base_by_category: Record<string, number>;
    knowledge_base_by_department: Record<string, number>;
    never_retrieved_entries: Array<{ id: string; category: string; source: string; preview: string }>;
    retrieval_tracking_active: boolean;
    student_documents_uploaded: number;
    student_document_storage_bytes: number;
  };
  escalation_analytics: {
    escalations_this_week: number;
    escalations_this_month: number;
    average_response_hours: number;
    resolved_within_24h_percent: number;
    resolved_within_48h_percent: number;
    resolved_beyond_48h_percent: number;
    resolution_bands: Record<string, number>;
    escalations_by_department: Record<string, number>;
    lecturer_response_rates: Array<{
      lecturer_ref: string;
      assigned: number;
      resolved: number;
      response_rate: number;
    }>;
    common_topics: Array<{ topic: string; count: number }>;
  };
  calendar_engagement_analytics: {
    calendar_event_views: Array<{ event: string; views: number }>;
    most_accessed_resources: Array<{ resource: string; opens: number }>;
    campus_map_search_terms: Array<{ term: string; count: number }>;
  };
  notification_analytics: {
    notifications_sent_this_week: number;
    delivery_success_rate: number;
    read_rate_by_type: Record<string, number>;
    unread_notifications: number;
    notifications_by_type: Record<string, number>;
  };
  whatsapp_analytics: {
    incoming_messages: number;
    parsed_successfully: number;
    failed_parses: number;
    outgoing_messages: number;
    web_chat_messages: number;
    whatsapp_vs_web: Record<string, number>;
  };
  recent_escalations: Array<Record<string, unknown>>;
};

export function getAdminAnalytics(accessToken?: string) {
  return apiFetch<AdminAnalytics>("/api/admin/analytics", accessToken);
}

export type DirectoryContact = {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  office_location: string;
  created_at?: string;
};

export function getAdminDirectory(accessToken?: string) {
  return apiFetch<{ data: DirectoryContact[]; total: number }>("/api/admin/directory", accessToken);
}

export function createAdminDirectoryContact(payload: Omit<DirectoryContact, "id" | "created_at">, accessToken?: string) {
  return apiFetch<DirectoryContact>("/api/admin/directory", accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAdminDirectoryContact(id: string, payload: Partial<Omit<DirectoryContact, "id" | "created_at">>, accessToken?: string) {
  return apiFetch<DirectoryContact>(`/api/admin/directory/${id}`, accessToken, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteAdminDirectoryContact(id: string, accessToken?: string) {
  return apiFetch<{ ok: boolean }>(`/api/admin/directory/${id}`, accessToken, { method: "DELETE" });
}

export type RuleRow = {
  id: string;
  title: string;
  content: string;
  category: string;
  created_at?: string;
  updated_at?: string;
};

export function getAdminRules(accessToken?: string) {
  return apiFetch<{ data: RuleRow[]; total: number }>("/api/admin/rules", accessToken);
}

export function createAdminRule(payload: Pick<RuleRow, "title" | "content" | "category">, accessToken?: string) {
  return apiFetch<RuleRow>("/api/admin/rules", accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAdminRule(id: string, payload: Partial<Pick<RuleRow, "title" | "content" | "category">>, accessToken?: string) {
  return apiFetch<RuleRow>(`/api/admin/rules/${id}`, accessToken, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteAdminRule(id: string, accessToken?: string) {
  return apiFetch<{ ok: boolean }>(`/api/admin/rules/${id}`, accessToken, { method: "DELETE" });
}

export type SystemLogRow = {
  id: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  before_snapshot?: Record<string, unknown>;
  after_snapshot?: Record<string, unknown>;
  created_at: string;
};

export function getAdminSystemLogs(accessToken?: string) {
  return apiFetch<{ data: SystemLogRow[]; total: number }>("/api/admin/system-logs", accessToken);
}

export type DeanOversight = {
  admin_accounts: Array<AdminUserRow & {
    significant_action_count?: number;
    is_active_7_days?: boolean;
    recent_actions?: SystemLogRow[];
  }>;
  active_admins_7_days: AdminUserRow[];
  inactive_admins_7_days: AdminUserRow[];
  admin_action_logs: SystemLogRow[];
  admin_response_times: {
    count: number;
    average_hours: number;
  };
  all_announcements: AdminAnnouncementRow[];
  deletion_history: SystemLogRow[];
};

export function getDeanOversight(accessToken?: string) {
  return apiFetch<DeanOversight>("/api/admin/dean/oversight", accessToken);
}

export type DeanInstitutionalAnalytics = {
  department_performance: Array<{
    department: string;
    students: number;
    active_students_30d: number;
    engagement_rate: number;
    escalations: number;
    escalation_rate: number;
    knowledge_entries: number;
    announcement_frequency: number;
  }>;
  lecturer_engagement: Array<{
    id: string;
    name: string;
    email: string;
    department: string | null;
    level: number | null;
    announcements_last_30d: number;
    last_announcement_at: string | null;
    has_not_posted_30d: boolean;
    unanswered_escalations_over_48h: number;
  }>;
  admin_activity_report: Array<{
    id: string;
    name: string;
    email: string;
    actions_last_30d: number;
    last_action_at: string | null;
  }>;
  platform_health: {
    knowledge_base_quality_score: number;
    escalation_resolution_rate: number;
    ai_answer_quality_current_week: number;
    ai_answer_quality_previous_week: number;
    student_retention_30d: number;
  };
  onboarding_funnel: Array<{ step: string; count: number }>;
  student_engagement_by_cohort: Array<{
    department: string;
    level: string | number;
    students: number;
    active_30d: number;
    engagement_rate: number;
  }>;
  summary_reports: { weekly: string; monthly: string };
  content_oversight: {
    all_announcements: AdminAnnouncementRow[];
    knowledge_base_quality: Array<{
      id: string;
      category: string | null;
      source: string | null;
      department: string | null;
      retrieval_count: number;
      average_similarity: number;
      preview: string;
    }>;
    full_escalation_history: Escalation[];
    deleted_content: SystemLogRow[];
    restore_supported: boolean;
  };
};

export function getDeanInstitutionalAnalytics(accessToken?: string) {
  return apiFetch<DeanInstitutionalAnalytics>("/api/admin/dean/analytics", accessToken);
}

export function restoreDeanDeletedContent(logId: string, accessToken?: string) {
  return apiFetch<Record<string, unknown>>(`/api/admin/dean/restore-deleted-content/${logId}`, accessToken, { method: "POST" });
}

export type WhatsappMessageRow = {
  id: string;
  thread_id: string | null;
  user_id: string | null;
  phone_number: string;
  direction: "inbound" | "outbound";
  message: string;
  raw_payload?: Record<string, unknown>;
  response_source: string | null;
  confidence_score: number | null;
  created_at: string;
};

export function getAdminWhatsappMessages(accessToken?: string) {
  return apiFetch<{ data: WhatsappMessageRow[]; total: number }>("/api/admin/whatsapp", accessToken);
}

export function convertWhatsappToAnnouncement(id: string, payload: { title: string; content?: string; target_departments: string[] | "all"; target_levels: number[] | "all" }, accessToken?: string) {
  return apiFetch<AdminAnnouncementRow>(`/api/admin/whatsapp/${id}/announcement`, accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function sendAdminNotification(payload: { title: string; message: string; type: string; target_departments: string[] | "all"; target_levels: number[] | "all"; date?: string; link?: string }, accessToken?: string) {
  return apiFetch<{ sent: number }>("/api/admin/notifications", accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type FaqRow = { id: string; question: string; answer: string; category: string; language: "en" | "pidgin"; created_at?: string; updated_at?: string };
export function getAdminFaqs(accessToken?: string) {
  return apiFetch<{ data: FaqRow[]; total: number }>("/api/admin/faqs", accessToken);
}
export function createAdminFaq(payload: Omit<FaqRow, "id" | "created_at" | "updated_at">, accessToken?: string) {
  return apiFetch<FaqRow>("/api/admin/faqs", accessToken, { method: "POST", body: JSON.stringify(payload) });
}
export function updateAdminFaq(id: string, payload: Partial<Omit<FaqRow, "id" | "created_at" | "updated_at">>, accessToken?: string) {
  return apiFetch<FaqRow>(`/api/admin/faqs/${id}`, accessToken, { method: "PATCH", body: JSON.stringify(payload) });
}
export function deleteAdminFaq(id: string, accessToken?: string) {
  return apiFetch<{ ok: boolean }>(`/api/admin/faqs/${id}`, accessToken, { method: "DELETE" });
}

export type ResourceRow = { id: string; title: string; file_url: string; type: "past_question" | "material"; description: string; department?: string | null; level?: number | null; created_by?: string | null; created_by_role?: string | null; created_at?: string };
export function getAdminResources(accessToken?: string) {
  return apiFetch<{ data: ResourceRow[]; total: number }>("/api/admin/resources", accessToken);
}
export function createAdminResource(payload: Omit<ResourceRow, "id" | "created_at">, accessToken?: string) {
  return apiFetch<ResourceRow>("/api/admin/resources", accessToken, { method: "POST", body: JSON.stringify(payload) });
}
export function updateAdminResource(id: string, payload: Partial<Omit<ResourceRow, "id" | "created_at">>, accessToken?: string) {
  return apiFetch<ResourceRow>(`/api/admin/resources/${id}`, accessToken, { method: "PATCH", body: JSON.stringify(payload) });
}
export function deleteAdminResource(id: string, accessToken?: string) {
  return apiFetch<{ ok: boolean }>(`/api/admin/resources/${id}`, accessToken, { method: "DELETE" });
}

export type ServiceRow = { id: string; service_name: string; description: string | null; category: string | null; info: string | null; updated_at?: string };
export function getAdminServices(accessToken?: string) {
  return apiFetch<{ data: ServiceRow[]; total: number }>("/api/admin/services", accessToken);
}
export function createAdminService(payload: Omit<ServiceRow, "id" | "updated_at">, accessToken?: string) {
  return apiFetch<ServiceRow>("/api/admin/services", accessToken, { method: "POST", body: JSON.stringify(payload) });
}
export function updateAdminService(id: string, payload: Partial<Omit<ServiceRow, "id" | "updated_at">>, accessToken?: string) {
  return apiFetch<ServiceRow>(`/api/admin/services/${id}`, accessToken, { method: "PATCH", body: JSON.stringify(payload) });
}
export function deleteAdminService(id: string, accessToken?: string) {
  return apiFetch<{ ok: boolean }>(`/api/admin/services/${id}`, accessToken, { method: "DELETE" });
}
