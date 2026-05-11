from datetime import date, datetime, timedelta, timezone

from flask import Blueprint, current_app, jsonify, request

from api.audit import write_audit_log
from api.auth.middleware import require_auth
from api.services.documents import extract_text
from api.services.embeddings import EmbeddingService

admin_bp = Blueprint("admin", __name__)
CALENDAR_EVENT_TYPES = {"exam", "registration", "holiday", "fee", "event", "deadline"}
MONTH_PATTERN = "jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december"


def _as_list(value):
    if value in (None, "", "all"):
        return "all"
    if isinstance(value, list):
        if not value:
            return "all"
        if "all" in [str(item).lower() for item in value]:
            return "all"
        return value
    return [value]


def _target_array_for_db(value):
    normalized = _as_list(value)
    return [] if normalized == "all" else normalized


def _level_array_for_db(value):
    normalized = _as_list(value)
    if normalized == "all":
        return []
    levels = []
    for item in normalized:
        if str(item).strip().isdigit():
            levels.append(int(item))
    return levels


def _validate_lecturer_scope(payload, user):
    if user.get("role") != "lecturer":
        return None

    department = user.get("department")
    level = user.get("level")
    target_departments = _as_list(payload.get("target_departments"))
    target_levels = _as_list(payload.get("target_levels"))

    if not department or not level:
        return "Lecturer account must have department and assigned level before posting."
    if target_departments == "all" or department not in target_departments:
        return "Lecturers can only post to their assigned department."
    try:
        target_level_numbers = [int(item) for item in target_levels] if target_levels != "all" else []
    except (TypeError, ValueError):
        return "Target levels must be valid level numbers."
    if target_levels == "all" or int(level) not in target_level_numbers:
        return "Lecturers can only post to their assigned level."
    return None


def _is_university_wide(payload):
    return _as_list(payload.get("target_departments")) == "all" and _as_list(payload.get("target_levels")) == "all"


def _count_rows(table_name, query_builder=None):
    try:
        query = request.supabase.table(table_name).select("id", count="exact")
        if query_builder:
            query = query_builder(query)
        response = query.execute()
        return response.count or 0
    except Exception:
        return 0


def _safe_rows(table_name, select="*", query_builder=None):
    try:
        query = request.supabase.table(table_name).select(select)
        if query_builder:
            query = query_builder(query)
        return query.execute().data or []
    except Exception:
        return []


def _matches_target(user, target_departments, target_levels):
    departments = _as_list(target_departments)
    levels = _as_list(target_levels)
    department_ok = departments == "all" or user.get("department") in departments
    level_ok = levels == "all" or user.get("level") in levels or str(user.get("level")) in [str(item) for item in levels]
    return department_ok and level_ok


def _notify_targeted_students(announcement):
    students = _safe_rows("users", "id,department,level", lambda query: query.eq("role", "student"))
    notifications = [
        {
            "user_id": student["id"],
            "title": announcement.get("title") or "New announcement",
            "message": announcement.get("content") or "A new announcement was posted.",
            "type": "announcement",
            "date": date.today().isoformat(),
            "link": "/announcements",
            "related_table": "announcements",
            "related_id": announcement.get("id"),
        }
        for student in students
        if _matches_target(student, announcement.get("target_departments"), announcement.get("target_levels"))
    ]
    if notifications:
        try:
            request.supabase.table("notifications").insert(notifications).execute()
        except Exception:
            fallback = [
                {key: value for key, value in notification.items() if key not in {"related_table", "related_id"}}
                for notification in notifications
            ]
            request.supabase.table("notifications").insert(fallback).execute()


def _notify_announcement_changed(announcement, title, message):
    students = _safe_rows("users", "id,department,level", lambda query: query.eq("role", "student"))
    rows = [
        {
            "user_id": student["id"],
            "title": title,
            "message": message,
            "type": "announcement",
            "date": date.today().isoformat(),
            "link": "/announcements",
            "related_table": "announcements",
            "related_id": announcement.get("id"),
        }
        for student in students
        if _matches_target(student, announcement.get("target_departments"), announcement.get("target_levels"))
    ]
    if rows:
        try:
            request.supabase.table("notifications").insert(rows).execute()
        except Exception:
            request.supabase.table("notifications").insert(
                [{key: value for key, value in row.items() if key not in {"related_table", "related_id"}} for row in rows]
            ).execute()


def _notify_deans(title, message, link="/admin/system-logs"):
    deans = _safe_rows("users", "id", lambda query: query.eq("role", "dean"))
    rows = [
        {
            "user_id": dean["id"],
            "title": title,
            "message": message,
            "type": "system",
            "date": date.today().isoformat(),
            "link": link,
        }
        for dean in deans
        if dean.get("id")
    ]
    if rows:
        request.supabase.table("notifications").insert(rows).execute()


def _announcement_state(record):
    status = record.get("status")
    if status:
        return status
    expires_at = record.get("expires_at")
    publish_at = record.get("publish_at")
    today = date.today().isoformat()
    if expires_at and str(expires_at) < today:
        return "expired"
    if publish_at and str(publish_at) > today:
        return "scheduled"
    return "published"


def _lock_lecturer_target(payload, user):
    if user.get("role") == "lecturer":
        payload["target_departments"] = [user.get("department")]
        payload["target_levels"] = [int(user.get("level"))] if user.get("level") else []
        payload["department"] = user.get("department")
        payload["level"] = user.get("level")
    return payload


def _lecturer_owns(record, user):
    return user.get("role") == "lecturer" and record.get("created_by") == user.get("id")


@admin_bp.get("/api/admin/overview")
@require_auth(["admin", "lecturer", "dean"])
def admin_overview():
    user = request.current_user
    is_lecturer = user.get("role") == "lecturer"
    department = user.get("department")
    level = user.get("level")

    def scope_escalations(query):
        if is_lecturer:
            return query.eq("user_department", department).eq("user_level", level)
        return query

    def staff_scope(query):
        if is_lecturer:
            return query.eq("role", "lecturer").eq("department", department)
        return query.in_("role", ["admin", "lecturer", "dean"])

    staff = _safe_rows(
        "users",
        "id,name,email,role,department,level,is_profile_complete",
        lambda query: staff_scope(query).limit(8),
    )
    escalations = _safe_rows(
        "escalations",
        "id,question,status,user_department,user_level,created_at",
        lambda query: scope_escalations(query).order("created_at", desc=True).limit(8),
    )
    announcements = _safe_rows(
        "announcements",
        "id,title,content,created_at,target_departments,target_levels",
        lambda query: query.order("created_at", desc=True).limit(8),
    )
    calendar = _safe_rows(
        "school_calendar",
        "id,title,description,start_date,event_type",
        lambda query: query.order("start_date", desc=False).limit(5),
    )

    if is_lecturer:
        announcements = [
            item
            for item in announcements
            if _matches_target({"department": department, "level": level}, item.get("target_departments"), item.get("target_levels"))
        ]

    lecturer_details = None
    if is_lecturer:
        cohort_students = _safe_rows(
            "users",
            "id,last_sign_in_at",
            lambda query: query.eq("role", "student").eq("department", department).eq("level", level),
        )
        active_cutoff = datetime.now(timezone.utc) - timedelta(days=30)

        def parse_time(value):
            if not value:
                return None
            try:
                parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
                return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
            except Exception:
                return None

        active_students = sum(1 for student in cohort_students if (parse_time(student.get("last_sign_in_at")) or datetime.min.replace(tzinfo=timezone.utc)) >= active_cutoff)
        cohort_user_ids = [student.get("id") for student in cohort_students if student.get("id")]
        unread_announcements = 0
        if cohort_user_ids:
            unread_announcements = _count_rows(
                "notifications",
                lambda query: query.in_("user_id", cohort_user_ids).eq("type", "announcement").eq("is_read", False),
            )

        own_announcements = _safe_rows(
            "announcements",
            "id,title,status,created_at,target_departments,target_levels",
            lambda query: query.eq("created_by", user["id"]).order("created_at", desc=True).limit(10),
        )
        for announcement in own_announcements:
            announcement["delivery_count"] = sum(
                1
                for student in cohort_students
                if _matches_target(student, announcement.get("target_departments"), announcement.get("target_levels"))
            )

        own_calendar = _safe_rows(
            "school_calendar",
            "id,title,event_type,start_date,end_date",
            lambda query: query.eq("created_by", user["id"]).order("start_date", desc=False).limit(10),
        )
        own_kb = _safe_rows(
            "knowledge_base",
            "id,content,category,source,created_at",
            lambda query: query.eq("created_by", user["id"]).order("created_at", desc=True).limit(10),
        )
        department_announcements = [
            item for item in _safe_rows(
                "announcements",
                "*",
                lambda query: query.order("created_at", desc=True).limit(100),
            )
            if (item.get("status") in (None, "published"))
            and _matches_target({"department": department, "level": level}, item.get("target_departments"), item.get("target_levels"))
        ][:10]
        department_calendar = [
            item for item in _safe_rows(
                "school_calendar",
                "id,title,description,event_type,start_date,end_date,target_departments,target_levels",
                lambda query: query.order("start_date", desc=False).limit(100),
            )
            if _matches_target({"department": department, "level": level}, item.get("target_departments"), item.get("target_levels"))
        ][:10]
        department_resources = _safe_rows(
            "resources",
            "id,title,type,description,department,level,created_at",
            lambda query: query.eq("department", department).limit(20),
        )
        department_resources = [
            item for item in department_resources
            if not item.get("level") or int(item.get("level") or 0) == int(level or 0)
        ][:10]
        department_faqs = [
            item for item in _safe_rows("faqs", "id,question,answer,category,language", lambda query: query.limit(100))
            if (department or "").lower() in (item.get("category") or "").lower()
            or (item.get("category") or "").lower() in {"general", "student", "school"}
        ][:10]
        department_kb = _safe_rows(
            "knowledge_base",
            "id,content,category,source,department,created_at",
            lambda query: query.eq("department", department).limit(20),
        )[:10]

        assigned_escalations = _safe_rows(
            "escalations",
            "id,question,status,created_at,resolved_at,assigned_to,user_department,user_level",
            lambda query: query.eq("assigned_to", user["id"]).order("created_at", desc=True).limit(50),
        )
        cohort_escalations = _safe_rows(
            "escalations",
            "id,question,status,created_at,resolved_at,assigned_to,user_department,user_level",
            lambda query: query.eq("user_department", department).eq("user_level", level).order("created_at", desc=True).limit(100),
        )
        pending_count = sum(1 for item in cohort_escalations if item.get("status") != "resolved")
        resolved_by_me = [item for item in assigned_escalations if item.get("status") == "resolved"]
        response_hours = []
        for item in resolved_by_me:
            created_at = parse_time(item.get("created_at"))
            resolved_at = parse_time(item.get("resolved_at"))
            if created_at and resolved_at:
                response_hours.append(max(0, (resolved_at - created_at).total_seconds() / 3600))

        topic_counts = {}
        stop_words = {"the", "and", "for", "with", "about", "what", "when", "where", "how", "why", "is", "are", "can", "could", "please"}
        for item in cohort_escalations:
            words = [
                word.strip(".,?!:;\"'()[]").lower()
                for word in (item.get("question") or "").split()
            ]
            keywords = [word for word in words if len(word) > 3 and word not in stop_words][:3]
            topic = " ".join(keywords).title() if keywords else "General"
            topic_counts[topic] = topic_counts.get(topic, 0) + 1
        common_topics = [{"topic": topic, "count": count} for topic, count in sorted(topic_counts.items(), key=lambda item: item[1], reverse=True)[:6]]

        lecturer_details = {
            "profile": {
                "name": user.get("name"),
                "email": user.get("email"),
                "department": department,
                "level": level,
            },
            "own_announcements": own_announcements,
            "own_calendar": own_calendar,
            "own_knowledge_base": own_kb,
            "assigned_escalations": assigned_escalations[:10],
            "cohort": {
                "total_students": len(cohort_students),
                "active_students": active_students,
                "unread_announcements": unread_announcements,
                "pending_escalations": pending_count,
                "resolved_by_me": len(resolved_by_me),
                "average_response_hours": round(sum(response_hours) / len(response_hours), 1) if response_hours else 0,
                "common_topics": common_topics,
            },
            "school_content": {
                "announcements": department_announcements,
                "calendar": department_calendar,
                "resources": department_resources,
                "faqs": department_faqs,
                "knowledge_base": department_kb,
            },
        }

    counts = {
        "users": _count_rows("users"),
        "staff": _count_rows("users", lambda query: query.in_("role", ["admin", "lecturer", "dean"])),
        "students": _count_rows("users", lambda query: query.eq("role", "student")),
        "announcements": _count_rows("announcements"),
        "escalations": _count_rows("escalations", scope_escalations),
        "kb": _count_rows("knowledge_base"),
        "calendar": _count_rows("school_calendar"),
        "resources": _count_rows("resources"),
        "map": _count_rows("campus_map"),
    }

    return jsonify(
        {
            "counts": counts,
            "staff": [item for item in staff if item.get("id") != user.get("id")],
            "escalations": escalations,
            "announcements": announcements[:3],
            "calendar": calendar,
            "lecturer_details": lecturer_details,
        }
    )


