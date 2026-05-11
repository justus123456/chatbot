from flask import Blueprint, jsonify, request

from api.auth.middleware import require_auth

engagement_bp = Blueprint("engagement", __name__)


@engagement_bp.post("/api/engagement")
@require_auth()
def track_engagement():
    payload = request.get_json(silent=True) or {}
    event_type = (payload.get("event_type") or "").strip()
    if not event_type:
        return jsonify({"error": "event_type is required."}), 400

    record = {
        "user_id": request.current_user["id"],
        "event_type": event_type,
        "target_table": (payload.get("target_table") or "").strip() or None,
        "target_id": payload.get("target_id") or None,
        "label": (payload.get("label") or "").strip() or None,
        "metadata": payload.get("metadata") or {},
    }
    inserted = request.supabase.table("engagement_events").insert(record).execute().data
    return jsonify(inserted[0] if inserted else {"ok": True}), 201
