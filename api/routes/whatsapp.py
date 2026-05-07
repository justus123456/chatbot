from flask import Blueprint, current_app, jsonify, request

from api.auth.middleware import get_supabase_admin
from api.services.rag import RAGService
from api.services.whatsapp import parse_whatsapp_payload
from api.services.whatsapp_sender import WhatsAppSender

whatsapp_bp = Blueprint("whatsapp", __name__)


@whatsapp_bp.get("/api/webhooks/whatsapp")
def verify_whatsapp_webhook():
    mode = request.args.get("hub.mode")
    token = request.args.get("hub.verify_token")
    challenge = request.args.get("hub.challenge")
    if mode == "subscribe" and token == current_app.config["WHATSAPP_VERIFY_TOKEN"]:
        return challenge or "", 200
    return jsonify({"error": "Invalid verification token."}), 403


@whatsapp_bp.post("/api/webhooks/whatsapp")
def receive_whatsapp_message():
    supabase = get_supabase_admin()
    if not supabase:
        return jsonify({"error": "Supabase service role is not configured."}), 503

    messages = parse_whatsapp_payload(request.get_json(silent=True) or {})
    stored = []
    outbound = []
    for message in messages:
        phone = message["phone_number"]
        user = supabase.table("users").select("*").eq("phone", phone).limit(1).execute().data
        profile = user[0] if user else None
        thread = supabase.table("whatsapp_threads").upsert(
            {"phone_number": phone, "user_id": profile["id"] if profile else None},
            on_conflict="phone_number",
        ).execute().data

        rag_result = {"response": None, "confidence": 0.0, "source": "escalated", "should_escalate": True}
        if profile:
            rag_result = RAGService(supabase).retrieve_and_respond(message["text"], profile)
        response_text = rag_result.get("response") or (
            "Thanks for your message. I could not answer confidently, so this has been sent to school staff."
        )

        record = supabase.table("whatsapp_messages").insert(
            {
                "thread_id": thread[0]["id"] if thread else None,
                "user_id": profile["id"] if profile else None,
                "phone_number": phone,
                "direction": "inbound",
                "message": message["text"],
                "raw_payload": message["raw_payload"],
                "response_source": rag_result["source"],
                "confidence_score": rag_result["confidence"],
            }
        ).execute().data
        stored.extend(record or [])

        outbound_record = supabase.table("whatsapp_messages").insert(
            {
                "thread_id": thread[0]["id"] if thread else None,
                "user_id": profile["id"] if profile else None,
                "phone_number": phone,
                "direction": "outbound",
                "message": response_text,
                "raw_payload": {},
                "response_source": rag_result["source"],
                "confidence_score": rag_result["confidence"],
            }
        ).execute().data
        outbound.extend(outbound_record or [])

        sender = WhatsAppSender(current_app.config["WHATSAPP_ACCESS_TOKEN"], current_app.config["WHATSAPP_PHONE_NUMBER_ID"])
        if sender.is_configured():
            sender.send_text(phone, response_text)

    return jsonify({"ok": True, "messages_received": len(messages), "stored": stored, "outbound": outbound})