@admin_bp.get("/api/admin/users")
@require_auth(["admin", "dean"])
def list_users():
    users = _safe_rows("users", "*", lambda query: query.order("created_at", desc=True).limit(200))
    document_rows = _safe_rows("documents", "user_id")
    chat_rows = _safe_rows("chats", "user_id")
    document_counts = {}
    chat_counts = {}
    for row in document_rows:
        user_id = row.get("user_id")
        if user_id:
            document_counts[user_id] = document_counts.get(user_id, 0) + 1
    for row in chat_rows:
        user_id = row.get("user_id")
        if user_id:
            chat_counts[user_id] = chat_counts.get(user_id, 0) + 1

    records = []
    for user in users:
        if user.get("is_deleted"):
            continue
        user_id = user.get("id")
        records.append(
            {
                "id": user_id,
                "name": user.get("name"),
                "email": user.get("email"),
                "role": user.get("role"),
                "department": user.get("department"),
                "level": user.get("level"),
                "matric_number": user.get("matric_number"),
                "phone": user.get("phone"),
                "is_profile_complete": user.get("is_profile_complete"),
                "created_at": user.get("created_at"),
                "updated_at": user.get("updated_at"),
                "last_sign_in_at": user.get("last_sign_in_at"),
                "notification_preferences": user.get("notification_preferences") or {},
                "document_count": document_counts.get(user_id, 0),
                "chat_session_count": chat_counts.get(user_id, 0),
            }
        )
    return jsonify({"data": records, "total": len(records)})


@admin_bp.post("/api/admin/users")
@require_auth(["admin", "dean"])
def create_staff_user():
    payload = request.get_json(silent=True) or {}
    role = (payload.get("role") or "lecturer").strip()
    current_role = request.current_user.get("role")
    if current_role == "admin" and role != "lecturer":
        return jsonify({"error": "Admins can create lecturer accounts only. Admin accounts are created by the dean."}), 403
    if role in {"admin", "dean"} and current_role != "dean":
        return jsonify({"error": "Only the dean can create admin or dean accounts."}), 403
    if role not in {"lecturer", "admin", "dean"}:
        return jsonify({"error": "Admins can create lecturer/admin accounts only. Students self-register."}), 400

    email = (payload.get("email") or "").strip()
    name = (payload.get("name") or "").strip()
    password = (payload.get("password") or "").strip()
    if not email or not name or not password:
        return jsonify({"error": "Name, email, and temporary password are required."}), 400

    try:
        auth_response = request.supabase.auth.admin.create_user(
            {
                "email": email,
                "password": password,
                "email_confirm": True,
                "user_metadata": {"name": name, "role": role},
            }
        )
        auth_user = auth_response.user
        user_id = auth_user.id
    except Exception as exc:
        return jsonify({"error": f"Could not create auth user: {exc}"}), 400

    record = {
        "id": user_id,
        "name": name,
        "email": email,
        "role": role,
        "department": payload.get("department") or None,
        "level": payload.get("level") or None,
        "is_profile_complete": True,
    }
    inserted = request.supabase.table("users").insert(record).execute().data
    created = inserted[0] if inserted else record
    write_audit_log(request.supabase, request.current_user, "user.create", "users", created.get("id"), after=created)
    if role == "admin" and request.current_user.get("role") == "admin":
        _notify_deans(
            "Admin account created",
            f"{request.current_user.get('name') or 'An admin'} created admin account {email}.",
            "/admin/users",
        )
    return jsonify(created), 201


@admin_bp.patch("/api/admin/users/<user_id>")
@require_auth(["admin", "dean"])
def update_user(user_id):
    payload = request.get_json(silent=True) or {}
    existing = _safe_rows("users", "*", lambda query: query.eq("id", user_id).limit(1))
    if not existing:
        return jsonify({"error": "User not found."}), 404
    target = existing[0]
    if request.current_user.get("role") == "admin" and target.get("role") == "dean":
        return jsonify({"error": "Admins cannot modify the dean account."}), 403
    if request.current_user.get("role") == "admin" and payload.get("role") in {"admin", "dean"}:
        return jsonify({"error": "Only the dean can assign admin or dean privileges."}), 403
    allowed = {"name", "email", "role", "department", "level", "matric_number", "phone", "is_profile_complete"}
    updates = {key: value for key, value in payload.items() if key in allowed}
    updated = request.supabase.table("users").update(updates).eq("id", user_id).execute().data
    record = updated[0] if updated else {}
    write_audit_log(request.supabase, request.current_user, "user.update", "users", user_id, before=target, after=record)
    return jsonify(record)


@admin_bp.delete("/api/admin/users/<user_id>")
@require_auth(["admin", "dean"])
def soft_delete_user(user_id):
    existing = _safe_rows("users", "*", lambda query: query.eq("id", user_id).limit(1))
    if not existing:
        return jsonify({"error": "User not found."}), 404
    target = existing[0]
    if target.get("id") == request.current_user.get("id"):
        return jsonify({"error": "You cannot delete your own account here."}), 403
    if request.current_user.get("role") == "admin" and target.get("role") == "dean":
        return jsonify({"error": "Admins cannot delete dean accounts."}), 403
    updates = {"is_deleted": True, "deleted_at": date.today().isoformat(), "deleted_by": request.current_user.get("id")}
    try:
        updated = request.supabase.table("users").update(updates).eq("id", user_id).execute().data
    except Exception:
        return jsonify({"error": "Run supabase/admin_privileges_policies.sql to add soft-delete columns first."}), 400
    record = updated[0] if updated else {}
    write_audit_log(request.supabase, request.current_user, "user.soft_delete", "users", user_id, before=target, after=record)
    if target.get("role") == "admin" and request.current_user.get("role") == "admin":
        _notify_deans(
            "Admin account deleted",
            f"{request.current_user.get('name') or 'An admin'} soft-deleted admin account {target.get('email')}.",
            "/admin/system-logs",
        )
    return jsonify(record)


