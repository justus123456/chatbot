-- SmartCampus admin privilege support
-- Paste this into Supabase SQL editor after reviewing for your project.

create extension if not exists pgcrypto;

alter table public.users
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.users(id),
  add column if not exists last_sign_in_at timestamptz,
  add column if not exists notification_preferences jsonb not null default '{}'::jsonb;

alter table public.resources
  add column if not exists department text,
  add column if not exists level integer check (level is null or level in (100, 200, 300, 400, 500)),
  add column if not exists created_by uuid references public.users(id),
  add column if not exists created_by_role text check (created_by_role is null or created_by_role in ('admin', 'lecturer', 'dean'));

alter table public.announcements
  add column if not exists status text not null default 'published'
    check (status in ('draft', 'scheduled', 'published', 'expired')),
  add column if not exists publish_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.knowledge_base
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists department text,
  add column if not exists level integer check (level is null or level in (100, 200, 300, 400, 500)),
  add column if not exists created_by uuid references public.users(id),
  add column if not exists created_by_role text check (created_by_role is null or created_by_role in ('admin', 'lecturer', 'dean')),
  add column if not exists is_authoritative boolean not null default false,
  add column if not exists authority_weight double precision not null default 1.0;

create index if not exists knowledge_base_authority_idx
  on public.knowledge_base (is_authoritative, authority_weight desc);

alter table public.notifications
  add column if not exists related_table text,
  add column if not exists related_id uuid;

alter table public.contacts
  add column if not exists is_public boolean not null default true;

create table if not exists public.knowledge_retrievals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id),
  knowledge_base_id uuid references public.knowledge_base(id),
  document_chunk_id uuid references public.document_chunks(id),
  similarity double precision default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.engagement_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id),
  event_type text not null,
  target_table text,
  target_id uuid,
  label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.users(id),
  actor_role text,
  action text not null,
  table_name text not null,
  record_id uuid,
  before_snapshot jsonb not null default '{}'::jsonb,
  after_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.current_app_role()
returns text
language sql
stable
as $$
  select role from public.users where id = auth.uid()
$$;

create or replace function public.is_admin_or_dean()
returns boolean
language sql
stable
as $$
  select coalesce(public.current_app_role() in ('admin', 'dean'), false)
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
as $$
  select coalesce(public.current_app_role() in ('admin', 'lecturer', 'dean'), false)
$$;

alter table public.users enable row level security;
alter table public.chats enable row level security;
alter table public.documents enable row level security;
alter table public.flashcards enable row level security;
alter table public.goals enable row level security;
alter table public.notifications enable row level security;
alter table public.announcements enable row level security;
alter table public.school_calendar enable row level security;
alter table public.knowledge_base enable row level security;
alter table public.contacts enable row level security;
alter table public.campus_map enable row level security;
alter table public.resources enable row level security;
alter table public.rules enable row level security;
alter table public.school_services enable row level security;
alter table public.faqs enable row level security;
alter table public.escalations enable row level security;
alter table public.audit_logs enable row level security;
alter table public.knowledge_retrievals enable row level security;
alter table public.engagement_events enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.whatsapp_threads enable row level security;

drop policy if exists "users can read own profile" on public.users;
create policy "users can read own profile" on public.users
for select using (auth.uid() = id and is_deleted = false);

drop policy if exists "admins can read controlled user list" on public.users;
create policy "admins can read controlled user list" on public.users
for select using (public.is_admin_or_dean());

drop policy if exists "admins can update users except dean guard in api" on public.users;
create policy "admins can update users except dean guard in api" on public.users
for update using (public.is_admin_or_dean()) with check (public.is_admin_or_dean());

drop policy if exists "private chats are owner only" on public.chats;
create policy "private chats are owner only" on public.chats
for select using (auth.uid() = user_id);

drop policy if exists "private documents are owner only" on public.documents;
create policy "private documents are owner only" on public.documents
for select using (auth.uid() = user_id);

drop policy if exists "private flashcards are owner only" on public.flashcards;
create policy "private flashcards are owner only" on public.flashcards
for select using (auth.uid() = user_id);

drop policy if exists "private goals are owner only" on public.goals;
create policy "private goals are owner only" on public.goals
for select using (auth.uid() = user_id);

drop policy if exists "notifications owner or admin aggregate troubleshooting" on public.notifications;
create policy "notifications owner or admin aggregate troubleshooting" on public.notifications
for select using (auth.uid() = user_id or public.is_admin_or_dean());

drop policy if exists "admins send notifications" on public.notifications;
create policy "admins send notifications" on public.notifications
for insert with check (public.is_staff());

drop policy if exists "admins update notifications for audit troubleshooting" on public.notifications;
create policy "admins update notifications for audit troubleshooting" on public.notifications
for update using (public.is_admin_or_dean()) with check (public.is_admin_or_dean());

drop policy if exists "staff manage announcements" on public.announcements;
create policy "staff manage announcements" on public.announcements
for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "authenticated read announcements" on public.announcements;
create policy "authenticated read announcements" on public.announcements
for select using (auth.role() = 'authenticated');

