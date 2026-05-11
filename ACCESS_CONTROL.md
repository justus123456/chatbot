# SmartCampus Access Control

SmartCampus uses four roles: `student`, `lecturer`, `admin`, and `dean`.

Role is resolved from `public.users.role` on protected Flask requests. The frontend may hide or show UI by role, but the backend must be treated as the authority for writes and staff-only data.

## Role Lanes

- Student: personal dashboard, private study tools, own notifications, own escalations.
- Lecturer: assigned department and level workspace. Can post and answer only inside their cohort.
- Admin: operational workspace. Manages system content, users, knowledge base, map, contacts, resources, and platform operations. Cannot answer academic escalations.
- Dean: institutional oversight workspace. Can broadcast university-wide and read immutable audit logs.

## Implemented In Code

- Login redirects by database role.
- Student dashboard redirects staff users to their own workspace.
- Lecturer, Admin, and Dean have separate routes.
- Admin route excludes lecturers.
- Lecturer announcement and calendar writes are checked server-side against `users.department` and `users.level`.
- Admin cannot create true university-wide broadcast announcements; dean can.
- Lecturer escalation reads are scoped to their department and level.
- Only lecturers can reply to academic escalations.
- Audit log hooks are called for announcement creation, calendar creation, and escalation replies.

## Database Layer

Run `supabase/access_control_policies.sql` in Supabase SQL Editor to add:

- `audit_logs`
- soft-delete support columns
- RLS for private student tables: `chats`, `documents`, `flashcards`, `goals`, `notifications`
- authenticated campus map read policy

The SQL file is the start of the database enforcement layer. Additional RLS should be added as new admin/dean CRUD surfaces are implemented.