@admin_bp.get("/api/admin/analytics")
@require_auth(["admin", "dean"])
def admin_analytics():
    counts = {
        "users": _count_rows("users"),
        "students": _count_rows("users", lambda query: query.eq("role", "student")),
        "staff": _count_rows("users", lambda query: query.in_("role", ["admin", "lecturer", "dean"])),
        "announcements": _count_rows("announcements"),
        "escalations": _count_rows("escalations"),
        "pending_escalations": _count_rows("escalations", lambda query: query.neq("status", "resolved")),
        "knowledge_base": _count_rows("knowledge_base"),
        "calendar": _count_rows("school_calendar"),
        "resources": _count_rows("resources"),
        "campus_map": _count_rows("campus_map"),
    }
    users = _safe_rows("users", "role,department,level,created_at,last_sign_in_at,is_profile_complete")
    departments = {}
    levels = {}
    roles = {}
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)
    ninety_days_ago = now - timedelta(days=90)
    new_this_week = 0
    new_this_month = 0
    active_7_days = 0
    active_30_days = 0
    active_90_days = 0
    inactive_30_days = 0
    profile_complete = 0
    profile_incomplete = 0

    def parse_time(value):
        if not value:
            return None
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except Exception:
            return None

    for item in users:
        department = item.get("department") or "Unassigned"
        level = str(item.get("level") or "Unassigned")
        role = item.get("role") or "unknown"
        departments[department] = departments.get(department, 0) + 1
        levels[level] = levels.get(level, 0) + 1
        roles[role] = roles.get(role, 0) + 1

        created_at = parse_time(item.get("created_at"))
        last_sign_in_at = parse_time(item.get("last_sign_in_at"))
        if created_at and created_at >= week_ago:
            new_this_week += 1
        if created_at and created_at >= month_ago:
            new_this_month += 1
        if last_sign_in_at and last_sign_in_at >= week_ago:
            active_7_days += 1
        if last_sign_in_at and last_sign_in_at >= month_ago:
            active_30_days += 1
        if last_sign_in_at and last_sign_in_at >= ninety_days_ago:
            active_90_days += 1
        if not last_sign_in_at or last_sign_in_at < month_ago:
            inactive_30_days += 1
        if item.get("is_profile_complete"):
            profile_complete += 1
        else:
            profile_incomplete += 1

    total_users = len(users)
    user_analytics = {
        "total_registered": total_users,
        "new_registrations_week": new_this_week,
        "new_registrations_month": new_this_month,
        "profile_completion_rate": round((profile_complete / total_users) * 100, 1) if total_users else 0,
        "profile_complete": profile_complete,
        "profile_incomplete": profile_incomplete,
        "active_7_days": active_7_days,
        "active_30_days": active_30_days,
        "active_90_days": active_90_days,
        "inactive_30_days": inactive_30_days,
        "users_without_profile_complete": profile_incomplete,
    }
    escalations = _safe_rows("escalations", "id,status,user_department,user_level,created_at,resolved_at,assigned_to,question")
    announcements = _safe_rows("announcements", "*")
    announcement_notifications = _safe_rows("notifications", "title,message,type,is_read,link,related_table,related_id,created_at")
    announcement_role_breakdown = {}
    announcements_week = 0
    announcements_month = 0
    publish_durations = []
    expired_visible = []

    for item in announcements:
        role = item.get("created_by_role") or "unknown"
        announcement_role_breakdown[role] = announcement_role_breakdown.get(role, 0) + 1

        created_at = parse_time(item.get("created_at"))
        publish_at = parse_time(item.get("publish_at")) or created_at
        if created_at and created_at >= week_ago:
            announcements_week += 1
        if created_at and created_at >= month_ago:
            announcements_month += 1
        if created_at and publish_at:
            publish_durations.append(max(0, (publish_at - created_at).total_seconds() / 3600))

        if item.get("expires_at") and str(item.get("expires_at")) < date.today().isoformat() and item.get("status") != "expired":
            expired_visible.append(
                {
                    "id": item.get("id"),
                    "title": item.get("title"),
                    "expires_at": item.get("expires_at"),
                    "status": item.get("status") or "published",
                }
            )

    notification_groups = {}
    for notification in announcement_notifications:
        if notification.get("type") != "announcement":
            continue
        key = notification.get("related_id") or notification.get("title") or "Announcement"
        group = notification_groups.setdefault(
            key,
            {"announcement": notification.get("title") or "Announcement", "sent": 0, "read": 0, "open_rate": 0},
        )
        group["sent"] += 1
        if notification.get("is_read"):
            group["read"] += 1

    open_rates = []
    for group in notification_groups.values():
        group["open_rate"] = round((group["read"] / group["sent"]) * 100, 1) if group["sent"] else 0
        open_rates.append(group)
    open_rates.sort(key=lambda item: item["open_rate"], reverse=True)

    content_analytics = {
        "announcements_this_week": announcements_week,
        "announcements_this_month": announcements_month,
        "announcements_all_time": len(announcements),
        "announcement_role_breakdown": announcement_role_breakdown,
        "average_creation_to_publish_hours": round(sum(publish_durations) / len(publish_durations), 1) if publish_durations else 0,
        "highest_notification_open_rates": open_rates[:5],
        "expired_announcements_visible": expired_visible,
        "expired_visible_count": len(expired_visible),
    }
    chats = _safe_rows("chats", "message,source,confidence_score,created_at")
    knowledge_entries = _safe_rows("knowledge_base", "*")
    retrievals = _safe_rows("knowledge_retrievals", "knowledge_base_id,similarity,created_at")
    documents = _safe_rows("documents", "id,user_id,file_size,created_at")

    chat_week = 0
    chat_month = 0
    source_counts = {"knowledge_base": 0, "llm": 0, "escalated": 0}
    retrieved_confidences = []
    failed_questions = {}
    for item in chats:
        created_at = parse_time(item.get("created_at"))
        if created_at and created_at >= week_ago:
            chat_week += 1
        if created_at and created_at >= month_ago:
            chat_month += 1
        source = item.get("source") or "llm"
        if source not in source_counts:
            source_counts[source] = 0
        source_counts[source] += 1
        confidence = float(item.get("confidence_score") or 0)
        if source in {"knowledge_base", "llm"}:
            retrieved_confidences.append(confidence)
        if source == "escalated" or confidence < 0.55:
            question = (item.get("message") or "").strip() or "Unknown question"
            failed_questions[question] = failed_questions.get(question, 0) + 1

    total_chats = len(chats)
    kb_category_counts = {}
    kb_department_counts = {}
    for entry in knowledge_entries:
        category = entry.get("category") or "Uncategorized"
        department = entry.get("department") or "Unassigned"
        kb_category_counts[category] = kb_category_counts.get(category, 0) + 1
        kb_department_counts[department] = kb_department_counts.get(department, 0) + 1

    retrieved_ids = {item.get("knowledge_base_id") for item in retrievals if item.get("knowledge_base_id")}
    never_retrieved = [
        {
            "id": entry.get("id"),
            "category": entry.get("category") or "Uncategorized",
            "source": entry.get("source") or "manual",
            "preview": (entry.get("content") or "")[:120],
        }
        for entry in knowledge_entries
        if entry.get("id") not in retrieved_ids
    ][:10]
    retrieval_similarities = [float(item.get("similarity") or 0) for item in retrievals if item.get("similarity") is not None]
    average_similarity = (
        round(sum(retrieval_similarities) / len(retrieval_similarities), 3)
        if retrieval_similarities
        else round(sum(retrieved_confidences) / len(retrieved_confidences), 3) if retrieved_confidences else 0
    )
    failed_question_list = [
        {"question": question, "count": count}
        for question, count in sorted(failed_questions.items(), key=lambda pair: pair[1], reverse=True)
    ][:10]
    total_document_storage = sum(int(item.get("file_size") or 0) for item in documents)

    ai_knowledge_analytics = {
        "chat_messages_week": chat_week,
        "chat_messages_month": chat_month,
        "total_chat_messages": total_chats,
        "source_counts": source_counts,
        "knowledge_base_answer_rate": round((source_counts.get("knowledge_base", 0) / total_chats) * 100, 1) if total_chats else 0,
        "llm_answer_rate": round((source_counts.get("llm", 0) / total_chats) * 100, 1) if total_chats else 0,
        "escalation_rate": round((source_counts.get("escalated", 0) / total_chats) * 100, 1) if total_chats else 0,
        "average_similarity_score": average_similarity,
        "low_confidence_questions": failed_question_list,
        "knowledge_base_by_category": kb_category_counts,
        "knowledge_base_by_department": kb_department_counts,
        "never_retrieved_entries": never_retrieved,
        "retrieval_tracking_active": bool(retrievals),
        "student_documents_uploaded": len(documents),
        "student_document_storage_bytes": total_document_storage,
    }
    escalations_week = 0
    escalations_month = 0
    response_hours = []
    resolved_24h = 0
    resolved_48h = 0
    resolved_beyond_48h = 0
    resolved_total = 0
    escalations_by_department = {}
    assigned_by_lecturer = {}
    resolved_by_lecturer = {}
    topic_counts = {}

    for item in escalations:
        created_at = parse_time(item.get("created_at"))
        resolved_at = parse_time(item.get("resolved_at"))
        if created_at and created_at >= week_ago:
            escalations_week += 1
        if created_at and created_at >= month_ago:
            escalations_month += 1

        department = item.get("user_department") or "General"
        escalations_by_department[department] = escalations_by_department.get(department, 0) + 1

        assigned_to = item.get("assigned_to")
        if assigned_to:
            assigned_by_lecturer[assigned_to] = assigned_by_lecturer.get(assigned_to, 0) + 1
            if item.get("status") == "resolved":
                resolved_by_lecturer[assigned_to] = resolved_by_lecturer.get(assigned_to, 0) + 1

        if created_at and resolved_at:
            hours = max(0, (resolved_at - created_at).total_seconds() / 3600)
            response_hours.append(hours)
            resolved_total += 1
            if hours <= 24:
                resolved_24h += 1
            elif hours <= 48:
                resolved_48h += 1
            else:
                resolved_beyond_48h += 1

        question = (item.get("question") or "").strip().lower()
        words = [word.strip(".,?!:;()[]{}") for word in question.split()]
        stop_words = {"the", "and", "for", "with", "that", "this", "from", "about", "what", "when", "where", "why", "how", "can", "could", "would", "should", "please", "into", "onto", "have", "has", "are", "was", "were", "you", "your", "my"}
        keywords = [word for word in words if len(word) > 3 and word not in stop_words][:3]
        topic = " ".join(keywords) or question[:50] or "Unknown"
        topic_counts[topic] = topic_counts.get(topic, 0) + 1

    lecturer_rates = []
    for lecturer_id, assigned_count in assigned_by_lecturer.items():
        resolved_count = resolved_by_lecturer.get(lecturer_id, 0)
        lecturer_rates.append(
            {
                "lecturer_ref": f"Lecturer {len(lecturer_rates) + 1}",
                "assigned": assigned_count,
                "resolved": resolved_count,
                "response_rate": round((resolved_count / assigned_count) * 100, 1) if assigned_count else 0,
            }
        )
    lecturer_rates.sort(key=lambda item: item["response_rate"], reverse=True)

    escalation_analytics = {
        "escalations_this_week": escalations_week,
        "escalations_this_month": escalations_month,
        "average_response_hours": round(sum(response_hours) / len(response_hours), 1) if response_hours else 0,
        "resolved_within_24h_percent": round((resolved_24h / resolved_total) * 100, 1) if resolved_total else 0,
        "resolved_within_48h_percent": round((resolved_48h / resolved_total) * 100, 1) if resolved_total else 0,
        "resolved_beyond_48h_percent": round((resolved_beyond_48h / resolved_total) * 100, 1) if resolved_total else 0,
        "resolution_bands": {"within_24h": resolved_24h, "within_48h": resolved_48h, "beyond_48h": resolved_beyond_48h},
        "escalations_by_department": escalations_by_department,
        "lecturer_response_rates": lecturer_rates[:10],
        "common_topics": [
            {"topic": topic, "count": count}
            for topic, count in sorted(topic_counts.items(), key=lambda pair: pair[1], reverse=True)[:10]
        ],
    }
    engagement_events = _safe_rows("engagement_events", "event_type,target_table,target_id,label,metadata,created_at")
    calendar_views = {}
    resource_access = {}
    map_searches = {}
    for event in engagement_events:
        event_type = event.get("event_type")
        label = event.get("label") or "Unknown"
        if event_type == "calendar_event_view":
            calendar_views[label] = calendar_views.get(label, 0) + 1
        elif event_type == "resource_open":
            resource_access[label] = resource_access.get(label, 0) + 1
        elif event_type == "campus_map_search":
            map_searches[label] = map_searches.get(label, 0) + 1

    notifications = _safe_rows("notifications", "type,is_read,created_at")
    notifications_week = 0
    notification_type_counts = {}
    notification_type_reads = {}
    unread_notifications = 0
    for notification in notifications:
        created_at = parse_time(notification.get("created_at"))
        notification_type = notification.get("type") or "unknown"
        if created_at and created_at >= week_ago:
            notifications_week += 1
        notification_type_counts[notification_type] = notification_type_counts.get(notification_type, 0) + 1
        if notification.get("is_read"):
            notification_type_reads[notification_type] = notification_type_reads.get(notification_type, 0) + 1
        else:
            unread_notifications += 1
    notification_read_rates = {
        notification_type: round((notification_type_reads.get(notification_type, 0) / count) * 100, 1) if count else 0
        for notification_type, count in notification_type_counts.items()
    }

    whatsapp_messages = _safe_rows("whatsapp_messages", "direction,response_source,created_at")
    whatsapp_incoming = sum(1 for item in whatsapp_messages if item.get("direction") == "inbound")
    whatsapp_parsed = sum(1 for item in whatsapp_messages if item.get("response_source"))
    whatsapp_failed = max(0, whatsapp_incoming - whatsapp_parsed)
    whatsapp_outgoing = sum(1 for item in whatsapp_messages if item.get("direction") == "outbound")

    calendar_engagement_analytics = {
        "calendar_event_views": [
            {"event": label, "views": views}
            for label, views in sorted(calendar_views.items(), key=lambda pair: pair[1], reverse=True)[:10]
        ],
        "most_accessed_resources": [
            {"resource": label, "opens": opens}
            for label, opens in sorted(resource_access.items(), key=lambda pair: pair[1], reverse=True)[:10]
        ],
        "campus_map_search_terms": [
            {"term": label, "count": count}
            for label, count in sorted(map_searches.items(), key=lambda pair: pair[1], reverse=True)[:10]
        ],
    }
    notification_analytics = {
        "notifications_sent_this_week": notifications_week,
        "delivery_success_rate": 100 if notifications else 0,
        "read_rate_by_type": notification_read_rates,
        "unread_notifications": unread_notifications,
        "notifications_by_type": notification_type_counts,
    }
    whatsapp_analytics = {
        "incoming_messages": whatsapp_incoming,
        "parsed_successfully": whatsapp_parsed,
        "failed_parses": whatsapp_failed,
        "outgoing_messages": whatsapp_outgoing,
        "web_chat_messages": total_chats,
        "whatsapp_vs_web": {"whatsapp": len(whatsapp_messages), "web": total_chats},
    }
    return jsonify(
        {
            "counts": counts,
            "departments": departments,
            "levels": levels,
            "roles": roles,
            "user_analytics": user_analytics,
            "content_analytics": content_analytics,
            "ai_knowledge_analytics": ai_knowledge_analytics,
            "escalation_analytics": escalation_analytics,
            "calendar_engagement_analytics": calendar_engagement_analytics,
            "notification_analytics": notification_analytics,
            "whatsapp_analytics": whatsapp_analytics,
            "recent_escalations": escalations[:10],
        }
    )


