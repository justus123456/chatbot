from flask import Blueprint, current_app, jsonify, request

from api.auth.middleware import require_auth
from api.services.personalization import build_personalization_context, track_activity
from api.services.llm import create_llm
from api.services.rag import RAGService

chat_bp = Blueprint("chat", __name__)

GREETING_MESSAGES = {"hi", "hello", "hey", "good morning", "good afternoon", "good evening"}
CHAT_SOURCES = {"knowledge_base", "llm", "escalated"}
GENERAL_RESPONSE_CACHE = {}
GENERAL_FAST_ANSWERS = {
    "what is water": "Water is a liquid substance made of hydrogen and oxygen (H2O). It is essential for life and is used for drinking, cleaning, farming, and many natural processes.",
}
DOCUMENT_CONTEXT_CHARS = 7000
ESCALATION_COMMANDS = {
    "escalate",
    "escalate it",
    "please escalate",
    "please escalate it",
    "send it to staff",
    "send this to staff",
    "ask staff",
    "ask lecturer",
    "ask my lecturer",
    "ask him",
    "ask her",
    "ask them",
    "please ask him",
    "please ask her",
    "please ask them",
    "tell him",
    "tell her",
    "tell them",
    "send it to him",
    "send it to her",
    "send it to them",
    "send this to him",
    "send this to her",
    "send this to them",
    "please do",
    "do it",
    "do that",
    "yes",
    "yes please",
    "okay",
    "ok",
    "okay do it",
    "ok do it",
    "go ahead",
    "help me ask",
    "help me ask him",
    "help me ask her",
    "help me ask them",
    "help me send it",
    "send am",
    "send it",
    "send it please",
    "escalte",
    "escalte it",
}


def chat_source(source):
    return source if source in CHAT_SOURCES else "llm"


def normalize_message(message):
    return " ".join((message or "").lower().replace("?", "").replace(".", "").strip().split())


def save_chat(supabase, user_id, message, response, source, confidence):
    return (
        supabase.table("chats")
        .insert(
            {
                "user_id": user_id,
                "message": message,
                "response": response,
                "source": chat_source(source),
                "confidence_score": confidence,
            }
        )
        .execute()
        .data
    )


