from functools import wraps

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

            profile = supabase.table("users").select("*").eq("id", auth_user.id).single().execute().data
            if not profile:
                return jsonify({"error": "User profile not found"}), 404

            if allowed_roles and profile.get("role") not in allowed_roles:
                return jsonify({"error": "Forbidden"}), 403

            request.current_user = profile
            request.supabase = supabase
            request.access_token = token
            return view(*args, **kwargs)

        return wrapped

    return decorator