@admin_bp.get("/api/admin/directory")
@require_auth(["admin", "dean"])
def list_directory():
    records = _safe_rows("contacts", "*", lambda query: query.order("created_at", desc=True).limit(100))
    return jsonify({"data": records, "total": len(records)})


@admin_bp.post("/api/admin/directory")
@require_auth(["admin", "dean"])
def create_directory_contact():
    payload = request.get_json(silent=True) or {}
    required = ["name", "role", "email", "phone", "office_location"]
    missing = [field for field in required if not (payload.get(field) or "").strip()]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400
    record = {field: payload[field].strip() for field in required}
    inserted = request.supabase.table("contacts").insert(record).execute().data
    created = inserted[0] if inserted else {}
    write_audit_log(request.supabase, request.current_user, "contact.create", "contacts", created.get("id"), after=created)
    return jsonify(created), 201


@admin_bp.patch("/api/admin/directory/<contact_id>")
@require_auth(["admin", "dean"])
def update_directory_contact(contact_id):
    payload = request.get_json(silent=True) or {}
    existing = _safe_rows("contacts", "*", lambda query: query.eq("id", contact_id).limit(1))
    if not existing:
        return jsonify({"error": "Contact not found."}), 404
    allowed = {"name", "role", "email", "phone", "office_location"}
    updates = {key: value for key, value in payload.items() if key in allowed}
    updated = request.supabase.table("contacts").update(updates).eq("id", contact_id).execute().data
    record = updated[0] if updated else {}
    write_audit_log(request.supabase, request.current_user, "contact.update", "contacts", contact_id, before=existing[0], after=record)
    return jsonify(record)


@admin_bp.delete("/api/admin/directory/<contact_id>")
@require_auth(["admin", "dean"])
def delete_directory_contact(contact_id):
    existing = _safe_rows("contacts", "*", lambda query: query.eq("id", contact_id).limit(1))
    if not existing:
        return jsonify({"error": "Contact not found."}), 404
    request.supabase.table("contacts").delete().eq("id", contact_id).execute()
    write_audit_log(request.supabase, request.current_user, "contact.delete", "contacts", contact_id, before=existing[0])
    return jsonify({"ok": True})


@admin_bp.get("/api/admin/rules")
@require_auth(["admin", "dean"])
def list_rules():
    records = _safe_rows("rules", "*", lambda query: query.order("updated_at", desc=True).limit(100))
    return jsonify({"data": records, "total": len(records)})


@admin_bp.post("/api/admin/rules")
@require_auth(["admin", "dean"])
def create_rule():
    payload = request.get_json(silent=True) or {}
    required = ["title", "content", "category"]
    missing = [field for field in required if not (payload.get(field) or "").strip()]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400
    record = {field: payload[field].strip() for field in required}
    inserted = request.supabase.table("rules").insert(record).execute().data
    created = inserted[0] if inserted else {}
    write_audit_log(request.supabase, request.current_user, "rule.create", "rules", created.get("id"), after=created)
    return jsonify(created), 201


@admin_bp.patch("/api/admin/rules/<rule_id>")
@require_auth(["admin", "dean"])
def update_rule(rule_id):
    payload = request.get_json(silent=True) or {}
    existing = _safe_rows("rules", "*", lambda query: query.eq("id", rule_id).limit(1))
    if not existing:
        return jsonify({"error": "Rule not found."}), 404
    allowed = {"title", "content", "category"}
    updates = {key: value for key, value in payload.items() if key in allowed}
    updated = request.supabase.table("rules").update(updates).eq("id", rule_id).execute().data
    record = updated[0] if updated else {}
    write_audit_log(request.supabase, request.current_user, "rule.update", "rules", rule_id, before=existing[0], after=record)
    return jsonify(record)


@admin_bp.delete("/api/admin/rules/<rule_id>")
@require_auth(["admin", "dean"])
def delete_rule(rule_id):
    existing = _safe_rows("rules", "*", lambda query: query.eq("id", rule_id).limit(1))
    if not existing:
        return jsonify({"error": "Rule not found."}), 404
    request.supabase.table("rules").delete().eq("id", rule_id).execute()
    write_audit_log(request.supabase, request.current_user, "rule.delete", "rules", rule_id, before=existing[0])
    return jsonify({"ok": True})


@admin_bp.get("/api/admin/system-logs")
@require_auth(["admin", "dean"])
def list_system_logs():
    records = _safe_rows("audit_logs", "*", lambda query: query.order("created_at", desc=True).limit(100))
    return jsonify({"data": records, "total": len(records)})


@admin_bp.get("/api/admin/dean/oversight")
@require_auth(["dean"])
def dean_oversight():
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    def parse_time(value):
        if not value:
            return None
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except Exception:
            return None

    admins = _safe_rows(
        "users",
        "id,name,email,role,created_at,last_sign_in_at,department,level,is_profile_complete",
        lambda query: query.eq("role", "admin").order("created_at", desc=True).limit(200),
    )


@admin_bp.get("/api/admin/dean/analytics")
@require_auth(["dean"])
def dean_institutional_analytics():
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    def parse_time(value):
        if not value:
            return None
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except Exception:
            return None

    users = _safe_rows("users", "id,name,email,role,department,level,created_at,last_sign_in_at,is_profile_complete")
    lecturers = [item for item in users if item.get("role") == "lecturer"]
    students = [item for item in users if item.get("role") == "student"]
    admins = [item for item in users if item.get("role") == "admin"]
    announcements = _safe_rows("announcements", "*")
    knowledge_entries = _safe_rows("knowledge_base", "id,content,category,source,department,level,created_at,created_by,created_by_role")
    retrievals = _safe_rows("knowledge_retrievals", "knowledge_base_id,similarity,created_at")
    escalations = _safe_rows("escalations", "*", lambda query: query.order("created_at", desc=True).limit(1000))
    logs = _safe_rows("audit_logs", "*", lambda query: query.order("created_at", desc=True).limit(1000))
    chats = _safe_rows("chats", "source,confidence_score,created_at")

    departments = sorted({item.get("department") or "Unassigned" for item in users})
    department_performance = []
    for department in departments:
        dept_students = [item for item in students if (item.get("department") or "Unassigned") == department]
        dept_active = [item for item in dept_students if (parse_time(item.get("last_sign_in_at")) or datetime.min.replace(tzinfo=timezone.utc)) >= month_ago]
        dept_escalations = [item for item in escalations if (item.get("user_department") or "Unassigned") == department]
        dept_kb = [item for item in knowledge_entries if (item.get("department") or "Unassigned") == department]
        dept_announcements = [
            item for item in announcements
            if _as_list(item.get("target_departments")) == "all"
            or department in [str(value) for value in (_as_list(item.get("target_departments")) if _as_list(item.get("target_departments")) != "all" else [])]
        ]
        department_performance.append(
            {
                "department": department,
                "students": len(dept_students),
                "active_students_30d": len(dept_active),
                "engagement_rate": round((len(dept_active) / len(dept_students)) * 100, 1) if dept_students else 0,
                "escalations": len(dept_escalations),
                "escalation_rate": round((len(dept_escalations) / len(dept_students)) * 100, 1) if dept_students else 0,
                "knowledge_entries": len(dept_kb),
                "announcement_frequency": len(dept_announcements),
            }
        )

    lecturer_engagement = []
    for lecturer in lecturers:
        lecturer_id = lecturer.get("id")
        lecturer_announcements = [item for item in announcements if item.get("created_by") == lecturer_id]
        recent_announcements = [item for item in lecturer_announcements if (parse_time(item.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc)) >= month_ago]
        cohort_escalations = [
            item for item in escalations
            if item.get("user_department") == lecturer.get("department")
            and int(item.get("user_level") or 0) == int(lecturer.get("level") or 0)
        ]
        unanswered_over_48h = [
            item for item in cohort_escalations
            if item.get("status") != "resolved"
            and (parse_time(item.get("created_at")) or now) <= now - timedelta(hours=48)
        ]
        last_post_at = max([parse_time(item.get("created_at")) for item in lecturer_announcements if parse_time(item.get("created_at"))] or [None])
        lecturer_engagement.append(
            {
                "id": lecturer_id,
                "name": lecturer.get("name") or lecturer.get("email"),
                "email": lecturer.get("email"),
                "department": lecturer.get("department"),
                "level": lecturer.get("level"),
                "announcements_last_30d": len(recent_announcements),
                "last_announcement_at": last_post_at.isoformat() if last_post_at else None,
                "has_not_posted_30d": not last_post_at or last_post_at < month_ago,
                "unanswered_escalations_over_48h": len(unanswered_over_48h),
            }
        )

    admin_activity = []
    admin_ids = {admin.get("id") for admin in admins}
    for admin in admins:
        admin_logs_30 = [
            log for log in logs
            if log.get("actor_id") == admin.get("id")
            and (parse_time(log.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc)) >= month_ago
        ]
        admin_activity.append(
            {
                "id": admin.get("id"),
                "name": admin.get("name") or admin.get("email"),
                "email": admin.get("email"),
                "actions_last_30d": len(admin_logs_30),
                "last_action_at": admin_logs_30[0].get("created_at") if admin_logs_30 else None,
            }
        )

    resolved_escalations = [item for item in escalations if item.get("status") == "resolved"]
    confidence_scores = [float(item.get("confidence_score") or 0) for item in chats if item.get("confidence_score") is not None]
    retrieval_scores = [float(item.get("similarity") or 0) for item in retrievals if item.get("similarity") is not None]
    current_week_scores = [
        float(item.get("confidence_score") or 0)
        for item in chats
        if item.get("confidence_score") is not None and (parse_time(item.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc)) >= week_ago
    ]
    previous_week_scores = [
        float(item.get("confidence_score") or 0)
        for item in chats
        if item.get("confidence_score") is not None
        and week_ago > (parse_time(item.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc)) >= now - timedelta(days=14)
    ]
    active_students_30 = [item for item in students if (parse_time(item.get("last_sign_in_at")) or datetime.min.replace(tzinfo=timezone.utc)) >= month_ago]

    platform_health = {
        "knowledge_base_quality_score": round(((sum(retrieval_scores) / len(retrieval_scores)) * 100), 1) if retrieval_scores else 0,
        "escalation_resolution_rate": round((len(resolved_escalations) / len(escalations)) * 100, 1) if escalations else 0,
        "ai_answer_quality_current_week": round((sum(current_week_scores) / len(current_week_scores)) * 100, 1) if current_week_scores else 0,
        "ai_answer_quality_previous_week": round((sum(previous_week_scores) / len(previous_week_scores)) * 100, 1) if previous_week_scores else 0,
        "student_retention_30d": round((len(active_students_30) / len(students)) * 100, 1) if students else 0,
    }

    onboarding_funnel = [
        {"step": "Registered", "count": len(students)},
        {"step": "Profile completed", "count": sum(1 for item in students if item.get("is_profile_complete"))},
        {"step": "Dropped before profile completion", "count": sum(1 for item in students if not item.get("is_profile_complete"))},
    ]

    cohort_engagement = []
    for department in departments:
        levels = sorted({item.get("level") or "Unassigned" for item in students if (item.get("department") or "Unassigned") == department}, key=str)
        for level in levels:
            cohort_students = [item for item in students if (item.get("department") or "Unassigned") == department and (item.get("level") or "Unassigned") == level]
            active = [item for item in cohort_students if (parse_time(item.get("last_sign_in_at")) or datetime.min.replace(tzinfo=timezone.utc)) >= month_ago]
            cohort_engagement.append(
                {
                    "department": department,
                    "level": level,
                    "students": len(cohort_students),
                    "active_30d": len(active),
                    "engagement_rate": round((len(active) / len(cohort_students)) * 100, 1) if cohort_students else 0,
                }
            )

    retrieval_count_by_kb = {}
    similarity_by_kb = {}
    for retrieval in retrievals:
        kb_id = retrieval.get("knowledge_base_id")
        if not kb_id:
            continue
        retrieval_count_by_kb[kb_id] = retrieval_count_by_kb.get(kb_id, 0) + 1
        similarity_by_kb.setdefault(kb_id, []).append(float(retrieval.get("similarity") or 0))
    kb_quality = []
    for entry in knowledge_entries:
        entry_id = entry.get("id")
        similarities = similarity_by_kb.get(entry_id, [])
        kb_quality.append(
            {
                "id": entry_id,
                "category": entry.get("category"),
                "source": entry.get("source"),
                "department": entry.get("department"),
                "retrieval_count": retrieval_count_by_kb.get(entry_id, 0),
                "average_similarity": round(sum(similarities) / len(similarities), 3) if similarities else 0,
                "preview": (entry.get("content") or "")[:140],
            }
        )
    kb_quality.sort(key=lambda item: (item["retrieval_count"], item["average_similarity"]), reverse=True)

    deletion_history = [
        log for log in logs
        if ".delete" in (log.get("action") or "")
        or "soft_delete" in (log.get("action") or "")
        or (log.get("action") or "").endswith("delete")
    ]

    weekly_summary = (
        f"{len(active_students_30)} students were active in the last 30 days. "
        f"{len([item for item in escalations if (parse_time(item.get('created_at')) or datetime.min.replace(tzinfo=timezone.utc)) >= week_ago])} escalations were opened this week. "
        f"Knowledge quality is {platform_health['knowledge_base_quality_score']}%."
    )
    monthly_summary = (
        f"Student retention is {platform_health['student_retention_30d']}% over 30 days. "
        f"Escalation resolution is {platform_health['escalation_resolution_rate']}%. "
        f"{sum(1 for item in lecturer_engagement if item['has_not_posted_30d'])} lecturers have not posted in 30 days."
    )

    return jsonify(
        {
            "department_performance": department_performance,
            "lecturer_engagement": lecturer_engagement,
            "admin_activity_report": admin_activity,
            "platform_health": platform_health,
            "onboarding_funnel": onboarding_funnel,
            "student_engagement_by_cohort": cohort_engagement,
            "summary_reports": {"weekly": weekly_summary, "monthly": monthly_summary},
            "content_oversight": {
                "all_announcements": announcements,
                "knowledge_base_quality": kb_quality,
                "full_escalation_history": escalations,
                "deleted_content": deletion_history,
                "restore_supported": True,
            },
        }
    )


