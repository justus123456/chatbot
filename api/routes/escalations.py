from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from api.auth.middleware import require_auth

escalations_bp = Blueprint("escalations", __name__)


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
    return jsonify({"data": records, "total": len(records), "page": 1, "per_page": 50, "has_more": False})


@escalations_bp.post("/api/admin/escalations/<escalation_id>/reply")
@require_auth(["admin", "lecturer", "dean"])
def reply_to_escalation(escalation_id):
    payload = request.get_json(silent=True) or {}
    response = (payload.get("response") or "").strip()
    if not response:
        return jsonify({"error": "Response is required."}), 400

    record = (
        request.supabase.table("escalations")
        .update(
            {
                "status": "resolved",
                "assigned_to": request.current_user["id"],
                "admin_response": response,
                "resolved_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .eq("id", escalation_id)
        .execute()
        .data
    )
    if record:
        request.supabase.table("notifications").insert(
            {
                "user_id": record[0]["user_id"],
                "title": "Your escalated question was answered",
                "message": response,
                "type": "escalation_response",
                "link": "/chat",
            }
        ).execute()
    return jsonify(record[0] if record else {})
