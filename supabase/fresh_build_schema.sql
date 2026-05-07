-- SmartCampus AI fresh-build schema.
-- Use this for the new Next.js + Flask API architecture on a fresh Supabase project.

create extension if not exists pgcrypto;
create extension if not exists vector;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text not null default '',
  username text unique,
  role text not null default 'student' check (role in ('student', 'admin', 'lecturer', 'dean')),
  department text,
  level integer check (level in (100, 200, 300, 400, 500) or level is null),
  matric_number text,
  phone text unique,
  preferred_language text not null default 'en' check (preferred_language in ('en', 'pidgin')),
  preferred_tone text not null default 'simple' check (preferred_tone in ('formal', 'simple')),
  is_profile_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid()
      and role in ('admin', 'lecturer', 'dean')
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, name, username, preferred_language)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
    nullif(lower(new.raw_user_meta_data ->> 'username'), ''),
    case when new.raw_user_meta_data ->> 'preferred_language' in ('en', 'pidgin')
      then new.raw_user_meta_data ->> 'preferred_language'
      else 'en'
    end
  )
  on conflict (id) do update
  set email = excluded.email,
      username = coalesce(excluded.username, public.users.username),
      updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('pdf', 'image', 'docx', 'txt')),
  url text not null,
  filename text not null,
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  target_departments jsonb not null default '"all"'::jsonb,
  target_levels jsonb not null default '"all"'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_by_name text,
  created_by_role text,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null check (type in ('announcement', 'reminder', 'escalation_response', 'goal', 'system')),
  is_read boolean not null default false,
  link text,
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  title text not null,
  file_url text,
  content text,
  category text not null default 'knowledge',
  department text,
  level integer,
  source_type text not null default 'upload' check (source_type in ('upload', 'whatsapp_export', 'admin_entry')),
  created_at timestamptz not null default now()
);

create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.documents(id) on delete cascade,
  content text not null,
  chunk_index integer not null,
  embedding vector(768),
  department text,
  level integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists document_chunks_embedding_hnsw
on public.document_chunks using hnsw (embedding vector_cosine_ops);