@admin_bp.post("/api/admin/dean/restore-deleted-content/<log_id>")
@require_auth(["dean"])
def restore_deleted_content(log_id):
    existing_logs = _safe_rows("audit_logs", "*", lambda query: query.eq("id", log_id).limit(1))
    if not existing_logs:
        return jsonify({"error": "Audit log not found."}), 404
    log = existing_logs[0]
    action = log.get("action") or ""
    if "delete" not in action and "soft_delete" not in action:
        return jsonify({"error": "Only deletion logs can be restored."}), 400
    table_name = log.get("table_name")
    snapshot = log.get("before_snapshot") or {}
    record_id = snapshot.get("id") or log.get("record_id")
    restorable_tables = {"announcements", "school_calendar", "knowledge_base", "faqs", "resources", "contacts", "rules", "school_services", "campus_map"}
    if table_name not in restorable_tables:
        return jsonify({"error": f"{table_name} records cannot be restored from this interface."}), 400
    if not snapshot:
        return jsonify({"error": "This deletion log has no before snapshot to restore."}), 400
    if record_id:
        found = _safe_rows(table_name, "id", lambda query: query.eq("id", record_id).limit(1))
        if found:
            return jsonify({"error": "The record already exists, so it was not restored."}), 409
    restored = request.supabase.table(table_name).insert(snapshot).execute().data
    record = restored[0] if restored else snapshot
    write_audit_log(request.supabase, request.current_user, "dean.restore_deleted_content", table_name, record.get("id"), before=log, after=record)
    return jsonify(record), 201
    logs = _safe_rows(
        "audit_logs",
        "*",
        lambda query: query.order("created_at", desc=True).limit(500),
    )
    announcements = _safe_rows(
        "announcements",
        "id,title,content,status,computed_state,created_by,created_by_role,created_at,publish_at,expires_at,target_departments,target_levels",
        lambda query: query.order("created_at", desc=True).limit(200),
    )
    escalations = _safe_rows(
        "escalations",
        "id,status,created_at,resolved_at,assigned_to,user_department,user_level,routing_level",
        lambda query: query.order("created_at", desc=True).limit(500),
    )

    admin_ids = {admin.get("id") for admin in admins if admin.get("id")}
    active_admins = []
    inactive_admins = []
    admin_action_counts = {admin_id: 0 for admin_id in admin_ids}
    for admin in admins:
        last_seen = parse_time(admin.get("last_sign_in_at"))
        admin["is_active_7_days"] = bool(last_seen and last_seen >= week_ago)
        if admin["is_active_7_days"]:
            active_admins.append(admin)
        else:
            inactive_admins.append(admin)

    admin_logs = [log for log in logs if log.get("actor_role") == "admin"]
    for log in admin_logs:
        actor_id = log.get("actor_id")
        if actor_id in admin_action_counts:
            admin_action_counts[actor_id] += 1

    deletion_logs = [
        log for log in logs
        if ".delete" in (log.get("action") or "")
        or "soft_delete" in (log.get("action") or "")
        or (log.get("action") or "").endswith("delete")
    ]

    response_times = []
    for escalation in escalations:
        assigned_to = escalation.get("assigned_to")
        if assigned_to not in admin_ids:
            continue
        created_at = parse_time(escalation.get("created_at"))
        resolved_at = parse_time(escalation.get("resolved_at"))
        if created_at and resolved_at:
            response_times.append(max(0, (resolved_at - created_at).total_seconds() / 3600))

    admins_with_activity = []
    for admin in admins:
        admin_id = admin.get("id")
        admin_copy = dict(admin)
        admin_copy["significant_action_count"] = admin_action_counts.get(admin_id, 0)
        admin_copy["recent_actions"] = [
            log for log in admin_logs
            if log.get("actor_id") == admin_id
        ][:5]
        admins_with_activity.append(admin_copy)

    return jsonify(
        {
            "admin_accounts": admins_with_activity,
            "active_admins_7_days": active_admins,
            "inactive_admins_7_days": inactive_admins,
            "admin_action_logs": admin_logs[:100],
            "admin_response_times": {
                "count": len(response_times),
                "average_hours": round(sum(response_times) / len(response_times), 1) if response_times else 0,
            },
            "all_announcements": announcements,
            "deletion_history": deletion_logs[:100],
        }
    )


def _crud_list(table_name, order_field="created_at"):
    records = _safe_rows(table_name, "*", lambda query: query.order(order_field, desc=True).limit(100))
    return jsonify({"data": records, "total": len(records)})


def _crud_create(table_name, required, allowed, action):
    payload = request.get_json(silent=True) or {}
    missing = [field for field in required if not (payload.get(field) or "").strip()]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400
    record = {key: payload.get(key) for key in allowed if key in payload}
    inserted = request.supabase.table(table_name).insert(record).execute().data
    created = inserted[0] if inserted else {}
    write_audit_log(request.supabase, request.current_user, f"{action}.create", table_name, created.get("id"), after=created)
    return jsonify(created), 201


def _crud_update(table_name, record_id, allowed, action):
    payload = request.get_json(silent=True) or {}
    existing = _safe_rows(table_name, "*", lambda query: query.eq("id", record_id).limit(1))
    if not existing:
        return jsonify({"error": "Record not found."}), 404
    updates = {key: value for key, value in payload.items() if key in allowed}
    updated = request.supabase.table(table_name).update(updates).eq("id", record_id).execute().data
    record = updated[0] if updated else {}
    write_audit_log(request.supabase, request.current_user, f"{action}.update", table_name, record_id, before=existing[0], after=record)
    return jsonify(record)


def _crud_delete(table_name, record_id, action):
    existing = _safe_rows(table_name, "*", lambda query: query.eq("id", record_id).limit(1))
    if not existing:
        return jsonify({"error": "Record not found."}), 404
    request.supabase.table(table_name).delete().eq("id", record_id).execute()
    write_audit_log(request.supabase, request.current_user, f"{action}.delete", table_name, record_id, before=existing[0])
    return jsonify({"ok": True})


def _normalize_calendar_date(value, default_year=None):
    import re

    text = str(value or "").strip()
    if not text:
        return ""
    text = text.replace(",", "")
    text = re.sub(r"\b(Sept?|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Oct|Nov|Dec)\.", r"\1", text, flags=re.IGNORECASE)
    text = re.sub(r"(\d{1,2})(st|nd|rd|th)\b", r"\1", text, flags=re.IGNORECASE)
    for date_format in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(text, date_format).date().isoformat()
        except ValueError:
            pass
    for date_format in ("%d %B %Y", "%d %b %Y", "%B %d %Y", "%b %d %Y"):
        try:
            return datetime.strptime(text.title(), date_format).date().isoformat()
        except ValueError:
            pass
    if default_year:
        for date_format in ("%d %B %Y", "%d %b %Y", "%B %d %Y", "%b %d %Y"):
            try:
                return datetime.strptime(f"{text.title()} {default_year}", date_format).date().isoformat()
            except ValueError:
                pass
    return ""


def _extract_calendar_date_from_text(text, default_year=None):
    match = _find_calendar_date_match(text, default_year)
    if match:
        return _normalize_calendar_date(match.group(0), default_year)
    return ""


def _find_calendar_date_match(text, default_year=None):
    import re

    normalized = re.sub(r"\b(Sept?|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Oct|Nov|Dec)\.", r"\1", text, flags=re.IGNORECASE)
    patterns = [
        r"\b\d{4}-\d{2}-\d{2}\b",
        r"\b\d{1,2}[/-]\d{1,2}[/-]\d{4}\b",
        rf"\b\d{{1,2}}(?:st|nd|rd|th)?\s+(?:{MONTH_PATTERN})\s+\d{{4}}\b",
        rf"\b(?:{MONTH_PATTERN})\s+\d{{1,2}}(?:st|nd|rd|th)?\s+\d{{4}}\b",
    ]
    if default_year:
        patterns.extend([
            rf"\b\d{{1,2}}(?:st|nd|rd|th)?\s+(?:{MONTH_PATTERN})\b",
            rf"\b(?:{MONTH_PATTERN})\s+\d{{1,2}}(?:st|nd|rd|th)?\b",
        ])
    for pattern in patterns:
        match = re.search(pattern, normalized, flags=re.IGNORECASE)
        if match:
            return match
    return None


def _clean_calendar_title(value):
    import re

    title = re.sub(r"^\d+\s+", "", value or "").strip(" -–—:,")
    title = re.sub(r"\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)(\s*[-–&]\s*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun))*[,]?$", "", title, flags=re.IGNORECASE)
    return " ".join(title.split()).strip(" -–—:,")


def _guess_calendar_type(title):
    text = title.lower()
    if "exam" in text:
        return "exam"
    if "registration" in text:
        return "registration"
    if "holiday" in text or "break" in text:
        return "holiday"
    if "fee" in text:
        return "fee"
    if "deadline" in text or "submission" in text:
        return "deadline"
    return "event"


def _extract_semester(text):
    import re

    match = re.search(r"\b(first|second)\b\s*$", text or "", flags=re.IGNORECASE)
    return match.group(1).title() if match else None


def _remove_semester_suffix(text):
    import re

    return re.sub(r"\b(first|second)\b\s*$", "", text or "", flags=re.IGNORECASE).strip(" -:,")


