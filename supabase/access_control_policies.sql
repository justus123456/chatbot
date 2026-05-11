-- SmartCampus access-control foundation.
-- Run this in Supabase SQL Editor after your base schema exists.

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_role text,
  action text not null,
  table_name text not null,
  record_id uuid,
  before_snapshot jsonb not null default '{}'::jsonb,
  after_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;

drop policy if exists "dean can read audit logs" on public.audit_logs;
create policy "dean can read audit logs"
on public.audit_logs
for select
to authenticated
using (
  exists (
    select 1 from public.users
    where users.id = auth.uid()
      and users.role = 'dean'
  )
);

-- No update/delete policies are created for audit_logs.
-- The service role may insert logs; application users cannot modify them.

alter table public.users add column if not exists archived_at timestamptz;
alter table public.users add column if not exists archived_by uuid references public.users(id);
alter table public.users add column if not exists last_seen_at timestamptz;

alter table public.announcements add column if not exists deleted_at timestamptz;
alter table public.school_calendar add column if not exists deleted_at timestamptz;
alter table public.knowledge_base add column if not exists deleted_at timestamptz;
alter table public.resources add column if not exists deleted_at timestamptz;
alter table public.rules add column if not exists deleted_at timestamptz;
alter table public.contacts add column if not exists deleted_at timestamptz;
alter table public.campus_map add column if not exists deleted_at timestamptz;

alter table public.chats enable row level security;
alter table public.documents enable row level security;
alter table public.flashcards enable row level security;
alter table public.goals enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "students read own chats" on public.chats;
create policy "students read own chats"
on public.chats
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "students write own chats" on public.chats;
create policy "students write own chats"
on public.chats
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "students read own documents" on public.documents;
create policy "students read own documents"
on public.documents
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "students write own documents" on public.documents;
create policy "students write own documents"
on public.documents
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "students manage own flashcards" on public.flashcards;
create policy "students manage own flashcards"
on public.flashcards
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "students manage own goals" on public.goals;
create policy "students manage own goals"
on public.goals
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "users read own notifications" on public.notifications;
create policy "users read own notifications"
on public.notifications
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "users update own notifications" on public.notifications;
create policy "users update own notifications"
on public.notifications
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

alter table public.campus_map enable row level security;
drop policy if exists "authenticated users read campus map" on public.campus_map;
create policy "authenticated users read campus map"
on public.campus_map
for select
to authenticated
using (deleted_at is null);
