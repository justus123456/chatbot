from flask import Blueprint, jsonify, request

from api.auth.middleware import require_auth

announcements_bp = Blueprint("announcements", __name__)


@announcements_bp.get("/api/announcements")
@require_auth()
def list_announcements():
    user = request.current_user
    records = (
        request.supabase.table("announcements")
        .select("*")
        .order("created_at", desc=True)
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
