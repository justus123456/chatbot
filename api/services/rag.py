from flask import current_app

from api.services.embeddings import EmbeddingService
from api.services.llm import GroqLLM


LOW_CONFIDENCE = 0.55
BORDERLINE_CONFIDENCE = 0.6


class RAGService:
    def __init__(self, supabase):
        self.supabase = supabase
        self.embeddings = EmbeddingService(current_app.config)
        self.llm = GroqLLM(current_app.config["GROQ_API_KEY"], current_app.config["GROQ_MODEL"])

    def retrieve_and_respond(self, query, user):
        query_embedding = self.embeddings.embed(query)
        chunks = self.supabase.rpc(
            "search_chunks",
            {
                "query_embedding": query_embedding,
                "user_department": user.get("department"),
                "user_level": int(user.get("level") or 0) or None,
                "match_count": 5,
            },
        ).execute().data or []

        if not chunks:
            return {"response": None, "confidence": 0.0, "source": "escalated", "chunks": [], "should_escalate": True}

        confidence = float(chunks[0].get("similarity") or 0)
        if confidence < LOW_CONFIDENCE:
            return {"response": None, "confidence": confidence, "source": "escalated", "chunks": chunks, "should_escalate": True}

        context = "\n\n".join(chunk["content"] for chunk in chunks)
        if not self.llm.is_configured():
            return {
                "response": None,
                "confidence": confidence,
                "source": "escalated",
                "chunks": chunks,
                "should_escalate": True,
                "error": "Groq API key is not configured.",
            }

        try:
            response = self.llm.answer(query, context, user)
        except Exception as exc:
            return {
                "response": None,
                "confidence": confidence,
                "source": "escalated",
                "chunks": chunks,
                "should_escalate": True,
                "error": str(exc),
            }

        return {
            "response": response,
            "confidence": confidence,
            "source": "llm",
            "chunks": chunks,
            "should_escalate": confidence < BORDERLINE_CONFIDENCE,
        }