def recent_chat_history(supabase, user_id):
    rows = (
        supabase.table("chats")
        .select("message,response,created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(4)
        .execute()
        .data
        or []
    )
    return list(reversed(rows))


def create_escalation(supabase, user, question, context=""):
    escalation = (
        supabase.table("escalations")
        .insert(
            {
                "user_id": user["id"],
                "user_department": user.get("department"),
                "user_level": user.get("level"),
                "question": question,
                "context": context,
                "status": "pending",
            }
        )
        .execute()
        .data
    )
    return escalation[0] if escalation else None


def last_escalatable_question(history):
    for item in reversed(history or []):
        message = (item.get("message") or "").strip()
        if message and not is_escalation_command(message):
            return message, item.get("response") or ""
    return None, ""


def is_general_non_school_question(message):
    text = normalize_message(message)
    school_terms = {
        "veritas",
        "school",
        "university",
        "department",
        "course",
        "courses",
        "registration",
        "fees",
        "hostel",
        "clearance",
        "calendar",
        "exam",
        "exams",
        "lecturer",
        "supervisor",
        "project",
        "proposal",
        "defence",
        "defense",
        "matric",
        "level",
        "semester",
        "drug",
        "certificate",
        "document",
        "uploaded",
        "note",
        "notes",
        "scoring",
        "guide",
    }
    if any(term in text for term in school_terms):
        return False
    return text.startswith(("what is ", "what are ", "who is ", "define ", "explain ")) and len(text.split()) <= 10


def answer_general_question(message, user, history, personalization_context=None):
    llm = create_llm(current_app.config)
    if not llm.is_configured():
        return None
    return llm.answer(message, "", user, history or [], personalization_context)


def is_uploaded_document_query(message):
    text = normalize_message(message)
    document_markers = {
        "uploaded document",
        "my document",
        "the document",
        "this document",
        "uploaded file",
        "my file",
        "the file",
        "this file",
        "uploaded note",
        "my note",
        "the note",
        "this note",
        "explain this note",
        "explain my note",
        "explain the note",
        "summarize this note",
        "summarize my note",
        "summarise this note",
        "summarise my note",
        "summarize my uploaded document",
        "summarise my uploaded document",
    }
    return any(marker in text for marker in document_markers)


def latest_document_context(supabase, user_id):
    documents = (
        supabase.table("documents")
        .select("id,title,content,created_at,processing_status")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not documents:
        return None, ""

    document = documents[0]
    chunks = (
        supabase.table("document_chunks")
        .select("content,chunk_index")
        .eq("document_id", document["id"])
        .order("chunk_index", desc=False)
        .limit(8)
        .execute()
        .data
        or []
    )
    stored_text = document.get("content") or ""
    chunk_text = "\n\n".join(_strip_document_metadata(chunk.get("content") or "") for chunk in chunks)
    context = "\n\n".join(part for part in [stored_text, chunk_text] if part.strip())
    return document, context[:DOCUMENT_CONTEXT_CHARS]


def _strip_document_metadata(text):
    lines = []
    for line in (text or "").splitlines():
        clean = line.strip()
        if clean.lower().startswith(("document title:", "category:")):
            continue
        lines.append(line)
    return "\n".join(lines).strip()


def _has_readable_document_body(text):
    body = _strip_document_metadata(text)
    letters = [char for char in body if char.isalpha()]
    return len(letters) >= 80


def answer_uploaded_document_question(supabase, message, user, history, personalization_context=None):
    document, context = latest_document_context(supabase, user["id"])
    if not document or not context.strip():
        return None, None
    if not _has_readable_document_body(context):
        return document, None

    llm = create_llm(current_app.config)
    if not llm.is_configured():
        return document, None

    query = (
        f"The student is asking about their latest uploaded document titled '{document.get('title')}'. "
        "The full document context is supplied below. Do not use old chat history or say you do not have the document content. "
        "If the student asks for a summary, give a clear bullet summary. If the student asks to explain it simply, explain the document in plain language.\n\n"
        f"Student request: {message}"
    )
    return document, llm.answer(query, context, user, [], personalization_context)


def is_escalation_command(message):
    normalized = normalize_message(message)
    if normalized in ESCALATION_COMMANDS:
        return True
    return any(
        phrase in normalized
        for phrase in (
            "ask him",
            "ask her",
            "ask them",
            "send it to",
            "send this to",
            "tell him",
            "tell her",
            "tell them",
            "escalate",
            "escalte",
            "help me ask",
            "help me send",
            "send am",
        )
    )


def is_vague_escalation_confirmation(message, history):
    normalized = normalize_message(message)
    vague_confirmations = {
        "please do",
        "do it",
        "do that",
        "yes",
        "yes please",
        "okay",
        "ok",
        "okay do it",
        "ok do it",
        "go ahead",
        "help me",
        "please help me",
        "send it",
        "send am",
    }
    if normalized not in vague_confirmations:
        return False
    last_response = ""
    for item in reversed(history or []):
        if item.get("response"):
            last_response = item.get("response") or ""
            break
    response_text = last_response.lower()
    return any(
        marker in response_text
        for marker in (
            "contact",
            "ask",
            "inquire",
            "confirm",
            "course level adviser",
            "lecturer",
            "school staff",
            "department",
            "couldn't find",
            "could not find",
            "i couldn't find",
            "i could not find",
        )
    )


@chat_bp.post("/api/chat/message")
@require_auth()
def chat_message():
    payload = request.get_json(silent=True) or {}
    message = (payload.get("message") or "").strip()
    if not message:
        return jsonify({"error": "Message is required."}), 400

    track_activity(
        request.supabase,
        request.current_user["id"],
        "chat_query",
        message,
        {
            "department": request.current_user.get("department"),
            "level": request.current_user.get("level"),
        },
    )

    if message.lower() in GREETING_MESSAGES:
        response_text = "Hi. Ask me about registration, fees, hostel, clearance, calendar, or your uploaded documents."
        chat = save_chat(request.supabase, request.current_user["id"], message, response_text, "llm", 1.0)
        return jsonify(
            {
                "message": message,
                "response": response_text,
                "source": "llm",
                "confidence_score": 1.0,
                "id": chat[0]["id"] if chat else None,
                "created_at": chat[0]["created_at"] if chat else None,
                "escalation_id": None,
            }
        )

    if is_general_non_school_question(message):
        cache_key = normalize_message(message)
        response_text = GENERAL_FAST_ANSWERS.get(cache_key) or GENERAL_RESPONSE_CACHE.get(cache_key)
        if not response_text:
            try:
                personalization_context = build_personalization_context(request.supabase, request.current_user)
                response_text = answer_general_question(message, request.current_user, [], personalization_context)
            except Exception:
                response_text = None
            if response_text:
                GENERAL_RESPONSE_CACHE[cache_key] = response_text
        if response_text:
            chat = save_chat(request.supabase, request.current_user["id"], message, response_text, "llm", 1.0)
            return jsonify(
                {
                    "message": message,
                    "response": response_text,
                    "source": "llm",
                    "confidence_score": 1.0,
                    "id": chat[0]["id"] if chat else None,
                    "created_at": chat[0]["created_at"] if chat else None,
                    "escalation_id": None,
                }
            )

    if is_uploaded_document_query(message):
        try:
            personalization_context = build_personalization_context(request.supabase, request.current_user)
            document, response_text = answer_uploaded_document_question(request.supabase, message, request.current_user, [], personalization_context)
        except Exception:
            document, response_text = None, None
        if response_text:
            chat = save_chat(request.supabase, request.current_user["id"], message, response_text, "llm", 1.0)
            return jsonify(
                {
                    "message": message,
                    "response": response_text,
                    "source": "llm",
                    "confidence_score": 1.0,
                    "id": chat[0]["id"] if chat else None,
                    "created_at": chat[0]["created_at"] if chat else None,
                    "escalation_id": None,
                }
            )
        if document is None:
            response_text = "I could not find an uploaded document for your account yet. Please upload the file again, then ask me to summarize it."
            confidence = 0.0
        else:
            response_text = (
                f"I found '{document.get('title')}', but I could not extract enough readable text to summarize or explain it. "
                "If this is a scanned/image PDF, convert it with OCR or upload a text-based PDF/DOCX/TXT version."
            )
            confidence = 0.0
        chat = save_chat(request.supabase, request.current_user["id"], message, response_text, "llm", confidence)
        return jsonify(
            {
                "message": message,
                "response": response_text,
                "source": "llm",
                "confidence_score": confidence,
                "id": chat[0]["id"] if chat else None,
                "created_at": chat[0]["created_at"] if chat else None,
                "escalation_id": None,
            }
        )

    history = recent_chat_history(request.supabase, request.current_user["id"])
    personalization_context = build_personalization_context(request.supabase, request.current_user)
    if is_escalation_command(message) or is_vague_escalation_confirmation(message, history):
        previous_question, previous_response = last_escalatable_question(history)
        if not previous_question:
            response_text = "I can escalate it, but I need the question first. Please ask the question, then type 'escalate it'."
            chat = save_chat(request.supabase, request.current_user["id"], message, response_text, "llm", 1.0)
            return jsonify(
                {
                    "message": message,
                    "response": response_text,
                    "source": "llm",
                    "confidence_score": 1.0,
                    "id": chat[0]["id"] if chat else None,
                    "created_at": chat[0]["created_at"] if chat else None,
                    "escalation_id": None,
                }
            )
        escalation = create_escalation(
            request.supabase,
            request.current_user,
            previous_question,
            f"Student asked to escalate this previous chat. Previous assistant response: {previous_response}",
        )
        response_text = "Done. I have escalated your previous question to school staff so they can respond with the correct information."
        chat = save_chat(request.supabase, request.current_user["id"], message, response_text, "escalated", 1.0)
        return jsonify(
            {
                "message": message,
                "response": response_text,
                "source": "escalated",
                "confidence_score": 1.0,
                "id": chat[0]["id"] if chat else None,
                "created_at": chat[0]["created_at"] if chat else None,
                "escalation_id": escalation.get("id") if escalation else None,
            }
        )

    rag = RAGService(request.supabase)
    result = rag.retrieve_and_respond(message, request.current_user, history, personalization_context)
    escalation_id = None

    if result["should_escalate"]:
        escalation = create_escalation(
            request.supabase,
            request.current_user,
            message,
            "\n\n".join(chunk.get("content", "") for chunk in result.get("chunks", [])),
        )
        if escalation:
            escalation_id = escalation["id"]

    response_text = result["response"] or "I could not answer that confidently, so I have escalated it to school staff."
    source = "escalated" if escalation_id else chat_source(result["source"])
    chat = save_chat(
        request.supabase,
        request.current_user["id"],
        message,
        response_text,
        source,
        result["confidence"],
    )

    return jsonify(
        {
            "message": message,
            "response": response_text,
            "source": source,
            "confidence_score": result["confidence"],
            "id": chat[0]["id"] if chat else None,
            "created_at": chat[0]["created_at"] if chat else None,
            "escalation_id": escalation_id,
        }
    )


@chat_bp.get("/api/chat/history")
@require_auth()
def chat_history():
    chats = (
        request.supabase.table("chats")
        .select("id,message,response,source,confidence_score,created_at")
        .eq("user_id", request.current_user["id"])
        .order("created_at", desc=False)
        .limit(50)
        .execute()
        .data
        or []
    )
    return jsonify({"data": chats})


@chat_bp.delete("/api/chat/history/<chat_id>")
@require_auth()
def delete_chat(chat_id):
    request.supabase.table("chats").delete().eq("id", chat_id).eq("user_id", request.current_user["id"]).execute()
    return jsonify({"ok": True})
