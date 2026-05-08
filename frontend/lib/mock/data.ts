import type { Announcement, CalendarEvent, Notification, User } from "@/lib/types";

export const mockUser: User = {
  id: "mock-user-1",
  email: "justus@veritas.edu.ng",
  name: "Justus Idodo",
  username: "justus",
  role: "student",
  department: "Computer Science",
  level: 300,
  matric_number: "VUG/CSC/3001",
  phone: "+2348012345678",
  preferred_language: "en",
  preferred_tone: "simple",
  is_profile_complete: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const mockAnnouncements: Announcement[] = [
  {
    id: "ann-1",
    title: "Course registration closes Friday",
    content: "300-level students should complete registration before 5 PM.",
    target_departments: ["Computer Science"],
    target_levels: [300],
    attachments: [],
    created_by: "admin-1",
    created_by_name: "Academic Office",
    created_by_role: "admin",
    created_at: new Date().toISOString(),
    expires_at: null,
  },
];

export const mockNotifications: Notification[] = [
  {
    id: "note-1",
    user_id: mockUser.id,
    title: "Registration reminder",
    message: "Your department registration window closes in 3 days.",
    type: "reminder",
    is_read: false,
    link: "/calendar",
    created_at: new Date().toISOString(),
  },
];

export const mockEvents: CalendarEvent[] = [
  {
    id: "event-1",
    title: "CSC 301 assignment due",
    description: "Submit through the department portal.",
    event_type: "deadline",
    target_departments: ["Computer Science"],
    target_levels: [300],
    start_date: new Date().toISOString(),
    end_date: null,
    created_by: "admin-1",
    created_at: new Date().toISOString(),
  },
];
