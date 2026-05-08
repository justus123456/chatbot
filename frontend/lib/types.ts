export type UserRole = "student" | "admin" | "lecturer" | "dean";
export type Language = "en" | "pidgin";
export type TargetList<T> = T[] | "all";

export interface User {
  id: string;
  email: string;
  name: string;
  username?: string;
  role: UserRole;
  department: string;
  level: number;
  matric_number: string;
  phone: string;
  preferred_language: Language;
  preferred_tone: "formal" | "simple";
  is_profile_complete: boolean;
  created_at: string;
  updated_at: string;
}

export interface Attachment {
  id: string;
  type: "pdf" | "image" | "docx" | "txt";
  url: string;
  filename: string;
  size_bytes: number;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  target_departments: TargetList<string>;
  target_levels: TargetList<number>;
  attachments: Attachment[];
  created_by: string;
  created_by_name: string;
  created_by_role: UserRole;
  created_at: string;
  expires_at: string | null;
}

export interface ChatMessage {
  id: string;
  user_id: string;
  message: string;
  attachments: Attachment[];
  response: string;
  source: "knowledge_base" | "llm" | "escalated";
  confidence_score: number;
  escalation_id?: string | null;
  created_at: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  event_type: "exam" | "registration" | "holiday" | "fee" | "deadline" | "event";
  target_departments: TargetList<string>;
  target_levels: TargetList<number>;
  start_date: string;
  end_date: string | null;
  created_by: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: "announcement" | "reminder" | "escalation_response" | "goal" | "system";
  is_read: boolean;
  link: string | null;
  created_at: string;
}

export interface WhatsAppMessage {
  id: string;
  thread_id: string;
  user_id: string | null;
  phone_number: string;
  direction: "inbound" | "outbound";
  message: string;
  response_source: "knowledge_base" | "llm" | "escalated" | null;
  created_at: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  has_more: boolean;
}