create or replace function public.search_chunks(
  query_embedding vector(768),
  user_department text,
  user_level integer,
  match_count integer default 5
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    dc.id,
    dc.document_id,
    dc.content,
    1 - (dc.embedding <=> query_embedding) as similarity
  from public.document_chunks dc
  where
    (dc.department = user_department or dc.department = 'all' or dc.department is null)
    and (dc.level = user_level or dc.level is null)
  order by dc.embedding <=> query_embedding
  limit match_count;
end;
$$;

create table if not exists public.escalations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  user_department text,
  user_level integer,
  question text not null,
  context text,
  status text not null default 'pending' check (status in ('pending', 'assigned', 'resolved')),
  assigned_to uuid references public.users(id) on delete set null,
  admin_response text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  message text not null,
  attachments jsonb not null default '[]'::jsonb,
  response text not null,
  source text not null check (source in ('knowledge_base', 'llm', 'escalated')),
  confidence_score numeric not null default 0,
  escalation_id uuid references public.escalations(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.school_calendar (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  event_type text not null check (event_type in ('exam', 'registration', 'holiday', 'fee', 'deadline', 'event')),
  target_departments jsonb not null default '"all"'::jsonb,
  target_levels jsonb not null default '"all"'::jsonb,
  start_date date not null,
  end_date date,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  file_url text not null,
  type text not null check (type in ('past_question', 'material', 'handbook')),
  description text,
  target_departments jsonb not null default '"all"'::jsonb,
  target_levels jsonb not null default '"all"'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null,
  email text,
  phone text,
  office_location text,
  department text,
  created_at timestamptz not null default now()
);

create table if not exists public.rules (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  category text not null,
  department text,
  updated_at timestamptz not null default now()
);

create table if not exists public.faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  category text not null,
  language text not null default 'en' check (language in ('en', 'pidgin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.school_services (
  id uuid primary key default gen_random_uuid(),
  service_name text not null,
  description text,
  category text check (category in ('registration', 'fees', 'hostel', 'clearance', 'exam', 'general')),
  info text,
  updated_at timestamptz not null default now()
);

create table if not exists public.knowledge_base (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  category text,
  source text,
  embedding vector(768),
  created_at timestamptz not null default now()
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  description text,
  target_value numeric not null default 1,
  current_value numeric not null default 0,
  unit text not null default 'tasks',
  deadline date,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'overdue')),
  created_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  content text not null,
  course text,
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  deck_id uuid,
  question text not null,
  answer text not null,
  source_document_id uuid references public.documents(id) on delete set null,
  difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  last_reviewed timestamptz,
  next_review timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  chat_id uuid references public.chats(id) on delete set null,
  rating integer check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create table if not exists public.campus_map (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text not null check (category in ('office', 'department', 'library', 'cafeteria', 'hostel', 'admin', 'other')),
  latitude double precision,
  longitude double precision,
  floor text,
  building text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  action_type text not null,
  content text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_threads (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null unique,
  user_id uuid references public.users(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'escalated', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references public.whatsapp_threads(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  phone_number text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  message text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  response_source text check (response_source in ('knowledge_base', 'llm', 'escalated')),
  confidence_score numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;
alter table public.announcements enable row level security;
alter table public.notifications enable row level security;
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;
alter table public.escalations enable row level security;
alter table public.chats enable row level security;
alter table public.school_calendar enable row level security;
alter table public.resources enable row level security;
alter table public.contacts enable row level security;
alter table public.rules enable row level security;
alter table public.faqs enable row level security;
alter table public.school_services enable row level security;
alter table public.knowledge_base enable row level security;
alter table public.goals enable row level security;
alter table public.notes enable row level security;
alter table public.flashcards enable row level security;
alter table public.feedback enable row level security;
alter table public.campus_map enable row level security;
alter table public.user_activity enable row level security;
alter table public.whatsapp_threads enable row level security;
alter table public.whatsapp_messages enable row level security;

create policy "users_own_or_staff" on public.users for select to authenticated using (id = auth.uid() or public.is_staff());
create policy "users_update_own_or_staff" on public.users for update to authenticated using (id = auth.uid() or public.is_staff()) with check (id = auth.uid() or public.is_staff());

create policy "campus_read_authenticated" on public.announcements for select to authenticated using (true);
create policy "calendar_read_authenticated" on public.school_calendar for select to authenticated using (true);
create policy "resources_read_authenticated" on public.resources for select to authenticated using (true);
create policy "contacts_read_authenticated" on public.contacts for select to authenticated using (true);
create policy "rules_read_authenticated" on public.rules for select to authenticated using (true);
create policy "faqs_read_authenticated" on public.faqs for select to authenticated using (true);
create policy "services_read_authenticated" on public.school_services for select to authenticated using (true);
create policy "knowledge_base_read_authenticated" on public.knowledge_base for select to authenticated using (true);
create policy "map_read_authenticated" on public.campus_map for select to authenticated using (true);

create policy "staff_manage_announcements" on public.announcements for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff_manage_calendar" on public.school_calendar for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff_manage_resources" on public.resources for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff_manage_contacts" on public.contacts for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff_manage_rules" on public.rules for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff_manage_faqs" on public.faqs for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff_manage_services" on public.school_services for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff_manage_knowledge_base" on public.knowledge_base for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff_manage_map" on public.campus_map for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "own_notifications" on public.notifications for select to authenticated using (user_id = auth.uid() or public.is_staff());
create policy "staff_manage_notifications" on public.notifications for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "own_chats" on public.chats for select to authenticated using (user_id = auth.uid() or public.is_staff());
create policy "own_chat_insert" on public.chats for insert to authenticated with check (user_id = auth.uid() or public.is_staff());

create policy "own_documents" on public.documents for select to authenticated using (user_id = auth.uid() or public.is_staff());
create policy "document_insert_own_or_staff" on public.documents for insert to authenticated with check (user_id = auth.uid() or public.is_staff());
create policy "chunks_read_authenticated" on public.document_chunks for select to authenticated using (true);
create policy "staff_manage_chunks" on public.document_chunks for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "own_escalations" on public.escalations for select to authenticated using (user_id = auth.uid() or public.is_staff());
create policy "escalation_insert_own_or_staff" on public.escalations for insert to authenticated with check (user_id = auth.uid() or public.is_staff());
create policy "staff_update_escalations" on public.escalations for update to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "own_goals" on public.goals for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own_notes" on public.notes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own_flashcards" on public.flashcards for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own_feedback" on public.feedback for all to authenticated using (user_id = auth.uid() or public.is_staff()) with check (user_id = auth.uid() or public.is_staff());
create policy "own_activity" on public.user_activity for select to authenticated using (user_id = auth.uid() or public.is_staff());
create policy "own_activity_insert" on public.user_activity for insert to authenticated with check (user_id = auth.uid() or public.is_staff());

create policy "staff_whatsapp_threads" on public.whatsapp_threads for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff_whatsapp_messages" on public.whatsapp_messages for all to authenticated using (public.is_staff()) with check (public.is_staff());

insert into storage.buckets (id, name, public)
values ('student-resources', 'student-resources', false)
on conflict (id) do nothing;

create policy "student_resources_read" on storage.objects for select to authenticated using (bucket_id = 'student-resources');
create policy "staff_student_resources_write" on storage.objects for insert to authenticated with check (bucket_id = 'student-resources' and public.is_staff());
