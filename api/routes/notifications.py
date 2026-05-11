from flask import Blueprint, jsonify, request
from datetime import date

from api.auth.middleware import require_auth

notifications_bp = Blueprint("notifications", __name__)


@notifications_bp.get("/api/notifications")
@require_auth()
def list_notifications():
    _backfill_announcement_notifications()
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


def _matches_target(target, value):
    if not target or target == "all":
        return True
    if isinstance(target, list):
        normalized = [str(item).lower() for item in target]
        return "all" in normalized or str(value) in [str(item) for item in target]
    return str(target).lower() == "all" or str(value) in str(target)


def _backfill_announcement_notifications():
    user = request.current_user
    try:
        announcements = (
            request.supabase.table("announcements")
            .select("id,title,content,target_departments,target_levels")
            .order("created_at", desc=True)
            .limit(50)
            .execute()
            .data
            or []
        )
        existing = (
            request.supabase.table("notifications")
            .select("related_id")
            .eq("user_id", user["id"])
            .eq("related_table", "announcements")
            .execute()
            .data
            or []
        )
        existing_ids = {item.get("related_id") for item in existing if item.get("related_id")}
        rows = [
            {
                "user_id": user["id"],
                "title": item.get("title") or "New announcement",
                "message": item.get("content") or "A new announcement was posted.",
                "type": "announcement",
                "date": date.today().isoformat(),
                "is_read": False,
                "link": "/announcements",
                "related_table": "announcements",
                "related_id": item.get("id"),
            }
            for item in announcements
            if item.get("id") not in existing_ids
            and _matches_target(item.get("target_departments"), user.get("department"))
            and _matches_target(item.get("target_levels"), user.get("level"))
        ]
        if rows:
            request.supabase.table("notifications").insert(rows).execute()
    except Exception:
        # Older databases may not have related_table/related_id yet; new announcements still work once SQL is applied.
        pass


@notifications_bp.patch("/api/notifications/<notification_id>")
@require_auth()
def update_notification(notification_id):
    payload = request.get_json(silent=True) or {}
    updates = {}
    if "is_read" in payload:
        updates["is_read"] = bool(payload["is_read"])
    if not updates:
        return jsonify({"error": "No notification updates provided."}), 400

    result = (
        request.supabase.table("notifications")
        .update(updates)
        .eq("id", notification_id)
        .eq("user_id", request.current_user["id"])
        .execute()
        .data
        or []
    )
    if not result:
        return jsonify({"error": "Notification not found."}), 404
    return jsonify({"notification": result[0]})


@notifications_bp.post("/api/notifications/mark-all-read")
@require_auth()
def mark_all_notifications_read():
    records = (
        request.supabase.table("notifications")
        .update({"is_read": True})
        .eq("user_id", request.current_user["id"])
        .eq("is_read", False)
        .execute()
        .data
        or []
    )
    return jsonify({"data": records, "total": len(records)})


@notifications_bp.delete("/api/notifications/<notification_id>")
@require_auth()
def delete_notification(notification_id):
    (
        request.supabase.table("notifications")
        .delete()
        .eq("id", notification_id)
        .eq("user_id", request.current_user["id"])
        .execute()
    )
    return jsonify({"ok": True})


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
