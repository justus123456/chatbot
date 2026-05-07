create extension if not exists pgcrypto;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and role = 'admin'
  );
$$;

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
  name text not null default '',
  email text not null unique,
  role text not null default 'student' check (role in ('student', 'admin')),
  preferred_language text not null default 'en' check (preferred_language in ('en', 'pidgin')),
  phone text,
  department text,
  faculty text,
  level text,
  student_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  message text not null,
  response text not null,
  source text not null default 'knowledge_base' check (source in ('knowledge_base', 'ai_fallback', 'openai_fallback', 'ai_unavailable')),
  created_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  created_at timestamptz not null default now(),
  expires_at date
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  message text not null,
  type text not null check (type in ('reminder', 'update', 'announcement')),
  date date not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
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

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  file_url text not null,
  type text not null check (type in ('past_question', 'material')),
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null,
  email text not null,
  phone text not null,
  office_location text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.rules (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  category text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  target_role text not null default 'student' check (target_role in ('student', 'admin', 'all')),
  due_date date not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.school_calendar (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  event_type text check (event_type in ('exam', 'registration', 'holiday', 'fee', 'event', 'deadline')),
  start_date date not null,
  end_date date,
  target_department text,
  target_level text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_chats_user_id on public.chats(user_id);
create index if not exists idx_notifications_user_id on public.notifications(user_id);
create index if not exists idx_notifications_date on public.notifications(date);
create index if not exists idx_faqs_language on public.faqs(language);
create index if not exists idx_reminders_target_role on public.reminders(target_role);
create index if not exists idx_school_calendar_start_date on public.school_calendar(start_date);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, name, email, preferred_language)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(new.email, '@', 1)
    ),
    new.email,
    case
      when new.raw_user_meta_data ->> 'preferred_language' in ('en', 'pidgin')
        then new.raw_user_meta_data ->> 'preferred_language'
      else 'en'
    end
  )
  on conflict (id) do update
  set
    email = excluded.email,
    name = case
      when public.users.name = '' then excluded.name
      else public.users.name
    end,
    preferred_language = excluded.preferred_language,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.id and not public.is_admin() then
    new.id = old.id;
    new.email = old.email;
    new.role = old.role;
  end if;

  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_protect_profile_fields on public.users;
create trigger users_protect_profile_fields
before update on public.users
for each row
execute function public.protect_profile_fields();

drop trigger if exists faqs_set_updated_at on public.faqs;
create trigger faqs_set_updated_at
before update on public.faqs
for each row
execute function public.set_updated_at();

drop trigger if exists rules_set_updated_at on public.rules;
create trigger rules_set_updated_at
before update on public.rules
for each row
execute function public.set_updated_at();

create or replace function public.handle_new_reminder()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, message, type, date)
  select
    u.id,
    new.message,
    'reminder',
    new.due_date
  from public.users u
  where new.target_role = 'all'
     or u.role = new.target_role;

  return new;
end;
$$;

drop trigger if exists reminders_create_notifications on public.reminders;
create trigger reminders_create_notifications
after insert on public.reminders
for each row
execute function public.handle_new_reminder();

alter table public.users enable row level security;
alter table public.chats enable row level security;
alter table public.announcements enable row level security;
alter table public.notifications enable row level security;
alter table public.faqs enable row level security;
alter table public.resources enable row level security;
alter table public.contacts enable row level security;
alter table public.rules enable row level security;
alter table public.reminders enable row level security;
alter table public.school_calendar enable row level security;

drop policy if exists "users_select_self_or_admin" on public.users;
create policy "users_select_self_or_admin"
on public.users
for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "users_update_self" on public.users;
create policy "users_update_self"
on public.users
for update
to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

