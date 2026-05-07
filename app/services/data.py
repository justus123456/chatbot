from copy import deepcopy
from datetime import datetime, timedelta, timezone
from uuid import uuid4

try:
    from supabase import Client, create_client
    from supabase.lib.client_options import SyncClientOptions
except ImportError:  # pragma: no cover - handled by fallback mode
    Client = None
    create_client = None
    SyncClientOptions = None


def utc_now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class DataRepository:
    def __init__(self, config):
        self.config = config
        self.supabase_url = self.config.get("SUPABASE_URL", "")
        self.anon_key = self.config.get("SUPABASE_ANON_KEY", "")
        self.service_role_key = self.config.get("SUPABASE_SERVICE_ROLE_KEY", "")
        self.allow_demo_auth = self.config.get("ALLOW_DEMO_AUTH", False)
        self.client = self._build_client(self.anon_key)
        self.mode = "supabase" if self.client else "memory"
        self.memory = self._seed_memory()

    def _build_client(self, key, access_token=None):
        if not self.supabase_url or not key or not create_client:
            return None
        options = None
        if access_token and SyncClientOptions:
          options = SyncClientOptions(headers={"Authorization": f"Bearer {access_token}"})
        return create_client(self.supabase_url, key, options=options)

    def _query_client(self, access_token=None, use_service_role=False):
        if self.mode != "supabase":
            return None
        if access_token:
            return self._build_client(self.anon_key, access_token=access_token)
        if use_service_role and self.service_role_key:
            return self._build_client(self.service_role_key)
        return self.client

    def _ensure_supabase_profile(self, user_id, email, name="", preferred_language="en", role="student"):
        service_client = self._query_client(use_service_role=True)
        if not service_client:
            return None

        profile = {
            "id": user_id,
            "email": email,
            "name": name or email.split("@", 1)[0],
            "preferred_language": preferred_language or "en",
            "role": role or "student",
            "updated_at": utc_now(),
        }
        service_client.table("users").upsert(profile).execute()
        records = service_client.table("users").select("*").eq("id", user_id).limit(1).execute().data
        return records[0] if records else None

    def _is_expired_jwt_error(self, exc):
        message = str(exc).lower()
        return "jwt expired" in message or "pgrst303" in message

    def _seed_memory(self):
        now = utc_now()
        admin_id = str(uuid4())
        student_id = str(uuid4())
        return {
            "users": [
                {
                    "id": admin_id,
                    "name": "Portal Admin",
                    "email": "admin@veritas.edu.ng",
                    "password": "admin123",
                    "role": "admin",
                    "preferred_language": "en",
                    "phone": "+234-800-000-0001",
                    "department": "Administration",
                    "faculty": "Management",
                    "level": "Staff",
                    "student_number": "ADMIN-001",
                    "created_at": now,
                },
                {
                    "id": student_id,
                    "name": "Demo Student",
                    "email": "student@veritas.edu.ng",
                    "password": "student123",
                    "role": "student",
                    "preferred_language": "en",
                    "phone": "+234-801-111-2222",
                    "department": "Computer Science",
                    "faculty": "Natural and Applied Sciences",
                    "level": "300",
                    "student_number": "VUG/CSC/3001",
                    "created_at": now,
                },
            ],
            "chats": [],
            "announcements": [
                {
                    "id": str(uuid4()),
                    "title": "Course registration closes Friday",
                    "content": "Students should finalize course registration before 5:00 PM on Friday at the ICT centre.",
                    "created_at": now,
                    "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).date().isoformat(),
                },
                {
                    "id": str(uuid4()),
                    "title": "Hostel allocation window opens Monday",
                    "content": "Hostel applications will open on Monday by 9:00 AM through the student affairs desk.",
                    "created_at": now,
                    "expires_at": (datetime.now(timezone.utc) + timedelta(days=14)).date().isoformat(),
                },
            ],
            "notifications": [
                {
                    "id": str(uuid4()),
                    "user_id": student_id,
                    "message": "Clearance document submission ends next Wednesday.",
                    "type": "reminder",
                    "date": (datetime.now(timezone.utc) + timedelta(days=3)).date().isoformat(),
                    "is_read": False,
                }
            ],
            "faqs": [
                {
                    "id": str(uuid4()),
                    "question": "How do I register my courses?",
                    "answer": "Visit the department portal desk with your cleared fees receipt, review your level courses, and submit registration before Friday 5 PM.",
                    "category": "registration",
                    "language": "en",
                    "updated_at": now,
                },
                {
                    "id": str(uuid4()),
                    "question": "How I fit do my course registration?",
                    "answer": "Go the department portal desk with your school fees receipt, check your level courses well, then submit am before Friday 5 PM.",
                    "category": "registration",
                    "language": "pidgin",
                    "updated_at": now,
                },
                {
                    "id": str(uuid4()),
                    "question": "Where can I pay school fees?",
                    "answer": "School fees are confirmed through the bursary payment channel on the Veritas portal and validated at the bursary office.",
                    "category": "fees",
                    "language": "en",
                    "updated_at": now,
                },
            ],
            "resources": [
                {
                    "id": str(uuid4()),
                    "title": "CSC 301 Past Questions",
                    "file_url": "https://example.com/resources/csc301-past-questions.pdf",
                    "type": "past_question",
                    "description": "Practice questions for 300-level computer science students.",
                    "created_at": now,
                }
            ],
            "contacts": [
                {
                    "id": str(uuid4()),
                    "name": "Mrs. Grace Okeke",
                    "role": "Student Affairs Officer",
                    "email": "studentaffairs@veritas.edu.ng",
                    "phone": "+234-800-000-1000",
                    "office_location": "Student Affairs Block",
                },
                {
                    "id": str(uuid4()),
                    "name": "ICT Help Desk",
                    "role": "Support",
                    "email": "ictsupport@veritas.edu.ng",
                    "phone": "+234-800-000-2000",
                    "office_location": "ICT Centre",
                },
            ],
            "rules": [
                {
                    "id": str(uuid4()),
                    "title": "ID cards must be visible",
                    "content": "Students are expected to wear valid school identification while on campus.",
                    "category": "conduct",
                    "updated_at": now,
                }
            ],
            "reminders": [
                {
                    "id": str(uuid4()),
                    "title": "Clearance deadline",
                    "message": "Submit all clearance documents before next Wednesday.",
                    "target_role": "student",
                    "due_date": (datetime.now(timezone.utc) + timedelta(days=3)).date().isoformat(),
                    "created_by": admin_id,
                }
            ],
            "school_calendar": [
                {
                    "id": str(uuid4()),
                    "title": "Course Registration Window",
                    "description": "Department registration support remains open through the week.",
                    "event_type": "registration",
                    "start_date": (datetime.now(timezone.utc) + timedelta(days=1)).date().isoformat(),
                    "end_date": (datetime.now(timezone.utc) + timedelta(days=5)).date().isoformat(),
                    "target_department": "",
                    "target_level": "",
                    "created_by": admin_id,
                    "created_at": now,
                },
                {
                    "id": str(uuid4()),
                    "title": "300 Level Project Briefing",
                    "description": "Compulsory briefing for 300-level Computer Science students.",
                    "event_type": "event",
                    "start_date": (datetime.now(timezone.utc) + timedelta(days=4)).date().isoformat(),
                    "end_date": (datetime.now(timezone.utc) + timedelta(days=4)).date().isoformat(),
                    "target_department": "Computer Science",
                    "target_level": "300",
                    "created_by": admin_id,
                    "created_at": now,
                },
                {
                    "id": str(uuid4()),
                    "title": "First Semester Exams",
                    "description": "Main examination week begins.",
                    "event_type": "exam",
                    "start_date": (datetime.now(timezone.utc) + timedelta(days=12)).date().isoformat(),
                    "end_date": (datetime.now(timezone.utc) + timedelta(days=18)).date().isoformat(),
                    "target_department": "",
                    "target_level": "",
                    "created_by": admin_id,
                    "created_at": now,
                },
            ],
        }

    def _strip_password(self, user):
        clean = deepcopy(user)
        clean.pop("password", None)
        return clean

    def _memory_auth_disabled(self):
        return {
            "ok": False,
            "message": "Supabase auth is not configured. Add your real Supabase keys in .env and restart the app.",
        }

    def is_profile_complete(self, user):
        if not user:
            return False
        if user.get("role") != "student":
            return True
        required_fields = ("phone", "department", "level")
        return all(str(user.get(field, "")).strip() for field in required_fields)

    def authenticate_user(self, email, password):
        if self.mode == "supabase":
            try:
                auth_response = self.client.auth.sign_in_with_password({"email": email, "password": password})
                session_data = getattr(auth_response, "session", None)
                user_data = getattr(auth_response, "user", None) or getattr(session_data, "user", None)
                access_token = getattr(session_data, "access_token", None)
                if not user_data or not access_token:
                    return {"ok": False, "message": "Authentication succeeded but no user session was returned."}
                scoped_client = self._query_client(access_token=access_token)
                records = scoped_client.table("users").select("*").eq("id", user_data.id).limit(1).execute().data
                if not records:
                    ensured = self._ensure_supabase_profile(
                        user_id=user_data.id,
                        email=getattr(user_data, "email", email),
                        name=(getattr(user_data, "user_metadata", {}) or {}).get("name", ""),
                        preferred_language=(getattr(user_data, "user_metadata", {}) or {}).get("preferred_language", "en"),
                    )
                    if not ensured:
                        return {"ok": False, "message": "No matching profile was found."}
                    records = [ensured]
                return {"ok": True, "user": records[0], "access_token": access_token, "session": session_data}
            except Exception as exc:  # pragma: no cover - network-dependent
                return {"ok": False, "message": f"Authentication failed: {exc}"}

        if not self.allow_demo_auth:
            return self._memory_auth_disabled()

        for user in self.memory["users"]:
            if user["email"] == email and user["password"] == password:
                return {"ok": True, "user": self._strip_password(user)}
        return {"ok": False, "message": "Invalid email or password."}

    def register_user(self, payload):
        if not payload["name"] or not payload["email"] or not payload["password"]:
            return {"ok": False, "message": "Name, email, and password are required."}

        if self.mode == "supabase":
            try:
                auth_response = self.client.auth.sign_up(
                    {
                        "email": payload["email"],
                        "password": payload["password"],
                        "options": {
                            "data": {
                                "name": payload["name"],
                                "preferred_language": payload["preferred_language"],
                            }
                        },
                    }
                )
                session_data = getattr(auth_response, "session", None)
                user_data = getattr(auth_response, "user", None)

                if not session_data or not getattr(session_data, "access_token", None):
                    if user_data and getattr(user_data, "id", None):
                        self._ensure_supabase_profile(
                            user_id=user_data.id,
                            email=payload["email"],
                            name=payload["name"],
                            preferred_language=payload["preferred_language"],
                        )
                    return {
                        "ok": True,
                        "requires_verification": True,
                        "message": "Account created. Please confirm your email, then sign in.",
                    }

                access_token = session_data.access_token
                ensured = self._ensure_supabase_profile(
                    user_id=user_data.id,
                    email=payload["email"],
                    name=payload["name"],
                    preferred_language=payload["preferred_language"],
                )
                if ensured:
                    return {
                        "ok": True,
                        "user": ensured,
                        "access_token": access_token,
                        "requires_login": True,
                        "message": "Account created successfully. Please log in with your new account.",
                    }
                return {
                    "ok": True,
                    "user": {
                        "id": user_data.id,
                        "name": payload["name"],
                        "email": payload["email"],
                    "role": "student",
                    "preferred_language": payload["preferred_language"],
                    "phone": "",
                    "department": "",
                    "faculty": "",
                    "level": "",
                    "student_number": "",
                    "created_at": utc_now(),
                },
                "access_token": access_token,
                "requires_login": True,
                    "message": "Account created successfully. Please log in with your new account.",
                }
            except Exception as exc:  # pragma: no cover
                return {"ok": False, "message": f"Sign-up failed: {exc}"}

        if not self.allow_demo_auth:
            return self._memory_auth_disabled()

        if any(user["email"] == payload["email"] for user in self.memory["users"]):
            return {"ok": False, "message": "This email is already registered."}

        user = {
            "id": str(uuid4()),
            "name": payload["name"],
            "email": payload["email"],
            "password": payload["password"],
            "role": "student",
            "preferred_language": payload["preferred_language"],
            "phone": "",
            "department": "",
            "faculty": "",
            "level": "",
            "student_number": "",
            "created_at": utc_now(),
        }
        self.memory["users"].append(user)
        return {"ok": True, "user": self._strip_password(user)}

    def update_profile(self, user_id, payload, access_token=None):
        allowed_fields = {"name", "preferred_language", "phone", "department", "faculty", "level", "student_number"}
        clean_payload = {key: value.strip() for key, value in payload.items() if key in allowed_fields and isinstance(value, str)}
        if self.mode == "supabase":
            try:
                clean_payload["updated_at"] = utc_now()
                query_client = self._query_client(access_token=access_token)
                query_client.table("users").update(clean_payload).eq("id", user_id).execute()
                records = query_client.table("users").select("*").eq("id", user_id).limit(1).execute().data
                return {"ok": True, "user": records[0]} if records else {"ok": False, "message": "Profile update succeeded but no record was returned."}
            except Exception as exc:
                if self._is_expired_jwt_error(exc):
                    try:
                        service_client = self._query_client(use_service_role=True)
                        if not service_client:
                            return {"ok": False, "message": "Your session expired and the server could not refresh profile access. Please sign in again."}
                        service_client.table("users").update(clean_payload).eq("id", user_id).execute()
                        records = service_client.table("users").select("*").eq("id", user_id).limit(1).execute().data
                        return {"ok": True, "user": records[0]} if records else {"ok": False, "message": "Profile update succeeded but no record was returned."}
                    except Exception as retry_exc:
                        return {"ok": False, "message": f"Could not update profile after session expiry: {retry_exc}"}
                message = str(exc)
                if "column" in message.lower() and any(field in message.lower() for field in ("phone", "department", "faculty", "level", "student_number")):
                    return {
                        "ok": False,
                        "message": "Your Supabase users table is missing the new profile fields. Run the latest schema update, then try saving again.",
                    }
                return {"ok": False, "message": f"Could not update profile: {message}"}

        for user in self.memory["users"]:
            if user["id"] == user_id:
                user.update(clean_payload)
                return {"ok": True, "user": self._strip_password(user)}
        return {"ok": False, "message": "User profile not found."}

    def send_password_reset(self, email):
        email = (email or "").strip().lower()
        if not email:
            return {"ok": False, "message": "Email is required."}

        if self.mode == "supabase":
            try:
                self.client.auth.reset_password_email(email)
                return {"ok": True, "message": "Password reset link sent. Please check your email."}
            except Exception as exc:  # pragma: no cover - network-dependent
                return {"ok": False, "message": f"Could not send reset email: {exc}"}

        if not self.allow_demo_auth:
            return self._memory_auth_disabled()

        user_exists = any(user["email"] == email for user in self.memory["users"])
        if not user_exists:
            return {"ok": False, "message": "No account was found for that email."}

        return {
            "ok": True,
            "message": "Password reset email is available only when Supabase auth is configured.",
        }

    def get_dashboard_data(self, user, access_token=None):
        return {
            "announcements": self.list_announcements(access_token=access_token),
            "notifications": self.list_notifications(user["id"], access_token=access_token),
            "resources": self.list_resources(access_token=access_token)[:3],
            "recent_chats": self.list_chats(user["id"], access_token=access_token)[-5:][::-1],
            "calendar_events": self.list_calendar_events(user=user, access_token=access_token)[:4],
        }

    def _table_select(self, table, order_field=None, desc=False, access_token=None, use_service_role=False):
        query_client = self._query_client(access_token=access_token, use_service_role=use_service_role)
        query = query_client.table(table).select("*")
        if order_field:
            query = query.order(order_field, desc=desc)
        return query.execute().data

    def list_announcements(self, access_token=None):
        if self.mode == "supabase":
            try:
                return self._table_select("announcements", "created_at", desc=True, access_token=access_token)
            except Exception:
                return []
        return deepcopy(sorted(self.memory["announcements"], key=lambda item: item["created_at"], reverse=True))

    def list_notifications(self, user_id, access_token=None):
        if self.mode == "supabase":
            try:
                return (
                    self._query_client(access_token=access_token)
                    .table("notifications")
                    .select("*")
                    .eq("user_id", user_id)
                    .order("date", desc=False)
                    .execute()
                    .data
                )
            except Exception as exc:
                if self._is_expired_jwt_error(exc):
                    try:
                        return (
                            self._query_client(use_service_role=True)
                            .table("notifications")
                            .select("*")
                            .eq("user_id", user_id)
                            .order("date", desc=False)
                            .execute()
                            .data
                        )
                    except Exception:
                        return []
                return []
        items = [item for item in self.memory["notifications"] if item["user_id"] == user_id]
        return deepcopy(sorted(items, key=lambda item: item["date"]))

    def list_resources(self, access_token=None):
        if self.mode == "supabase":
            try:
                return self._table_select("resources", "created_at", desc=True, access_token=access_token)
            except Exception as exc:
                if self._is_expired_jwt_error(exc):
                    try:
                        return self._table_select("resources", "created_at", desc=True, use_service_role=True)
                    except Exception:
                        return []
                return []
        return deepcopy(sorted(self.memory["resources"], key=lambda item: item["created_at"], reverse=True))

    def list_chats(self, user_id, access_token=None):
        if self.mode == "supabase":
            try:
                return (
                    self._query_client(access_token=access_token)
                    .table("chats")
                    .select("*")
                    .eq("user_id", user_id)
                    .order("created_at", desc=False)
                    .execute()
                    .data
                )
            except Exception as exc:
                if self._is_expired_jwt_error(exc):
                    try:
                        return (
                            self._query_client(use_service_role=True)
                            .table("chats")
                            .select("*")
                            .eq("user_id", user_id)
                            .order("created_at", desc=False)
                            .execute()
                            .data
                        )
                    except Exception:
                        return []
                return []
        return deepcopy([item for item in self.memory["chats"] if item["user_id"] == user_id])

    def list_calendar_events(self, user=None, access_token=None):
        events = deepcopy(self.memory.get("school_calendar", []))
        if self.mode == "supabase":
            try:
                events = self._table_select("school_calendar", "start_date", desc=False, access_token=access_token)
            except Exception as exc:
                if self._is_expired_jwt_error(exc):
                    try:
                        events = self._table_select("school_calendar", "start_date", desc=False, use_service_role=True)
                    except Exception:
                        events = []
                else:
                    events = []

        department = (user or {}).get("department", "")
        level = str((user or {}).get("level", "")).strip()
        filtered = []
        for event in events:
            target_department = str(event.get("target_department", "")).strip()
            target_level = str(event.get("target_level", "")).strip()
            if target_department and target_department.lower() != department.lower():
                continue
            if target_level and target_level.lower() != level.lower():
                continue
            filtered.append(event)
        return filtered

    def save_chat(self, user_id, message, response, source, access_token=None):
        record = {
            "id": str(uuid4()),
            "user_id": user_id,
            "message": message,
            "response": response,
            "source": source,
            "created_at": utc_now(),
        }
        if self.mode == "supabase":
            try:
                self._query_client(access_token=access_token).table("chats").insert(record).execute()
                return record
            except Exception:
                return record
        self.memory["chats"].append(record)
        return deepcopy(record)

    def search_knowledge(self, query, language="en", access_token=None):
        query = query.lower().strip()
        matches = []
        faqs = deepcopy(self.memory["faqs"])
        contacts = deepcopy(self.memory["contacts"])
        announcements = deepcopy(self.memory["announcements"])
        rules = deepcopy(self.memory["rules"])

        if self.mode == "supabase":
            try:
                query_client = self._query_client(access_token=access_token)
                faqs = query_client.table("faqs").select("*").eq("language", language).execute().data
                contacts = self._table_select("contacts", access_token=access_token)
                announcements = self._table_select("announcements", "created_at", desc=True, access_token=access_token)
                rules = self._table_select("rules", "updated_at", desc=True, access_token=access_token)
            except Exception:
                pass

        def score(text):
            text = text.lower()
            tokens = [token for token in query.split() if len(token) > 2]
            return sum(1 for token in tokens if token in text)

        for faq in faqs:
            faq_score = max(score(faq["question"]), score(faq["answer"]))
            if faq["language"] == language and faq_score > 0:
                matches.append(
                    {
                        "score": faq_score + 2,
                        "source": "faq",
                        "title": faq["question"],
                        "content": faq["answer"],
                    }
                )

        for contact in contacts:
            combined = " ".join([contact["name"], contact["role"], contact["email"], contact["office_location"]])
            contact_score = score(combined)
            if contact_score > 0:
                matches.append(
                    {
                        "score": contact_score + 1,
                        "source": "contact",
                        "title": contact["name"],
                        "content": f"{contact['role']}. Email: {contact['email']}. Phone: {contact['phone']}. Office: {contact['office_location']}.",
                    }
                )

        for announcement in announcements:
            combined = f"{announcement['title']} {announcement['content']}"
            announcement_score = score(combined)
            if announcement_score > 0:
                matches.append(
                    {
                        "score": announcement_score,
                        "source": "announcement",
                        "title": announcement["title"],
                        "content": announcement["content"],
                    }
                )

        for rule in rules:
            combined = f"{rule['title']} {rule['content']}"
            rule_score = score(combined)
            if rule_score > 0:
                matches.append(
                    {
                        "score": rule_score,
                        "source": "rule",
                        "title": rule["title"],
                        "content": rule["content"],
                    }
                )

        matches.sort(key=lambda item: item["score"], reverse=True)
        return matches

    def add_record(self, table, payload, access_token=None):
        record = {"id": str(uuid4()), **payload}
        timestamp_fields = {
            "faqs": "updated_at",
            "announcements": "created_at",
            "resources": "created_at",
            "rules": "updated_at",
            "school_calendar": "created_at",
        }
        if table in timestamp_fields:
            record[timestamp_fields[table]] = utc_now()

        if self.mode == "supabase":
            try:
                self._query_client(access_token=access_token).table(table).insert(record).execute()
                return record
            except Exception as exc:
                raise RuntimeError(str(exc)) from exc

        self.memory[table].append(record)
        if table == "reminders":
            for user in self.memory["users"]:
                if payload["target_role"] == "all" or user["role"] == payload["target_role"]:
                    self.memory["notifications"].append(
                        {
                            "id": str(uuid4()),
                            "user_id": user["id"],
                            "message": payload["message"],
                            "type": "reminder",
                            "date": payload["due_date"],
                            "is_read": False,
                        }
                    )
        return deepcopy(record)

    def get_admin_data(self, access_token=None):
        if self.mode == "supabase":
            try:
                return {
                    "announcements": self.list_announcements(access_token=access_token),
                    "resources": self.list_resources(access_token=access_token),
                    "school_calendar": self._table_select("school_calendar", "start_date", desc=False, access_token=access_token),
                    "faqs": self._table_select("faqs", "updated_at", desc=True, access_token=access_token),
                    "contacts": self._table_select("contacts", access_token=access_token),
                    "rules": self._table_select("rules", "updated_at", desc=True, access_token=access_token),
                    "reminders": self._table_select("reminders", "due_date", access_token=access_token),
                }
            except Exception:
                pass
        return {
            "announcements": self.list_announcements(),
            "resources": self.list_resources(),
            "school_calendar": deepcopy(self.memory["school_calendar"]),
            "faqs": deepcopy(self.memory["faqs"]),
            "contacts": deepcopy(self.memory["contacts"]),
            "rules": deepcopy(self.memory["rules"]),
            "reminders": deepcopy(self.memory["reminders"]),
        }