def _parse_calendar_import_rows(text, default_year=None):
    rows = []
    for line in text.splitlines():
        clean = " ".join(line.strip().split())
        if not clean or clean.lower().startswith(("date |", "start_date", "start date")):
            continue
        separator = "|" if "|" in clean else None
        if not separator:
            date_match = _find_calendar_date_match(clean, default_year)
            if not date_match:
                continue
            title = _clean_calendar_title(clean[:date_match.start()])
            if not title or title.lower() in {"holiday", "date", "holy day", "activity", "event"}:
                continue
            rows.append(
                {
                    "start_date": _normalize_calendar_date(date_match.group(0), default_year),
                    "event_type": _guess_calendar_type(title),
                    "title": title,
                    "description": clean,
                    "end_date": None,
                    "target_departments": [],
                    "target_levels": [],
                }
            )
            continue
        parts = [item.strip() for item in clean.split(separator)]
        if len(parts) < 3:
            continue
        start_date, event_type, title = parts[:3]
        description = parts[3] if len(parts) > 3 else ""
        end_date = parts[4] if len(parts) > 4 else ""
        target_departments = parts[5] if len(parts) > 5 else ""
        target_levels = parts[6] if len(parts) > 6 else ""
        normalized_type = event_type.lower().replace(" ", "_")
        normalized_start = _normalize_calendar_date(start_date, default_year)
        if not normalized_start and len(parts) > 1:
            normalized_start = _normalize_calendar_date(parts[1], default_year)
        if not normalized_start:
            normalized_start = _extract_calendar_date_from_text(clean, default_year)
        normalized_end = _normalize_calendar_date(end_date, default_year) if end_date else None
        rows.append(
            {
                "start_date": normalized_start,
                "event_type": normalized_type if normalized_type in CALENDAR_EVENT_TYPES else "event",
                "title": title,
                "description": description or None,
                "end_date": normalized_end,
                "target_departments": [item.strip() for item in target_departments.split(";") if item.strip()] if target_departments and target_departments.lower() != "all" else [],
                "target_levels": [int(item.strip()) for item in target_levels.split(";") if item.strip().isdigit()] if target_levels and target_levels.lower() != "all" else [],
            }
        )
    return [row for row in rows if row["start_date"] and row["title"]]


def _is_calendar_header_line(text):
    value = text.lower().strip()
    headers = {
        "s/n",
        "activity",
        "activity / event",
        "date",
        "date / period",
        "semester",
        "holiday",
        "holy day",
        "academic schedule (first semester)",
        "academic schedule (second semester)",
        "public holidays",
        "holy days of obligation",
    }
    return value in headers or value.startswith(("veritas university", "bwari area", "academic calendar", "first & second", "(100"))


def _clean_calendar_title(value):
    import re

    title = re.sub(r"^\d+\s+", "", value or "").strip(" -:,")
    title = re.sub(r"\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)(\s*[-&]\s*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun))*[,]?$", "", title, flags=re.IGNORECASE)
    return " ".join(title.split()).strip(" -:,")


def _parse_calendar_import_rows(text, default_year=None):
    rows = []
    pending_title = ""
    for line in text.splitlines():
        clean = " ".join(line.strip().split())
        if not clean or clean.lower().startswith(("date |", "start_date", "start date")):
            continue
        if _is_calendar_header_line(clean):
            pending_title = ""
            continue
        separator = "|" if "|" in clean else None
        if not separator:
            semester = _extract_semester(clean)
            clean_without_semester = _remove_semester_suffix(clean) if semester else clean
            date_match = _find_calendar_date_match(clean_without_semester, default_year)
            if not date_match:
                pending_title = f"{pending_title} {clean}".strip()
                continue
            before_date = _clean_calendar_title(clean_without_semester[:date_match.start()])
            title = _clean_calendar_title(f"{pending_title} {before_date}".strip()) if pending_title else before_date
            normalized_date = _normalize_calendar_date(date_match.group(0), default_year)
            if not title or title.lower() in {"holiday", "date", "holy day", "activity", "event"} or not normalized_date:
                pending_title = ""
                continue
            rows.append({
                "start_date": normalized_date,
                "event_type": _guess_calendar_type(title),
                "title": title,
                "description": f"Semester: {semester}; Source row: {clean}" if semester else clean,
                "end_date": None,
                "target_departments": [],
                "target_levels": [],
            })
            pending_title = ""
            continue

        parts = [item.strip() for item in clean.split(separator)]
        if len(parts) < 3:
            continue
        start_date, event_type, title = parts[:3]
        description = parts[3] if len(parts) > 3 else ""
        end_date = parts[4] if len(parts) > 4 else ""
        target_departments = parts[5] if len(parts) > 5 else ""
        target_levels = parts[6] if len(parts) > 6 else ""
        normalized_start = _normalize_calendar_date(start_date, default_year) or _extract_calendar_date_from_text(clean, default_year)
        rows.append({
            "start_date": normalized_start,
            "event_type": event_type.lower().replace(" ", "_") if event_type.lower().replace(" ", "_") in CALENDAR_EVENT_TYPES else _guess_calendar_type(title),
            "title": _clean_calendar_title(title),
            "description": description or None,
            "end_date": _normalize_calendar_date(end_date, default_year) if end_date else None,
            "target_departments": [item.strip() for item in target_departments.split(";") if item.strip()] if target_departments and target_departments.lower() != "all" else [],
            "target_levels": [int(item.strip()) for item in target_levels.split(";") if item.strip().isdigit()] if target_levels and target_levels.lower() != "all" else [],
        })
    return [row for row in rows if row["start_date"] and row["title"]]


def _calendar_month_number(value):
    month_key = (value or "").lower().strip().rstrip(".")[:3]
    months = {
        "jan": 1,
        "feb": 2,
        "mar": 3,
        "apr": 4,
        "may": 5,
        "jun": 6,
        "jul": 7,
        "aug": 8,
        "sep": 9,
        "oct": 10,
        "nov": 11,
        "dec": 12,
    }
    return months.get(month_key)


def _calendar_iso_date(year, month_name, day):
    month = _calendar_month_number(month_name)
    if not month:
        return None
    try:
        return date(int(year), int(month), int(day)).isoformat()
    except (TypeError, ValueError):
        return None


def _calendar_day_label(text):
    import re

    day = r"(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)"
    match = re.search(rf"\b{day}(?:\s*[-&]\s*{day})?", text or "", flags=re.IGNORECASE)
    if not match:
        return ""
    label = match.group(0).strip(" ,")
    return label.replace("–", "-")


def _calendar_period_from_text(text, default_year=None):
    import re

    normalized = (text or "").replace("\u2013", "-").replace("\u2014", "-")
    month = rf"(?:{MONTH_PATTERN})\.?"
    patterns = [
        # Dec. 19, 2025 - Jan. 9, 2026
        rf"(?P<m1>{month})\s+(?P<d1>\d{{1,2}}),?\s*(?P<y1>\d{{4}})\s*-\s*(?P<m2>{month})\s+(?P<d2>\d{{1,2}}),?\s*(?P<y2>\d{{4}})",
        # Sept. 29 - Oct. 3, 2025
        rf"(?P<m1>{month})\s+(?P<d1>\d{{1,2}})\s*-\s*(?P<m2>{month})\s+(?P<d2>\d{{1,2}}),?\s*(?P<y2>\d{{4}})",
        # Sept. 22-24, 2025 / June 1 - 5, 2026
        rf"(?P<m1>{month})\s+(?P<d1>\d{{1,2}})\s*-\s*(?P<d2>\d{{1,2}}),?\s*(?P<y2>\d{{4}})",
        # March 20 & 22, 2026
        rf"(?P<m1>{month})\s+(?P<d1>\d{{1,2}})\s*&\s*(?P<d2>\d{{1,2}}),?\s*(?P<y2>\d{{4}})",
    ]
    if default_year:
        patterns.append(rf"(?P<m1>{month})\s+(?P<d1>\d{{1,2}})\s*-\s*(?P<d2>\d{{1,2}})")

    for pattern in patterns:
        match = re.search(pattern, normalized, flags=re.IGNORECASE)
        if not match:
            continue
        groups = match.groupdict()
        start_year = groups.get("y1") or groups.get("y2") or default_year
        end_year = groups.get("y2") or start_year
        start_month = groups.get("m1")
        end_month = groups.get("m2") or start_month
        start_date = _calendar_iso_date(start_year, start_month, groups.get("d1"))
        end_date = _calendar_iso_date(end_year, end_month, groups.get("d2"))
        if start_date:
            return {
                "start": start_date,
                "end": end_date if end_date and end_date != start_date else None,
                "period": match.group(0).strip(" ,"),
                "match_start": match.start(),
            }

    single_with_year = re.search(rf"(?P<m1>{month})\s+(?P<d1>\d{{1,2}}),?\s*(?P<y1>\d{{4}})", normalized, flags=re.IGNORECASE)
    if single_with_year:
        groups = single_with_year.groupdict()
        start_date = _calendar_iso_date(groups.get("y1"), groups.get("m1"), groups.get("d1"))
        if start_date:
            return {
                "start": start_date,
                "end": None,
                "period": single_with_year.group(0).strip(" ,"),
                "match_start": single_with_year.start(),
            }

    single = _find_calendar_date_match(normalized, default_year)
    if not single:
        return None
    start_date = _normalize_calendar_date(single.group(0), default_year)
    if not start_date:
        return None
    return {
        "start": start_date,
        "end": None,
        "period": single.group(0).strip(" ,"),
        "match_start": single.start(),
    }


# Final importer used by /api/admin/calendar/import. It intentionally overrides
# the simpler parser above so official academic calendar PDFs keep order/ranges.
def _parse_calendar_import_rows(text, default_year=None):
    rows = []
    pending_title = ""
    row_number = 0
    for line in text.splitlines():
        clean = " ".join(line.strip().split())
        if not clean or clean.lower().startswith(("date |", "start_date", "start date")):
            continue
        if _is_calendar_header_line(clean):
            pending_title = ""
            continue

        separator = "|" if "|" in clean else None
        if separator:
            parts = [item.strip() for item in clean.split(separator)]
            if len(parts) < 3:
                continue
            start_date, event_type, title = parts[:3]
            description = parts[3] if len(parts) > 3 else ""
            end_date = parts[4] if len(parts) > 4 else ""
            target_departments = parts[5] if len(parts) > 5 else ""
            target_levels = parts[6] if len(parts) > 6 else ""
            normalized_start = _normalize_calendar_date(start_date, default_year) or _extract_calendar_date_from_text(clean, default_year)
            if not normalized_start:
                continue
            row_number += 1
            normalized_type = event_type.lower().replace(" ", "_")
            rows.append({
                "start_date": normalized_start,
                "event_type": normalized_type if normalized_type in CALENDAR_EVENT_TYPES else _guess_calendar_type(title),
                "title": _clean_calendar_title(title),
                "description": f"Order: {row_number}; {description or f'Source row: {clean}'}",
                "end_date": _normalize_calendar_date(end_date, default_year) if end_date else None,
                "target_departments": [item.strip() for item in target_departments.split(";") if item.strip()] if target_departments and target_departments.lower() != "all" else [],
                "target_levels": [int(item.strip()) for item in target_levels.split(";") if item.strip().isdigit()] if target_levels and target_levels.lower() != "all" else [],
            })
            continue

        semester = _extract_semester(clean)
        clean_without_semester = _remove_semester_suffix(clean) if semester else clean
        period = _calendar_period_from_text(clean_without_semester, default_year)
        if not period:
            pending_title = f"{pending_title} {clean}".strip()
            continue

        before_period = _clean_calendar_title(clean_without_semester[:period["match_start"]])
        title = _clean_calendar_title(f"{pending_title} {before_period}".strip()) if pending_title else before_period
        if not title or title.lower() in {"holiday", "date", "holy day", "activity", "event"}:
            pending_title = ""
            continue

        row_number += 1
        day_label = _calendar_day_label(clean_without_semester)
        description_parts = [
            f"Order: {row_number}",
            f"Semester: {semester or '-'}",
            f"Day: {day_label or '-'}",
            f"Period: {period['period']}",
            f"Source row: {clean}",
        ]
        rows.append({
            "start_date": period["start"],
            "event_type": _guess_calendar_type(title),
            "title": title,
            "description": "; ".join(description_parts),
            "end_date": period.get("end"),
            "target_departments": [],
            "target_levels": [],
        })
        pending_title = ""

    return [row for row in rows if row["start_date"] and row["title"]]


