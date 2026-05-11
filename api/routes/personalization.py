from flask import Blueprint, jsonify, request

from api.auth.middleware import require_auth
from api.services.personalization import build_chat_suggestions, build_personalization_context

personalization_bp = Blueprint("personalization", __name__)


@personalization_bp.get("/api/personalization/context")
@require_auth()
def personalization_context():
    return jsonify({"context": build_personalization_context(request.supabase, request.current_user)})


@personalization_bp.get("/api/personalization/chat-suggestions")
@require_auth()
def chat_suggestions():
    return jsonify(build_chat_suggestions(request.supabase, request.current_user))
