import json
import re

from flask import Blueprint, current_app, jsonify, request

from api.auth.middleware import require_auth
from api.services.llm import create_llm

planner_bp = Blueprint("planner", __name__)


@planner_bp.get("/api/planner")
@require_auth()
def planner_state():
    notes = (
        request.supabase.table("documents")
        .select("id,title,content,created_at")
        .eq("user_id", request.current_user["id"])
        .eq("category", "note")
        .order("created_at", desc=True)
        .limit(20)
        .execute()
        .data
        or []
    )
    flashcards = (
        request.supabase.table("flashcards")
        .select("id,question,answer,source,difficulty,created_at")
        .eq("user_id", request.current_user["id"])
        .order("created_at", desc=True)
        .limit(100)
        .execute()
        .data
        or []
    )
    return jsonify({"notes": notes, "flashcards": flashcards})


@planner_bp.post("/api/planner/notes")
@require_auth()
def save_note():
    payload = request.get_json(silent=True) or {}
    content = (payload.get("content") or "").strip()
    title = (payload.get("title") or "Study note").strip()
    if not content:
        return jsonify({"error": "Note content is required."}), 400

    note = (
        request.supabase.table("documents")
        .insert(
            {
                "user_id": request.current_user["id"],
                "title": title,
                "content": content,
                "category": "note",
                "processing_status": "ready",
            }
        )
        .execute()
        .data
    )
    return jsonify({"note": note[0] if note else None}), 201


@planner_bp.post("/api/planner/ai")
@require_auth()
def planner_ai():
    payload = request.get_json(silent=True) or {}
    notes = (payload.get("notes") or "").strip()
    mode = (payload.get("mode") or "").strip()
    if not notes:
        return jsonify({"error": "Notes are required."}), 400
    if mode not in {"summary", "flashcards"}:
        return jsonify({"error": "Planner mode must be summary or flashcards."}), 400

    llm = create_llm(current_app.config)
    if not llm.is_configured():
        return jsonify({"error": "AI provider is not configured."}), 503

    if mode == "summary":
        prompt = (
            "Summarize only the study notes below. Do not introduce unrelated topics. "
            "Use concise bullets and keep the language student-friendly.\n\n"
            f"Study notes:\n{notes}"
        )
        return jsonify({"summary": llm.answer(prompt, "", request.current_user)})

    prompt = (
        "Create flashcards only from the study notes below. Do not use outside examples, programming examples, or unrelated topics unless they appear in the notes. "
        "Return only valid JSON, no markdown, no explanation. Format: "
        '[{"front":"question from the notes","back":"answer from the notes"}]. '
        "Create 6 to 10 cards if the notes contain enough material; otherwise create only as many useful cards as possible.\n\n"
        f"Study notes:\n{notes}"
    )
    raw = llm.answer(prompt, "", request.current_user)
    cards = parse_flashcards(raw)
    if not cards:
        return jsonify({"error": "The AI did not return usable flashcards. Add more detailed notes and try again."}), 422
    return jsonify({"flashcards": cards})


@planner_bp.post("/api/planner/flashcards")
@require_auth()
def save_flashcards():
    payload = request.get_json(silent=True) or {}
    cards = payload.get("flashcards") or []
    if not isinstance(cards, list) or not cards:
        return jsonify({"error": "At least one flashcard is required."}), 400

    records = []
    for card in cards:
        question = (card.get("front") or card.get("question") or "").strip()
        answer = (card.get("back") or card.get("answer") or "").strip()
        if question and answer:
            records.append(
                {
                    "user_id": request.current_user["id"],
                    "question": question,
                    "answer": answer,
                    "source": payload.get("source") or "planner",
                    "difficulty": card.get("difficulty") or "medium",
                }
            )

    if not records:
        return jsonify({"error": "Flashcards must have a question and answer."}), 400

    saved = request.supabase.table("flashcards").insert(records).execute().data
    return jsonify({"flashcards": saved or []}), 201


@planner_bp.delete("/api/planner/flashcards/<flashcard_id>")
@require_auth()
def delete_flashcard(flashcard_id):
    request.supabase.table("flashcards").delete().eq("id", flashcard_id).eq("user_id", request.current_user["id"]).execute()
    return jsonify({"ok": True})


def parse_flashcards(text):
    match = re.search(r"\[[\s\S]*\]", text or "")
    if not match:
        return []
    try:
        parsed = json.loads(match.group(0))
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []

    cards = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        front = str(item.get("front") or item.get("question") or "").strip()
        back = str(item.get("back") or item.get("answer") or "").strip()
        if front and back:
            cards.append({"front": front, "back": back})
    return cards
