from flask import Blueprint, jsonify, request

from api.auth.middleware import require_auth

notifications_bp = Blueprint("notifications", __name__)


@notifications_bp.get("/api/notifications")
@require_auth()
def list_notifications():
    records = (
        request.supabase.table("notifications")
        .select("*")
        .eq("user_id", request.current_user["id"])
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    return jsonify({"data": records, "total": len(records), "page": 1, "per_page": 50, "has_more": False})


@notifications_bp.get("/api/calendar")
@require_auth()
def list_calendar():
    user = request.current_user
    records = (
        request.supabase.table("school_calendar")
        .select("*")
        .order("start_date")
        .execute()
        .data
        or []
    )

    def visible(item):
        departments = item.get("target_departments") or "all"
        levels = item.get("target_levels") or "all"
        department_ok = departments == "all" or user.get("department") in departments
        level_ok = levels == "all" or user.get("level") in levels
        return department_ok and level_ok

    return jsonify({"data": [item for item in records if visible(item)], "total": len(records), "page": 1, "per_page": 50, "has_more": False})
