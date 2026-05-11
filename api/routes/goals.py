from flask import Blueprint, jsonify, request

from api.auth.middleware import require_auth

goals_bp = Blueprint("goals", __name__)


@goals_bp.get("/api/goals")
@require_auth()
def list_goals():
    records = (
        request.supabase.table("goals")
        .select("*")
        .eq("user_id", request.current_user["id"])
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    goal_ids = [record["id"] for record in records]
    items = []
    if goal_ids:
        items = (
            request.supabase.table("goal_items")
            .select("*")
            .in_("goal_id", goal_ids)
            .order("created_at")
            .execute()
            .data
            or []
        )
    items_by_goal = {}
    for item in items:
        items_by_goal.setdefault(item["goal_id"], []).append(item)
    for record in records:
        record["items"] = items_by_goal.get(record["id"], [])
    return jsonify({"data": records, "total": len(records), "page": 1, "per_page": 100, "has_more": False})


@goals_bp.post("/api/goals")
@require_auth()
def create_goal():
    payload = request.get_json(silent=True) or {}
    title = (payload.get("title") or payload.get("goal_text") or "").strip()
    if not title:
        return jsonify({"error": "Goal title is required."}), 400

    record = {
        "user_id": request.current_user["id"],
        "title": title,
        "goal_text": title,
        "description": (payload.get("description") or "").strip(),
        "deadline": payload.get("deadline") or None,
        "target_value": int(payload.get("target_value") or 100),
        "current_value": int(payload.get("current_value") or 0),
        "unit": (payload.get("unit") or "percent").strip(),
        "progress": int(payload.get("progress") or 0),
        "status": payload.get("status") or "pending",
    }
    saved = request.supabase.table("goals").insert(record).execute().data
    goal = saved[0] if saved else None
    items = []
    raw_items = payload.get("items") or []
    if goal and isinstance(raw_items, list):
        item_records = [
            {"goal_id": goal["id"], "title": str(item).strip(), "is_completed": False}
            for item in raw_items
            if str(item).strip()
        ]
        if item_records:
            items = request.supabase.table("goal_items").insert(item_records).execute().data or []
    if goal:
        goal["items"] = items
    return jsonify({"goal": goal}), 201


@goals_bp.patch("/api/goals/<goal_id>")
@require_auth()
def update_goal(goal_id):
    payload = request.get_json(silent=True) or {}
    allowed = {"title", "goal_text", "description", "deadline", "target_value", "current_value", "unit", "progress", "status"}
    updates = {key: value for key, value in payload.items() if key in allowed}
    if "title" in updates and "goal_text" not in updates:
        updates["goal_text"] = updates["title"]
    saved = (
        request.supabase.table("goals")
        .update(updates)
        .eq("id", goal_id)
        .eq("user_id", request.current_user["id"])
        .execute()
        .data
    )
    return jsonify({"goal": saved[0] if saved else None})


@goals_bp.delete("/api/goals/<goal_id>")
@require_auth()
def delete_goal(goal_id):
    request.supabase.table("goals").delete().eq("id", goal_id).eq("user_id", request.current_user["id"]).execute()
    return jsonify({"ok": True})


@goals_bp.patch("/api/goals/<goal_id>/items/<item_id>")
@require_auth()
def update_goal_item(goal_id, item_id):
    goal = (
        request.supabase.table("goals")
        .select("id")
        .eq("id", goal_id)
        .eq("user_id", request.current_user["id"])
        .single()
        .execute()
        .data
    )
    if not goal:
        return jsonify({"error": "Goal not found."}), 404

    payload = request.get_json(silent=True) or {}
    updates = {}
    if "title" in payload:
        updates["title"] = str(payload["title"]).strip()
    if "is_completed" in payload:
        updates["is_completed"] = bool(payload["is_completed"])

    saved = (
        request.supabase.table("goal_items")
        .update(updates)
        .eq("id", item_id)
        .eq("goal_id", goal_id)
        .execute()
        .data
    )
    sync_goal_progress(request.supabase, goal_id)
    return jsonify({"item": saved[0] if saved else None})


def sync_goal_progress(supabase, goal_id):
    items = supabase.table("goal_items").select("*").eq("goal_id", goal_id).execute().data or []
    total = len(items)
    completed = len([item for item in items if item.get("is_completed")])
    progress = round((completed / total) * 100) if total else 0
    status = "completed" if total and completed == total else "in_progress" if completed else "pending"
    supabase.table("goals").update(
        {
            "target_value": total or 1,
            "current_value": completed,
            "progress": progress,
            "status": status,
        }
    ).eq("id", goal_id).execute()
