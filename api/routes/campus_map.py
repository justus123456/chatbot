from flask import Blueprint, jsonify, request

from api.audit import write_audit_log
from api.auth.middleware import require_auth

campus_map_bp = Blueprint("campus_map", __name__)


@campus_map_bp.get("/api/campus-map")
@require_auth()
def list_campus_locations():
    records = (
        request.supabase.table("campus_map")
        .select("*")
        .order("location_name")
        .execute()
        .data
        or []
    )
    return jsonify({"data": records, "total": len(records), "page": 1, "per_page": 100, "has_more": False})


@campus_map_bp.post("/api/campus-map")
@require_auth(["admin", "dean"])
def create_campus_location():
    payload = request.get_json(silent=True) or {}
    location_name = (payload.get("location_name") or "").strip()
    category = (payload.get("category") or "office").strip().lower()
    description = (payload.get("description") or "").strip()

    try:
        latitude = float(payload.get("latitude"))
        longitude = float(payload.get("longitude"))
    except (TypeError, ValueError):
        return jsonify({"error": "Latitude and longitude are required numbers."}), 400

    if not location_name:
        return jsonify({"error": "Location name is required."}), 400
    if category not in {"office", "hostel", "department"}:
        return jsonify({"error": "Category must be office, hostel, or department."}), 400

    record = {
        "location_name": location_name,
        "description": description,
        "latitude": latitude,
        "longitude": longitude,
        "category": category,
    }
    created = request.supabase.table("campus_map").insert(record).execute().data[0]
    write_audit_log(request.supabase, request.current_user, "campus_map.create", "campus_map", created.get("id"), after=created)
    return jsonify({"location": created}), 201


@campus_map_bp.patch("/api/campus-map/<location_id>")
@require_auth(["admin", "dean"])
def update_campus_location(location_id):
    payload = request.get_json(silent=True) or {}
    existing = request.supabase.table("campus_map").select("*").eq("id", location_id).limit(1).execute().data or []
    if not existing:
        return jsonify({"error": "Location not found."}), 404
    allowed = {"location_name", "description", "latitude", "longitude", "category"}
    updates = {key: payload.get(key) for key in allowed if key in payload}
    updated = request.supabase.table("campus_map").update(updates).eq("id", location_id).execute().data
    record = updated[0] if updated else {}
    write_audit_log(request.supabase, request.current_user, "campus_map.update", "campus_map", location_id, before=existing[0], after=record)
    return jsonify({"location": record})


@campus_map_bp.delete("/api/campus-map/<location_id>")
@require_auth(["admin", "dean"])
def delete_campus_location(location_id):
    existing = request.supabase.table("campus_map").select("*").eq("id", location_id).limit(1).execute().data or []
    if not existing:
        return jsonify({"error": "Location not found."}), 404
    request.supabase.table("campus_map").delete().eq("id", location_id).execute()
    write_audit_log(request.supabase, request.current_user, "campus_map.delete", "campus_map", location_id, before=existing[0])
    return jsonify({"ok": True})
