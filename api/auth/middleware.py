from functools import wraps
from datetime import datetime, timezone

from flask import current_app, jsonify, request
from supabase import create_client


def get_supabase_admin():
    url = current_app.config["SUPABASE_URL"]
    key = current_app.config["SUPABASE_SERVICE_ROLE_KEY"]
    if not url or not key:
        return None
    return create_client(url, key)


def require_auth(allowed_roles=None):
    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            token = request.headers.get("Authorization", "").replace("Bearer ", "").strip()
            if not token:
                return jsonify({"error": "Unauthorized"}), 401

            supabase = get_supabase_admin()
            if not supabase:
                return jsonify({"error": "Supabase service role is not configured."}), 503

            try:
                auth_user = supabase.auth.get_user(token).user
            except Exception:
                return jsonify({"error": "Invalid token"}), 401

            if not auth_user:
                return jsonify({"error": "Invalid token"}), 401

            try:
                profile = supabase.table("users").select("*").eq("id", auth_user.id).single().execute().data
            except Exception:
                return jsonify({"error": "Could not reach Supabase. Please try again shortly."}), 503

            if not profile:
                return jsonify({"error": "User profile not found"}), 404

            role = str(profile.get("role") or "").strip().lower()
            profile["role"] = role
            if allowed_roles and role not in {str(item).strip().lower() for item in allowed_roles}:
                return jsonify({
                    "error": "Forbidden",
                    "role": role or "unknown",
                    "allowed_roles": allowed_roles,
                }), 403

            try:
                now = datetime.now(timezone.utc)
                previous_raw = profile.get("last_sign_in_at")
                previous = datetime.fromisoformat(str(previous_raw).replace("Z", "+00:00")) if previous_raw else None
                if not previous or (now - previous).total_seconds() > 900:
                    signed_in_at = now.isoformat()
                    supabase.table("users").update({"last_sign_in_at": signed_in_at}).eq("id", auth_user.id).execute()
                    profile["last_sign_in_at"] = signed_in_at
            except Exception:
                # Older databases may not have last_sign_in_at until the admin privileges SQL is run.
                pass

            request.current_user = profile
            request.supabase = supabase
            request.access_token = token
            return view(*args, **kwargs)

        return wrapped

    return decorator
