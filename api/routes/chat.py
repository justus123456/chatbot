from flask import Blueprint, jsonify, request

from api.auth.middleware import require_auth
from api.services.rag import RAGService

chat_bp = Blueprint("chat", __name__)

GREETING_MESSAGES = {"hi", "hello", "hey", "good morning", "good afternoon", "good evening"}


@chat_bp.post("/api/chat/message")
@require_auth()
def chat_message():
    payload = request.get_json(silent=True) or {}
    message = (payload.get("message") or "").strip()
    if not message:
        return jsonify({"error": "Message is required."}), 400

    if message.lower() in GREETING_MESSAGES:
        response_text = "Hi. Ask me about registration, fees, hostel, clearance, calendar, or your uploaded documents."
        chat = (
            request.supabase.table("chats")
            .insert(
                {
                    "user_id": request.current_user["id"],
                    "message": message,
                    "response": response_text,
                    "source": "assistant",
                    "confidence_score": 1.0,
                    "escalation_id": None,
                }
            )
            .execute()
            .data
        )
        return jsonify(
            {
                "message": message,
                "response": response_text,
                "source": "assistant",
                "confidence_score": 1.0,
                "created_at": chat[0]["created_at"] if chat else None,
                "escalation_id": None,
            }
        )

    rag = RAGService(request.supabase)
    result = rag.retrieve_and_respond(message, request.current_user)
    escalation_id = None

    if result["should_escalate"]:
        escalation = (
            request.supabase.table("escalations")
            .insert(
                {
                    "user_id": request.current_user["id"],
                    "user_department": request.current_user.get("department"),
                    "user_level": request.current_user.get("level"),
                    "question": message,
                    "context": "\n\n".join(chunk.get("content", "") for chunk in result.get("chunks", [])),
                    "status": "pending",
                }
            )
            .execute()
            .data
        )
        if escalation:
            escalation_id = escalation[0]["id"]

    response_text = result["response"] or "I could not answer that confidently, so I have escalated it to school staff."
    chat = (
        request.supabase.table("chats")
        .insert(
            {
                "user_id": request.current_user["id"],
                "message": message,
                "response": response_text,
                "source": "escalated" if escalation_id else result["source"],
                "confidence_score": result["confidence"],
                "escalation_id": escalation_id,
            }
        )
        .execute()
        .data
    )

    return jsonify(
        {
            "message": message,
            "response": response_text,
            "source": "escalated" if escalation_id else result["source"],
            "confidence_score": result["confidence"],
            "created_at": chat[0]["created_at"] if chat else None,
            "escalation_id": escalation_id,
        }
    )
