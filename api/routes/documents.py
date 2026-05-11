from flask import Blueprint, current_app, jsonify, request

from api.auth.middleware import require_auth
from api.services.documents import chunk_text, extract_text
from api.services.embeddings import EmbeddingService
from api.services.personalization import track_activity
from api.services.whatsapp_import import export_to_knowledge_text, parse_export

documents_bp = Blueprint("documents", __name__)


@documents_bp.post("/api/documents/upload")
@require_auth()
def upload_document():
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "A document file is required."}), 400

    department = request.form.get("department") or request.current_user.get("department") or "all"
    level_raw = request.form.get("level") or request.current_user.get("level")
    level = int(level_raw) if str(level_raw or "").isdigit() else None
    title = request.form.get("title") or file.filename
    category = request.form.get("category") or "knowledge"
    source_type = request.form.get("source_type") or "upload"

    text = extract_text(file)
    whatsapp_messages = []
    if source_type == "whatsapp_export":
        whatsapp_messages = parse_export(text)
        text = export_to_knowledge_text(whatsapp_messages)

    chunks = chunk_text(text)
    if not text.strip() or not chunks:
        return jsonify({"error": "I could not read any searchable text from this file. Try a text-based PDF/DOCX, or paste the content as TXT."}), 400
    document = (
        request.supabase.table("documents")
        .insert(
            {
                "user_id": request.current_user["id"],
                "title": title,
                "file_url": None,
                "content": text[:8000],
                "category": category,
                "processing_status": "ready",
            }
        )
        .execute()
        .data
    )
    if not document:
        return jsonify({"error": "Could not create document record."}), 500

    embedding_service = EmbeddingService(current_app.config)
    records = []
    for index, chunk in enumerate(chunks):
        records.append(
            {
                "document_id": document[0]["id"],
                "content": f"Document title: {title}\nCategory: {category}\n\n{chunk}",
                "chunk_index": index,
                "embedding": embedding_service.embed(chunk),
                "department": department,
                "level": level,
            }
        )

    if records:
        request.supabase.table("document_chunks").insert(records).execute()

    if whatsapp_messages:
        log_rows = [
            {
                "phone_number": "official_whatsapp_export",
                "direction": "inbound",
                "message": item.get("message") or "",
                "raw_payload": {
                    "date": item.get("date"),
                    "time": item.get("time"),
                    "sender": item.get("sender"),
                    "archive_title": title,
                    "document_id": document[0]["id"],
                    "department": department,
                    "level": level,
                },
                "response_source": "imported_archive_indexed",
                "confidence_score": 1.0,
            }
            for item in whatsapp_messages
            if item.get("message")
        ]
        for start in range(0, len(log_rows), 500):
            request.supabase.table("whatsapp_messages").insert(log_rows[start:start + 500]).execute()

    track_activity(
        request.supabase,
        request.current_user["id"],
        "document_upload",
        title,
        {
            "category": category,
            "source_type": source_type,
            "department": department,
            "level": level,
            "chunks_created": len(records),
            "whatsapp_messages": len(whatsapp_messages),
        },
    )

    return jsonify({"document": document[0], "chunks_created": len(records), "whatsapp_messages": len(whatsapp_messages)}), 201
