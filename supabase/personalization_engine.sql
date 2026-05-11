-- SmartCampus personalisation engine starter SQL
-- Paste in Supabase SQL editor if your database does not already have these tables/columns.

create extension if not exists pgcrypto;

alter table public.users
  add column if not exists preferred_language text not null default 'en'
    check (preferred_language in ('en', 'pidgin')),
  add column if not exists preferred_tone text not null default 'simple'
    check (preferred_tone in ('formal', 'simple')),
  add column if not exists is_profile_complete boolean not null default false,
  add column if not exists last_sign_in_at timestamptz,
  add column if not exists notification_preferences jsonb not null default '{}'::jsonb;

create table if not exists public.user_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  action_type text not null,
  content text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.engagement_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  event_type text not null,
  target_table text,
  target_id uuid,
  label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists user_activity_user_created_idx
  on public.user_activity (user_id, created_at desc);

create index if not exists user_activity_action_created_idx
  on public.user_activity (action_type, created_at desc);

create index if not exists engagement_events_user_created_idx
  on public.engagement_events (user_id, created_at desc);

create index if not exists engagement_events_type_created_idx
  on public.engagement_events (event_type, created_at desc);

alter table public.user_activity enable row level security;
alter table public.engagement_events enable row level security;

drop policy if exists "students can insert own user activity" on public.user_activity;
create policy "students can insert own user activity"
on public.user_activity
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "students can read own user activity" on public.user_activity;
create policy "students can read own user activity"
on public.user_activity
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "students can insert own engagement events" on public.engagement_events;
create policy "students can insert own engagement events"
on public.engagement_events
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "students can read own engagement events" on public.engagement_events;
create policy "students can read own engagement events"
on public.engagement_events
for select
to authenticated
using (user_id = auth.uid());

-- Admin/dean analytics should use backend aggregate endpoints.
-- Do not create broad student-personal read policies for lecturers/admins here.
