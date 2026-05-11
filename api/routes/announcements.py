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

    def matches_target(target, value):
        if not target or target == "all":
            return True
        if isinstance(target, list):
            normalized = [str(item).lower() for item in target]
            return "all" in normalized or str(value) in [str(item) for item in target]
        return str(target).lower() == "all" or str(value) in str(target)

    def visible(item):
        return matches_target(item.get("target_departments"), user.get("department")) and matches_target(item.get("target_levels"), user.get("level"))

    visible_records = [item for item in records if visible(item)]
    return jsonify({"data": visible_records, "total": len(visible_records), "page": 1, "per_page": 50, "has_more": False})
