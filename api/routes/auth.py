from flask import Blueprint, jsonify, request

from api.auth.middleware import get_supabase_admin

auth_bp = Blueprint("auth", __name__)


def _lookup_by_legacy_identifiers(supabase, identifier: str):
    return (
        supabase.table("users")
        .select("email")
        .or_(f"matric_number.eq.{identifier},phone.eq.{identifier},email.eq.{identifier}")
        .limit(1)
        .execute()
        .data
        or []
    )


def _select_user_profile(supabase, user_id: str):
    return (
        supabase.table("users")
        .select("id,email,name,role,department,level,matric_number,phone,preferred_language,preferred_tone,is_profile_complete,created_at,updated_at")
        .eq("id", user_id)
        .limit(1)
        .execute()
        .data
        or []
    )


def _upsert_user_profile(supabase, auth_user):
    metadata = auth_user.user_metadata or {}
    email = auth_user.email or ""
    name = (metadata.get("name") or "").strip() or email.split("@")[0]
    username = (metadata.get("username") or "").strip().lower()
    preferred_language = metadata.get("preferred_language") if metadata.get("preferred_language") in ("en", "pidgin") else "en"

    existing = _select_user_profile(supabase, auth_user.id)
    if existing:
        return existing[0]

    try:
        (
            supabase.table("users")
            .insert({
                "id": auth_user.id,
                "email": email,
                "name": name,
                "username": username or None,
                "preferred_language": preferred_language,
            })
            .execute()
        )
    except Exception as exc:
        # Support older databases where username is not available yet.
        if "username" in str(exc):
            (
                supabase.table("users")
                .insert({
                    "id": auth_user.id,
                    "email": email,
                    "name": name,
                    "preferred_language": preferred_language,
                })
                .execute()
            )
        else:
            raise

    created = _select_user_profile(supabase, auth_user.id)
    return (created or [None])[0]


@auth_bp.post("/api/auth/resolve-identifier")
def resolve_identifier():
    try:
        payload = request.get_json(silent=True) or {}
        identifier = (payload.get("identifier") or "").strip()
        if not identifier:
            return jsonify({"error": "Identifier is required."}), 400

        supabase = get_supabase_admin()
        if not supabase:
            return jsonify({"error": "Supabase service role is not configured."}), 503

        candidates = []
        if "@" in identifier:
            candidates = supabase.table("users").select("email").eq("email", identifier).limit(1).execute().data or []
        else:
            normalized = identifier.lower()
            try:
                candidates = (
                    supabase.table("users")
                    .select("email")
                    .or_(f"username.eq.{normalized},matric_number.eq.{identifier},phone.eq.{identifier},email.eq.{identifier}")
                    .limit(1)
                    .execute()
                    .data
                    or []
                )
            except Exception as exc:
                # Support older databases until the fresh-build schema adds users.username.
                if "username" in str(exc) and "does not exist" in str(exc):
                    candidates = _lookup_by_legacy_identifiers(supabase, identifier)
                else:
                    raise

        if not candidates:
            return jsonify({"error": "No account was found for that login ID."}), 404

        return jsonify({"email": candidates[0]["email"]})
    except Exception as exc:
        return jsonify({"error": f"Identifier lookup failed: {exc}"}), 500


@auth_bp.post("/api/auth/bootstrap-user")
def bootstrap_user():
    try:
        token = request.headers.get("Authorization", "").replace("Bearer ", "").strip()
        if not token:
            return jsonify({"error": "Unauthorized"}), 401

        supabase = get_supabase_admin()
        if not supabase:
            return jsonify({"error": "Supabase service role is not configured."}), 503

        auth_user = supabase.auth.get_user(token).user
        if not auth_user:
            return jsonify({"error": "Invalid token"}), 401

        profile = _upsert_user_profile(supabase, auth_user)
        if not profile:
            return jsonify({"error": "Could not create user profile."}), 500

        return jsonify({"profile": profile})
    except Exception as exc:
        return jsonify({"error": f"User bootstrap failed: {exc}"}), 500