@admin_bp.get("/api/admin/faqs")
@require_auth(["admin", "dean"])
def list_faqs():
    return _crud_list("faqs")


@admin_bp.post("/api/admin/faqs")
@require_auth(["admin", "dean"])
def create_faq():
    return _crud_create("faqs", ["question", "answer", "category"], {"question", "answer", "category", "language"}, "faq")


@admin_bp.patch("/api/admin/faqs/<record_id>")
@require_auth(["admin", "dean"])
def update_faq(record_id):
    return _crud_update("faqs", record_id, {"question", "answer", "category", "language"}, "faq")


@admin_bp.delete("/api/admin/faqs/<record_id>")
@require_auth(["admin", "dean"])
def delete_faq(record_id):
    return _crud_delete("faqs", record_id, "faq")


@admin_bp.get("/api/admin/resources")
@require_auth(["admin", "lecturer", "dean"])
def list_resources():
    if request.current_user.get("role") == "lecturer":
        records = _safe_rows(
            "resources",
            "*",
            lambda query: query.eq("created_by", request.current_user["id"]).order("created_at", desc=True).limit(100),
        )
        return jsonify({"data": records, "total": len(records)})
    return _crud_list("resources")


@admin_bp.post("/api/admin/resources")
@require_auth(["admin", "lecturer", "dean"])
def create_resource():
    payload = request.get_json(silent=True) or {}
    _lock_lecturer_target(payload, request.current_user)
    required = ["title", "file_url", "type", "description"]
    missing = [field for field in required if not (payload.get(field) or "").strip()]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400
    record = {key: payload.get(key) for key in {"title", "file_url", "type", "description", "department", "level"} if key in payload}
    record["created_by"] = request.current_user.get("id")
    record["created_by_role"] = request.current_user.get("role")
    inserted = request.supabase.table("resources").insert(record).execute().data
    created = inserted[0] if inserted else {}
    write_audit_log(request.supabase, request.current_user, "resource.create", "resources", created.get("id"), after=created)
    return jsonify(created), 201


@admin_bp.patch("/api/admin/resources/<record_id>")
@require_auth(["admin", "lecturer", "dean"])
def update_resource(record_id):
    payload = request.get_json(silent=True) or {}
    _lock_lecturer_target(payload, request.current_user)
    existing = _safe_rows("resources", "*", lambda query: query.eq("id", record_id).limit(1))
    if not existing:
        return jsonify({"error": "Record not found."}), 404
    if request.current_user.get("role") == "lecturer" and not _lecturer_owns(existing[0], request.current_user):
        return jsonify({"error": "Lecturers can only edit resources they uploaded."}), 403
    allowed = {"title", "file_url", "type", "description", "department", "level"}
    updates = {key: value for key, value in payload.items() if key in allowed}
    updated = request.supabase.table("resources").update(updates).eq("id", record_id).execute().data
    record = updated[0] if updated else {}
    write_audit_log(request.supabase, request.current_user, "resource.update", "resources", record_id, before=existing[0], after=record)
    return jsonify(record)


@admin_bp.delete("/api/admin/resources/<record_id>")
@require_auth(["admin", "lecturer", "dean"])
def delete_resource(record_id):
    existing = _safe_rows("resources", "*", lambda query: query.eq("id", record_id).limit(1))
    if not existing:
        return jsonify({"error": "Record not found."}), 404
    if request.current_user.get("role") == "lecturer" and not _lecturer_owns(existing[0], request.current_user):
        return jsonify({"error": "Lecturers can only delete resources they uploaded."}), 403
    return _crud_delete("resources", record_id, "resource")


@admin_bp.get("/api/admin/services")
@require_auth(["admin", "dean"])
def list_services():
    return _crud_list("school_services", "updated_at")


@admin_bp.post("/api/admin/services")
@require_auth(["admin", "dean"])
def create_service():
    return _crud_create("school_services", ["service_name"], {"service_name", "description", "category", "info"}, "school_service")


@admin_bp.patch("/api/admin/services/<record_id>")
@require_auth(["admin", "dean"])
def update_service(record_id):
    return _crud_update("school_services", record_id, {"service_name", "description", "category", "info"}, "school_service")


@admin_bp.delete("/api/admin/services/<record_id>")
@require_auth(["admin", "dean"])
def delete_service(record_id):
    return _crud_delete("school_services", record_id, "school_service")


@admin_bp.get("/api/admin/knowledge-base")
@require_auth(["admin", "lecturer", "dean"])
def list_knowledge_base():
    user = request.current_user
    if user.get("role") == "lecturer":
        own_records = _safe_rows(
            "knowledge_base",
            "*",
            lambda query: query.eq("created_by", user["id"]).order("created_at", desc=True).limit(100),
        )
        department_records = _safe_rows(
            "knowledge_base",
            "*",
            lambda query: query.eq("department", user.get("department")).order("created_at", desc=True).limit(100),
        )
        records_by_id = {record.get("id"): record for record in department_records + own_records if record.get("id")}
        records = list(records_by_id.values())
    else:
        records = _safe_rows(
            "knowledge_base",
            "*",
            lambda query: query.order("created_at", desc=True).limit(100),
        )
    for record in records:
        record["embedding_status"] = "indexed" if record.get("embedding") is not None else "not_indexed"
        record.pop("embedding", None)
    return jsonify({"data": records, "total": len(records)})


@admin_bp.post("/api/admin/knowledge-base")
@require_auth(["admin", "lecturer", "dean"])
def create_knowledge_base_entry():
    payload = request.get_json(silent=True) or {}
    _lock_lecturer_target(payload, request.current_user)
    content = (payload.get("content") or "").strip()
    if not content:
        return jsonify({"error": "Knowledge base content is required."}), 400
    authoritative = bool(payload.get("authoritative_policy") or payload.get("is_authoritative"))
    if authoritative and request.current_user.get("role") != "dean":
        return jsonify({"error": "Only the dean can create authoritative university policy entries."}), 403

    category = (payload.get("category") or "general").strip() or "general"
    source = (payload.get("source") or f"{request.current_user.get('role')}_entry").strip()
    if authoritative:
        category = "university_policy" if category == "general" else category
        source = "official_university_policy"

    record = {
        "content": content,
        "category": category,
        "source": source,
        "department": payload.get("department"),
        "level": payload.get("level"),
        "created_by": request.current_user.get("id"),
        "created_by_role": request.current_user.get("role"),
        "is_authoritative": authoritative,
        "authority_weight": 2.0 if authoritative else float(payload.get("authority_weight") or 1.0),
    }
    try:
        record["embedding"] = EmbeddingService(current_app.config).embed(content)
    except Exception:
        # The text entry is still useful to staff even if local embedding is not running.
        pass

    try:
        inserted = request.supabase.table("knowledge_base").insert(record).execute().data
    except Exception as exc:
        if "is_authoritative" in str(exc) or "authority_weight" in str(exc):
            return jsonify({"error": "Run supabase/admin_privileges_policies.sql in Supabase to add dean policy metadata columns."}), 400
        raise
    created = inserted[0] if inserted else {}
    write_audit_log(request.supabase, request.current_user, "knowledge_base.create", "knowledge_base", created.get("id"), after=created)
    return jsonify(created), 201


@admin_bp.patch("/api/admin/knowledge-base/<record_id>")
@require_auth(["admin", "lecturer", "dean"])
def update_knowledge_base_entry(record_id):
    payload = request.get_json(silent=True) or {}
    _lock_lecturer_target(payload, request.current_user)
    existing = _safe_rows("knowledge_base", "*", lambda query: query.eq("id", record_id).limit(1))
    if not existing:
        return jsonify({"error": "Knowledge base entry not found."}), 404
    if request.current_user.get("role") == "lecturer" and not _lecturer_owns(existing[0], request.current_user):
        return jsonify({"error": "Lecturers can only edit knowledge entries they created."}), 403
    authoritative_requested = "authoritative_policy" in payload or "is_authoritative" in payload or "authority_weight" in payload
    if authoritative_requested and request.current_user.get("role") != "dean":
        return jsonify({"error": "Only the dean can change authoritative university policy weighting."}), 403
    updates = {key: payload.get(key) for key in {"content", "category", "source", "department", "level"} if key in payload}
    if "authoritative_policy" in payload:
        updates["is_authoritative"] = bool(payload.get("authoritative_policy"))
    if "is_authoritative" in payload:
        updates["is_authoritative"] = bool(payload.get("is_authoritative"))
    if "authority_weight" in payload:
        updates["authority_weight"] = float(payload.get("authority_weight") or 1.0)
    if updates.get("is_authoritative"):
        updates["source"] = "official_university_policy"
        if not updates.get("category") or updates.get("category") == "general":
            updates["category"] = "university_policy"
    if "content" in updates:
        try:
            updates["embedding"] = EmbeddingService(current_app.config).embed(updates["content"])
        except Exception:
            pass
    try:
        updated = request.supabase.table("knowledge_base").update(updates).eq("id", record_id).execute().data
    except Exception as exc:
        if "is_authoritative" in str(exc) or "authority_weight" in str(exc):
            return jsonify({"error": "Run supabase/admin_privileges_policies.sql in Supabase to add dean policy metadata columns."}), 400
        raise
    record = updated[0] if updated else {}
    write_audit_log(request.supabase, request.current_user, "knowledge_base.update", "knowledge_base", record_id, before=existing[0], after=record)
    record.pop("embedding", None)
    return jsonify(record)


@admin_bp.delete("/api/admin/knowledge-base/<record_id>")
@require_auth(["admin", "dean"])
def delete_knowledge_base_entry(record_id):
    existing = _safe_rows("knowledge_base", "*", lambda query: query.eq("id", record_id).limit(1))
    if not existing:
        return jsonify({"error": "Knowledge base entry not found."}), 404
    request.supabase.table("knowledge_base").delete().eq("id", record_id).execute()
    write_audit_log(request.supabase, request.current_user, "knowledge_base.delete", "knowledge_base", record_id, before=existing[0])
    return jsonify({"ok": True})


@admin_bp.post("/api/admin/announcements")
@require_auth(["admin", "lecturer", "dean"])
def create_announcement():
    payload = request.get_json(silent=True) or {}
    _lock_lecturer_target(payload, request.current_user)
    payload.pop("department", None)
    payload.pop("level", None)
    required = ["title", "content"]
    missing = [field for field in required if not payload.get(field)]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    scope_error = _validate_lecturer_scope(payload, request.current_user)
    if scope_error:
        return jsonify({"error": scope_error}), 403
    if request.current_user.get("role") == "admin" and _is_university_wide(payload):
        return jsonify({"error": "Only the dean can create university-wide broadcast announcements."}), 403

    payload["created_by"] = request.current_user["id"]
    payload["created_by_role"] = request.current_user.get("role")
    payload.setdefault("target_departments", "all")
    payload.setdefault("target_levels", "all")
    payload.setdefault("attachments", [])
    payload.setdefault("status", "published")
    record = request.supabase.table("announcements").insert(payload).execute().data
    created = record[0] if record else {}
    _notify_targeted_students(created)
    write_audit_log(request.supabase, request.current_user, "announcement.create", "announcements", created.get("id"), after=created)
    return jsonify(created), 201