drop policy if exists "admins manage school calendar" on public.school_calendar;
create policy "admins manage school calendar" on public.school_calendar
for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "authenticated read shared content" on public.knowledge_base;
create policy "authenticated read shared content" on public.knowledge_base
for select using (auth.role() = 'authenticated');

drop policy if exists "staff manage knowledge base" on public.knowledge_base;
create policy "staff manage knowledge base" on public.knowledge_base
for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "admin manage contacts" on public.contacts;
create policy "admin manage contacts" on public.contacts
for all using (public.is_admin_or_dean()) with check (public.is_admin_or_dean());

drop policy if exists "authenticated read contacts" on public.contacts;
create policy "authenticated read contacts" on public.contacts
for select using (auth.role() = 'authenticated');

drop policy if exists "admin manage campus map" on public.campus_map;
create policy "admin manage campus map" on public.campus_map
for all using (public.is_admin_or_dean()) with check (public.is_admin_or_dean());

drop policy if exists "authenticated read campus map" on public.campus_map;
create policy "authenticated read campus map" on public.campus_map
for select using (auth.role() = 'authenticated');

drop policy if exists "admin manage resources" on public.resources;
create policy "admin manage resources" on public.resources
for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "authenticated read resources" on public.resources;
create policy "authenticated read resources" on public.resources
for select using (auth.role() = 'authenticated');

drop policy if exists "admin manage rules" on public.rules;
create policy "admin manage rules" on public.rules
for all using (public.is_admin_or_dean()) with check (public.is_admin_or_dean());

drop policy if exists "authenticated read rules" on public.rules;
create policy "authenticated read rules" on public.rules
for select using (auth.role() = 'authenticated');

drop policy if exists "admin manage services" on public.school_services;
create policy "admin manage services" on public.school_services
for all using (public.is_admin_or_dean()) with check (public.is_admin_or_dean());

drop policy if exists "authenticated read services" on public.school_services;
create policy "authenticated read services" on public.school_services
for select using (auth.role() = 'authenticated');

drop policy if exists "admin manage faqs" on public.faqs;
create policy "admin manage faqs" on public.faqs
for all using (public.is_admin_or_dean()) with check (public.is_admin_or_dean());

drop policy if exists "authenticated read faqs" on public.faqs;
create policy "authenticated read faqs" on public.faqs
for select using (auth.role() = 'authenticated');

drop policy if exists "admin read escalations" on public.escalations;
create policy "admin read escalations" on public.escalations
for select using (
  public.is_admin_or_dean()
  or auth.uid() = user_id
  or exists (
    select 1
    from public.users staff
    where staff.id = auth.uid()
      and staff.role = 'lecturer'
      and staff.department = public.escalations.user_department
      and staff.level = public.escalations.user_level
  )
);

drop policy if exists "lecturers update cohort escalations" on public.escalations;
create policy "lecturers update cohort escalations" on public.escalations
for update using (
  public.is_admin_or_dean()
  or exists (
    select 1
    from public.users staff
    where staff.id = auth.uid()
      and staff.role = 'lecturer'
      and staff.department = public.escalations.user_department
      and staff.level = public.escalations.user_level
  )
) with check (
  public.is_admin_or_dean()
  or exists (
    select 1
    from public.users staff
    where staff.id = auth.uid()
      and staff.role = 'lecturer'
      and staff.department = public.escalations.user_department
      and staff.level = public.escalations.user_level
  )
);

drop policy if exists "admin read audit logs" on public.audit_logs;
create policy "admin read audit logs" on public.audit_logs
for select using (public.is_admin_or_dean());

drop policy if exists "staff insert audit logs" on public.audit_logs;
create policy "staff insert audit logs" on public.audit_logs
for insert with check (public.is_staff());

drop policy if exists "admins read knowledge retrievals" on public.knowledge_retrievals;
create policy "admins read knowledge retrievals" on public.knowledge_retrievals
for select using (public.is_admin_or_dean());

drop policy if exists "authenticated insert own knowledge retrievals" on public.knowledge_retrievals;
create policy "authenticated insert own knowledge retrievals" on public.knowledge_retrievals
for insert with check (auth.uid() = user_id);

drop policy if exists "admins read engagement events" on public.engagement_events;
create policy "admins read engagement events" on public.engagement_events
for select using (public.is_admin_or_dean());

drop policy if exists "authenticated insert own engagement events" on public.engagement_events;
create policy "authenticated insert own engagement events" on public.engagement_events
for insert with check (auth.uid() = user_id);

drop policy if exists "admins read whatsapp logs" on public.whatsapp_messages;
create policy "admins read whatsapp logs" on public.whatsapp_messages
for select using (public.is_admin_or_dean());

drop policy if exists "admins update whatsapp logs" on public.whatsapp_messages;
create policy "admins update whatsapp logs" on public.whatsapp_messages
for update using (public.is_admin_or_dean()) with check (public.is_admin_or_dean());

drop policy if exists "admins read whatsapp threads" on public.whatsapp_threads;
create policy "admins read whatsapp threads" on public.whatsapp_threads
for select using (public.is_admin_or_dean());