drop policy if exists "chats_select_owner_or_admin" on public.chats;
create policy "chats_select_owner_or_admin"
on public.chats
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "chats_insert_owner_or_admin" on public.chats;
create policy "chats_insert_owner_or_admin"
on public.chats
for insert
to authenticated
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "notifications_select_owner_or_admin" on public.notifications;
create policy "notifications_select_owner_or_admin"
on public.notifications
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "notifications_admin_insert" on public.notifications;
create policy "notifications_admin_insert"
on public.notifications
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "notifications_admin_update" on public.notifications;
create policy "notifications_admin_update"
on public.notifications
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "notifications_admin_delete" on public.notifications;
create policy "notifications_admin_delete"
on public.notifications
for delete
to authenticated
using (public.is_admin());

drop policy if exists "announcements_authenticated_read" on public.announcements;
create policy "announcements_authenticated_read"
on public.announcements
for select
to authenticated
using (true);

drop policy if exists "announcements_admin_write" on public.announcements;
create policy "announcements_admin_write"
on public.announcements
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "faqs_authenticated_read" on public.faqs;
create policy "faqs_authenticated_read"
on public.faqs
for select
to authenticated
using (true);

drop policy if exists "faqs_admin_write" on public.faqs;
create policy "faqs_admin_write"
on public.faqs
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "resources_authenticated_read" on public.resources;
create policy "resources_authenticated_read"
on public.resources
for select
to authenticated
using (true);

drop policy if exists "resources_admin_write" on public.resources;
create policy "resources_admin_write"
on public.resources
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "contacts_authenticated_read" on public.contacts;
create policy "contacts_authenticated_read"
on public.contacts
for select
to authenticated
using (true);

drop policy if exists "contacts_admin_write" on public.contacts;
create policy "contacts_admin_write"
on public.contacts
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "rules_authenticated_read" on public.rules;
create policy "rules_authenticated_read"
on public.rules
for select
to authenticated
using (true);

drop policy if exists "rules_admin_write" on public.rules;
create policy "rules_admin_write"
on public.rules
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "reminders_role_read" on public.reminders;
create policy "reminders_role_read"
on public.reminders
for select
to authenticated
using (
  public.is_admin()
  or target_role = 'all'
  or exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role = public.reminders.target_role
  )
);

drop policy if exists "reminders_admin_write" on public.reminders;
create policy "reminders_admin_write"
on public.reminders
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "school_calendar_authenticated_read" on public.school_calendar;
create policy "school_calendar_authenticated_read"
on public.school_calendar
for select
to authenticated
using (true);

drop policy if exists "school_calendar_admin_write" on public.school_calendar;
create policy "school_calendar_admin_write"
on public.school_calendar
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant usage on schema public to authenticated;
grant execute on function public.is_admin() to authenticated;
grant select, update on public.users to authenticated;
grant select, insert on public.chats to authenticated;
grant select on public.announcements, public.faqs, public.resources, public.contacts, public.rules, public.reminders, public.school_calendar to authenticated;
grant select on public.notifications to authenticated;
grant insert, update, delete on public.announcements, public.faqs, public.resources, public.contacts, public.rules, public.reminders, public.notifications, public.school_calendar to authenticated;

insert into storage.buckets (id, name, public)
values ('student-resources', 'student-resources', false)
on conflict (id) do nothing;

drop policy if exists "resource_bucket_authenticated_read" on storage.objects;
create policy "resource_bucket_authenticated_read"
on storage.objects
for select
to authenticated
using (bucket_id = 'student-resources');

drop policy if exists "resource_bucket_admin_insert" on storage.objects;
create policy "resource_bucket_admin_insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'student-resources' and public.is_admin());

drop policy if exists "resource_bucket_admin_update" on storage.objects;
create policy "resource_bucket_admin_update"
on storage.objects
for update
to authenticated
using (bucket_id = 'student-resources' and public.is_admin())
with check (bucket_id = 'student-resources' and public.is_admin());

drop policy if exists "resource_bucket_admin_delete" on storage.objects;
create policy "resource_bucket_admin_delete"
on storage.objects
for delete
to authenticated
using (bucket_id = 'student-resources' and public.is_admin());