@admin_bp.get("/api/admin/announcements")
@require_auth(["admin", "lecturer", "dean"])
def list_admin_announcements():
    if request.current_user.get("role") == "lecturer":
        records = _safe_rows(
            "announcements",
            "*",
            lambda query: query.eq("created_by", request.current_user["id"]).order("created_at", desc=True).limit(200),
        )
    else:
        records = _safe_rows("announcements", "*", lambda query: query.order("created_at", desc=True).limit(200))
    for record in records:
        record["computed_state"] = _announcement_state(record)
    return jsonify({"data": records, "total": len(records)})


@admin_bp.patch("/api/admin/announcements/<announcement_id>")
@require_auth(["admin", "lecturer", "dean"])
def update_announcement(announcement_id):
    payload = request.get_json(silent=True) or {}
    _lock_lecturer_target(payload, request.current_user)
    payload.pop("department", None)
    payload.pop("level", None)
    existing = _safe_rows("announcements", "*", lambda query: query.eq("id", announcement_id).limit(1))
    if not existing:
        return jsonify({"error": "Announcement not found."}), 404
    if request.current_user.get("role") == "lecturer" and not _lecturer_owns(existing[0], request.current_user):
        return jsonify({"error": "Lecturers can only edit announcements they created."}), 403
    if request.current_user.get("role") == "admin" and existing[0].get("created_by_role") == "dean":
        return jsonify({"error": "Dean announcements require dean authorization."}), 403
    allowed = {"title", "content", "expires_at", "publish_at", "status", "target_departments", "target_levels", "attachments"}
    updates = {key: value for key, value in payload.items() if key in allowed}
    updated = request.supabase.table("announcements").update(updates).eq("id", announcement_id).execute().data
    record = updated[0] if updated else {}
    write_audit_log(request.supabase, request.current_user, "announcement.update", "announcements", announcement_id, before=existing[0], after=record)
    _notify_announcement_changed(record, "Announcement updated", f"{record.get('title') or 'An announcement'} was updated by school staff.")
    return jsonify(record)


@admin_bp.delete("/api/admin/announcements/<announcement_id>")
@require_auth(["admin", "lecturer", "dean"])
def delete_announcement(announcement_id):
    existing = _safe_rows("announcements", "*", lambda query: query.eq("id", announcement_id).limit(1))
    if not existing:
        return jsonify({"error": "Announcement not found."}), 404
    if request.current_user.get("role") == "lecturer" and not _lecturer_owns(existing[0], request.current_user):
        return jsonify({"error": "Lecturers can only delete announcements they created."}), 403
    if request.current_user.get("role") == "admin" and existing[0].get("created_by_role") == "dean":
        return jsonify({"error": "Dean announcements require dean authorization."}), 403
    _notify_announcement_changed(existing[0], "Announcement removed", "A school announcement previously posted for your cohort has been removed.")
    request.supabase.table("announcements").delete().eq("id", announcement_id).execute()
    write_audit_log(request.supabase, request.current_user, "announcement.delete", "announcements", announcement_id, before=existing[0])
    return jsonify({"ok": True})


@admin_bp.post("/api/admin/calendar")
@require_auth(["admin", "lecturer", "dean"])
def create_calendar_event():
    payload = request.get_json(silent=True) or {}
    _lock_lecturer_target(payload, request.current_user)
    payload.pop("department", None)
    payload.pop("level", None)
    required = ["title", "event_type", "start_date"]
    missing = [field for field in required if not payload.get(field)]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    scope_error = _validate_lecturer_scope(payload, request.current_user)
    if scope_error:
        return jsonify({"error": scope_error}), 403
    payload["created_by"] = request.current_user["id"]
    payload["target_departments"] = _target_array_for_db(payload.get("target_departments"))
    payload["target_levels"] = _level_array_for_db(payload.get("target_levels"))
    record = request.supabase.table("school_calendar").insert(payload).execute().data
    created = record[0] if record else {}
    write_audit_log(request.supabase, request.current_user, "school_calendar.create", "school_calendar", created.get("id"), after=created)
    return jsonify(created), 201


@admin_bp.post("/api/admin/calendar/import")
@require_auth(["admin", "lecturer", "dean"])
def import_calendar_events():
    file = request.files.get("file")
    text = request.form.get("text") or ""
    default_year_raw = request.form.get("default_year") or ""
    default_year = int(default_year_raw) if default_year_raw.isdigit() else None
    if file:
        text = extract_text(file)
    rows = _parse_calendar_import_rows(text, default_year)
    if not rows:
        return jsonify({"error": "No valid calendar rows found. Use: date | type | title | description | end_date | departments | levels. If your file has dates like 'Tuesday | 12 January', enter the calendar year before importing."}), 400

    records = []
    for row in rows:
        scope_payload = dict(row)
        _lock_lecturer_target(scope_payload, request.current_user)
        scope_error = _validate_lecturer_scope(scope_payload, request.current_user)
        if scope_error:
            return jsonify({"error": scope_error}), 403
        scope_payload["created_by"] = request.current_user["id"]
        scope_payload["target_departments"] = _target_array_for_db(scope_payload.get("target_departments"))
        scope_payload["target_levels"] = _level_array_for_db(scope_payload.get("target_levels"))
        records.append(scope_payload)

    try:
        inserted = request.supabase.table("school_calendar").insert(records).execute().data
    except Exception as exc:
        return jsonify({"error": f"Could not import calendar rows. Check that every row has a real date, not just a weekday name. Details: {exc}"}), 400
    write_audit_log(
        request.supabase,
        request.current_user,
        "school_calendar.import",
        "school_calendar",
        None,
        after={"count": len(inserted or []), "source": file.filename if file else "pasted_text"},
    )
    return jsonify({"data": inserted or [], "imported": len(inserted or [])}), 201


@admin_bp.get("/api/admin/calendar")
@require_auth(["admin", "lecturer", "dean"])
def list_admin_calendar():
    if request.current_user.get("role") == "lecturer":
        records = _safe_rows(
            "school_calendar",
            "*",
            lambda query: query.eq("created_by", request.current_user["id"]).order("start_date", desc=False).limit(200),
        )
    else:
        records = _safe_rows("school_calendar", "*", lambda query: query.order("start_date", desc=False).limit(200))
    return jsonify({"data": records, "total": len(records)})


@admin_bp.get("/api/admin/whatsapp")
@require_auth(["admin", "dean"])
def list_whatsapp_messages():
    records = _safe_rows("whatsapp_messages", "*", lambda query: query.order("created_at", desc=True).limit(200))
    return jsonify({"data": records, "total": len(records)})


@admin_bp.post("/api/admin/whatsapp/<message_id>/announcement")
@require_auth(["admin", "dean"])
def convert_whatsapp_to_announcement(message_id):
    existing = _safe_rows("whatsapp_messages", "*", lambda query: query.eq("id", message_id).limit(1))
    if not existing:
        return jsonify({"error": "WhatsApp message not found."}), 404
    message = existing[0]
    payload = request.get_json(silent=True) or {}
    announcement = {
        "title": (payload.get("title") or "WhatsApp announcement").strip(),
        "content": (payload.get("content") or message.get("message") or "").strip(),
        "target_departments": payload.get("target_departments") or "all",
        "target_levels": payload.get("target_levels") or "all",
        "created_by": request.current_user["id"],
        "created_by_role": request.current_user.get("role"),
        "attachments": [],
        "status": "published",
    }
    if request.current_user.get("role") == "admin" and _is_university_wide(announcement):
        return jsonify({"error": "Only the dean can create university-wide broadcast announcements."}), 403
    inserted = request.supabase.table("announcements").insert(announcement).execute().data
    created = inserted[0] if inserted else {}
    _notify_targeted_students(created)
    request.supabase.table("whatsapp_messages").update({"response_source": "converted_to_announcement"}).eq("id", message_id).execute()
    write_audit_log(request.supabase, request.current_user, "whatsapp.convert_announcement", "announcements", created.get("id"), before=message, after=created)
    return jsonify(created), 201


@admin_bp.post("/api/admin/notifications")
@require_auth(["admin", "dean"])
def send_manual_notification():
    payload = request.get_json(silent=True) or {}
    title = (payload.get("title") or "").strip()
    message = (payload.get("message") or "").strip()
    notification_type = (payload.get("type") or "system").strip()
    if not title or not message:
        return jsonify({"error": "Title and message are required."}), 400

    users = _safe_rows("users", "id,role,department,level", lambda query: query.eq("role", "student"))
    target_departments = payload.get("target_departments") or "all"
    target_levels = payload.get("target_levels") or "all"
    if request.current_user.get("role") == "admin" and _is_university_wide({"target_departments": target_departments, "target_levels": target_levels}):
        return jsonify({"error": "Only the dean can send platform-wide notifications."}), 403
    rows = [
        {
            "user_id": user["id"],
            "title": title,
            "message": message,
            "type": notification_type,
            "date": payload.get("date") or date.today().isoformat(),
            "link": payload.get("link") or "/notifications",
        }
        for user in users
        if _matches_target(user, target_departments, target_levels)
    ]
    if rows:
        request.supabase.table("notifications").insert(rows).execute()
    write_audit_log(request.supabase, request.current_user, "notification.broadcast", "notifications", None, after={"count": len(rows), "title": title, "type": notification_type})
    return jsonify({"sent": len(rows)}), 201


@admin_bp.patch("/api/admin/calendar/<event_id>")
@require_auth(["admin", "lecturer", "dean"])
def update_calendar_event(event_id):
    payload = request.get_json(silent=True) or {}
    _lock_lecturer_target(payload, request.current_user)
    payload.pop("department", None)
    payload.pop("level", None)
    existing = _safe_rows("school_calendar", "*", lambda query: query.eq("id", event_id).limit(1))
    if not existing:
        return jsonify({"error": "Calendar event not found."}), 404
    if request.current_user.get("role") == "lecturer" and not _lecturer_owns(existing[0], request.current_user):
        return jsonify({"error": "Lecturers can only edit calendar events they created."}), 403
    allowed = {"title", "description", "event_type", "start_date", "end_date", "target_departments", "target_levels"}
    updates = {key: value for key, value in payload.items() if key in allowed}
    if "target_departments" in updates:
        updates["target_departments"] = _target_array_for_db(updates.get("target_departments"))
    if "target_levels" in updates:
        updates["target_levels"] = _level_array_for_db(updates.get("target_levels"))
    updated = request.supabase.table("school_calendar").update(updates).eq("id", event_id).execute().data
    record = updated[0] if updated else {}
    write_audit_log(request.supabase, request.current_user, "school_calendar.update", "school_calendar", event_id, before=existing[0], after=record)
    return jsonify(record)


@admin_bp.delete("/api/admin/calendar/<event_id>")
@require_auth(["admin", "lecturer", "dean"])
def delete_calendar_event(event_id):
    existing = _safe_rows("school_calendar", "*", lambda query: query.eq("id", event_id).limit(1))
    if not existing:
        return jsonify({"error": "Calendar event not found."}), 404
    if request.current_user.get("role") == "lecturer" and not _lecturer_owns(existing[0], request.current_user):
        return jsonify({"error": "Lecturers can only delete calendar events they created."}), 403
    request.supabase.table("school_calendar").delete().eq("id", event_id).execute()
    write_audit_log(request.supabase, request.current_user, "school_calendar.delete", "school_calendar", event_id, before=existing[0])
    return jsonify({"ok": True})
