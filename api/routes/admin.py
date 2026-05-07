from flask import Blueprint, jsonify, request

from api.auth.middleware import require_auth

admin_bp = Blueprint("admin", __name__)


@admin_bp.post("/api/admin/announcements")
@require_auth(["admin", "lecturer", "dean"])
def create_announcement():
    payload = request.get_json(silent=True) or {}
    required = ["title", "content"]
    missing = [field for field in required if not payload.get(field)]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    payload["created_by"] = request.current_user["id"]
    payload.setdefault("target_departments", "all")
    payload.setdefault("target_levels", "all")
    payload.setdefault("attachments", [])
    record = request.supabase.table("announcements").insert(payload).execute().data
    return jsonify(record[0] if record else {}), 201


@admin_bp.post("/api/admin/calendar")
@require_auth(["admin", "lecturer", "dean"])
def create_calendar_event():
    payload = request.get_json(silent=True) or {}
    required = ["title", "event_type", "start_date"]
    missing = [field for field in required if not payload.get(field)]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    payload["created_by"] = request.current_user["id"]
    payload.setdefault("target_departments", "all")
    payload.setdefault("target_levels", "all")
    record = request.supabase.table("school_calendar").insert(payload).execute().data
    return jsonify(record[0] if record else {}), 201
