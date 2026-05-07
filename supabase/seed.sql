insert into public.announcements (title, content, expires_at)
values
  ('Course registration closes Friday', 'Students should finalize course registration before 5:00 PM on Friday at the ICT centre.', current_date + interval '7 day'),
  ('Hostel allocation window opens Monday', 'Hostel applications will open on Monday by 9:00 AM through the student affairs desk.', current_date + interval '14 day');

insert into public.faqs (question, answer, category, language)
values
  ('How do I register my courses?', 'Visit the department portal desk with your cleared fees receipt, review your level courses, and submit registration before Friday 5 PM.', 'registration', 'en'),
  ('How I fit do my course registration?', 'Go the department portal desk with your school fees receipt, check your level courses well, then submit am before Friday 5 PM.', 'registration', 'pidgin'),
  ('Where can I pay school fees?', 'School fees are confirmed through the bursary payment channel on the Veritas portal and validated at the bursary office.', 'fees', 'en');

insert into public.contacts (name, role, email, phone, office_location)
values
  ('Mrs. Grace Okeke', 'Student Affairs Officer', 'studentaffairs@veritas.edu.ng', '+234-800-000-1000', 'Student Affairs Block'),
  ('ICT Help Desk', 'Support', 'ictsupport@veritas.edu.ng', '+234-800-000-2000', 'ICT Centre');

insert into public.rules (title, content, category)
values
  ('ID cards must be visible', 'Students are expected to wear valid school identification while on campus.', 'conduct');

insert into public.resources (title, file_url, type, description)
values
  ('CSC 301 Past Questions', 'https://example.com/resources/csc301-past-questions.pdf', 'past_question', 'Practice questions for 300-level computer science students.');

do $$
declare
  admin_id uuid;
begin
  select id into admin_id
  from public.users
  where role = 'admin'
  limit 1;

  if admin_id is not null then
    insert into public.reminders (title, message, target_role, due_date, created_by)
    values ('Clearance deadline', 'Submit all clearance documents before next Wednesday.', 'student', current_date + interval '3 day', admin_id);
  end if;
end $$;

-- After your first admin signs up, promote that account with:
-- update public.users set role = 'admin' where email = 'your-admin-email@example.com';
