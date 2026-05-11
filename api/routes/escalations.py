from datetime import date, datetime, timezone

from flask import Blueprint, jsonify, request

from api.audit import write_audit_log
from api.auth.middleware import require_auth

escalations_bp = Blueprint("escalations", __name__)


def _hours_open(created_at, resolved_at=None):
    if not created_at:
        return 0
    try:
        start = datetime.fromisoformat(str(created_at).replace("Z", "+00:00"))
        end = datetime.fromisoformat(str(resolved_at).replace("Z", "+00:00")) if resolved_at else datetime.now(timezone.utc)
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        return round(max(0, (end - start).total_seconds() / 3600), 1)
    except Exception:
        return 0


@escalations_bp.get("/api/admin/escalations")
@require_auth(["admin", "lecturer", "dean"])
def list_escalations():
    records = (
        request.supabase.table("escalations")
        .select("*")
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    lecturers = (
        request.supabase.table("users")
        .select("id,name,email,department,level,role")
        .eq("role", "lecturer")
        .execute()
        .data
        or []
    )
    lecturers_by_id = {item.get("id"): item for item in lecturers}
    lecturer_scope = {(item.get("department"), int(item.get("level") or 0)) for item in lecturers}
    student_profiles = (
        request.supabase.table("users")
        .select("id,name")
        .eq("role", "student")
        .execute()
        .data
        or []
    )
    students_by_id = {item.get("id"): item for item in student_profiles}
    user = request.current_user
    if user.get("role") == "lecturer":
        records = [
            item for item in records
            if item.get("user_department") == user.get("department")
            and int(item.get("user_level") or 0) == int(user.get("level") or 0)
        ]

    department_counts = {}
    unassigned_count = 0
    for item in records:
        student = students_by_id.get(item.get("user_id")) or {}
        first_name = (student.get("name") or "Student").split()[0]
        item["student_first_name"] = first_name
        item["similar_question_count"] = sum(
            1
            for other in records
            if other.get("id") != item.get("id")
            and other.get("user_id") == item.get("user_id")
        )
        assigned = lecturers_by_id.get(item.get("assigned_to"))
        item["assigned_lecturer"] = {
            "id": assigned.get("id"),
            "name": assigned.get("name") or assigned.get("email"),
            "email": assigned.get("email"),
        } if assigned else None
        item["time_open_hours"] = _hours_open(item.get("created_at"), item.get("resolved_at"))
        item["is_unassigned"] = not item.get("assigned_to") and (
            (item.get("user_department"), int(item.get("user_level") or 0)) not in lecturer_scope
        )
        department = item.get("user_department") or "General"
        department_counts[department] = department_counts.get(department, 0) + 1
        if item["is_unassigned"]:
            unassigned_count += 1

        if user.get("role") == "lecturer":
            item.pop("user_id", None)

    longest_open = sorted(
        [item for item in records if item.get("status") != "resolved"],
        key=lambda item: item.get("time_open_hours") or 0,
        reverse=True,
    )[:5]
    department_rates = [
        {"department": department, "count": count}
        for department, count in sorted(department_counts.items(), key=lambda pair: pair[1], reverse=True)
    ]

    return jsonify(
        {
            "data": records,
            "total": len(records),
            "page": 1,
            "per_page": 50,
            "has_more": False,
            "meta": {
                "longest_open": longest_open,
                "department_rates": department_rates,
                "unassigned_count": unassigned_count,
            },
        }
    )


@escalations_bp.post("/api/admin/escalations/<escalation_id>/reply")
@require_auth(["admin", "lecturer", "dean"])
def reply_to_escalation(escalation_id):
    if request.current_user.get("role") != "lecturer":
        return jsonify({"error": "Only lecturers can answer academic escalations. Admins and deans should reassign or monitor them."}), 403

    payload = request.get_json(silent=True) or {}
    response = (payload.get("response") or "").strip()
    if not response:
        return jsonify({"error": "Response is required."}), 400

    existing = (
        request.supabase.table("escalations")
        .select("*")
        .eq("id", escalation_id)
        .eq("user_department", request.current_user.get("department"))
        .eq("user_level", request.current_user.get("level"))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not existing:
        return jsonify({"error": "Escalation not found in your assigned cohort."}), 404

    previous = existing[0]
    update_payload = {
        "status": "resolved",
        "assigned_to": request.current_user["id"],
        "admin_response": response,
        "resolved_at": datetime.now(timezone.utc).isoformat(),
    }

    if previous.get("status") == "resolved" and previous.get("admin_response"):
        notification_rows = (
            request.supabase.table("notifications")
            .select("id,is_read")
            .eq("user_id", previous.get("user_id"))
            .eq("type", "escalation_response")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
            .data
            or []
        )
        student_has_read = bool(notification_rows and notification_rows[0].get("is_read"))
        if student_has_read:
            update_payload["admin_response"] = f"{previous.get('admin_response')}\n\nFollow-up: {response}"

    record = (
        request.supabase.table("escalations")
        .update(update_payload)
        .eq("id", escalation_id)
        .eq("user_department", request.current_user.get("department"))
        .eq("user_level", request.current_user.get("level"))
        .execute()
        .data
    )
    if record:
        write_audit_log(request.supabase, request.current_user, "escalation.reply", "escalations", escalation_id, after=record[0])
        kb_entry = {
            "content": f"Question: {record[0].get('question')}\nAnswer: {response}",
            "category": "escalation_response",
            "source": "lecturer_escalation_response",
            "department": request.current_user.get("department"),
            "level": request.current_user.get("level"),
            "created_by": request.current_user.get("id"),
            "created_by_role": "lecturer",
        }
        try:
            created_kb = request.supabase.table("knowledge_base").insert(kb_entry).execute().data
            if created_kb:
                write_audit_log(request.supabase, request.current_user, "knowledge_base.create_from_escalation", "knowledge_base", created_kb[0].get("id"), after=created_kb[0])
        except Exception:
            # Older databases may not have lecturer tracking columns yet.
            pass
        request.supabase.table("notifications").insert(
            {
                "user_id": record[0]["user_id"],
                "title": "Your escalated question was answered",
                "message": response,
                "type": "escalation_response",
                "date": date.today().isoformat(),
                "link": "/chat",
            }
        ).execute()
    return jsonify(record[0] if record else {})
