from flask import current_app

from api.services.embeddings import EmbeddingService
from api.services.llm import create_llm


LOW_CONFIDENCE = 0.55
BORDERLINE_CONFIDENCE = 0.6
MATCH_COUNT = 3
MAX_CONTEXT_CHARS = 3500


class RAGService:
    def __init__(self, supabase):
        self.supabase = supabase
        self.embeddings = EmbeddingService(current_app.config)
        self.llm = create_llm(current_app.config)

    def retrieve_and_respond(self, query, user, history=None, personalization_context=None):
        keyword_chunks = self._keyword_search_chunks(query, user, MATCH_COUNT)
        if keyword_chunks:
            chunks = keyword_chunks
            self._log_retrievals(user, chunks)
            confidence = float(chunks[0].get("similarity") or 0.72)
            context = self._context_from_chunks(chunks)
            if not self.llm.is_configured():
                return {
                    "response": None,
                    "confidence": confidence,
                    "source": "escalated",
                    "chunks": chunks,
                    "should_escalate": True,
                    "error": "LLM API key is not configured.",
                }
            try:
                response = self.llm.answer(query, context, user, history, personalization_context)
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
                "should_escalate": False,
            }

        try:
            query_embedding = self.embeddings.embed(self._search_query(query, history))
            chunks = self.supabase.rpc(
                "search_chunks",
                {
                    "query_embedding": query_embedding,
                    "user_department": user.get("department"),
                    "user_level": int(user.get("level") or 0) or None,
                    "match_count": MATCH_COUNT,
                },
            ).execute().data or []
            chunks = self._merge_chunks(chunks, self._keyword_search_chunks(query, user, MATCH_COUNT))
            self._log_retrievals(user, chunks)
        except Exception as exc:
            return {
                "response": (
                    "I cannot search the school knowledge base right now because the embedding service is unavailable. "
                    "Start Ollama on this computer, or change EMBEDDING_PROVIDER to fake for local testing."
                ),
                "confidence": 0.0,
                "source": "embedding_unavailable",
                "chunks": [],
                "should_escalate": False,
                "error": str(exc),
            }

        if not chunks:
            return self._fallback_answer(query, user, [], 0.0, history, personalization_context)

        confidence = float(chunks[0].get("similarity") or 0)
        if confidence < LOW_CONFIDENCE:
            return self._fallback_answer(query, user, chunks, confidence, history, personalization_context)

        context = self._context_from_chunks(chunks)
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
            response = self.llm.answer(query, context, user, history, personalization_context)
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
            "should_escalate": False,
        }

    def _log_retrievals(self, user, chunks):
        if not chunks:
            return
        rows = []
        for chunk in chunks:
            rows.append(
                {
                    "user_id": user.get("id"),
                    "knowledge_base_id": chunk.get("knowledge_base_id") or None,
                    "document_chunk_id": chunk.get("id") if chunk.get("document_id") else None,
                    "similarity": float(chunk.get("similarity") or 0),
                }
            )
        try:
            self.supabase.table("knowledge_retrievals").insert(rows).execute()
        except Exception:
            pass

    def _fallback_answer(self, query, user, chunks, confidence, history=None, personalization_context=None):
        if not self.llm.is_configured():
            return {"response": None, "confidence": confidence, "source": "escalated", "chunks": chunks, "should_escalate": True}

        context = self._context_from_chunks(chunks[:MATCH_COUNT])
        try:
            response = self.llm.answer(query, context, user, history, personalization_context)
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
            "confidence": max(confidence, 0.3),
            "source": "llm",
            "chunks": chunks,
            "should_escalate": False,
        }

    def _search_query(self, query, history=None):
        words = query.split()
        lower = query.lower()
        follow_up_markers = {
            "that",
            "it",
            "this",
            "there",
            "him",
            "her",
            "them",
            "those",
            "last",
            "current",
            "latest",
            "what about",
            "how do i",
        }
        is_follow_up = len(words) <= 8 or any(marker in lower for marker in follow_up_markers)
        if not is_follow_up or not history:
            return query
        recent = []
        for item in history[-3:]:
            if item.get("message"):
                recent.append(item["message"])
            if item.get("response"):
                recent.append(item["response"][:300])
        return "\n".join(recent + [query])

    def _context_from_chunks(self, chunks):
        context = "\n\n".join((chunk.get("content") or "")[:1200] for chunk in chunks[:MATCH_COUNT])
        return context[:MAX_CONTEXT_CHARS]

    def _keyword_search_chunks(self, query, user, limit=3):
        words = [
            word.strip(".,?!:;\"'()[]").lower()
            for word in (query or "").split()
        ]
        stop_words = {
            "what",
            "where",
            "when",
            "which",
            "who",
            "how",
            "the",
            "and",
            "for",
            "from",
            "about",
            "this",
            "that",
            "does",
            "with",
        }
        keywords = [word for word in words if len(word) >= 4 and word not in stop_words]
        if not keywords:
            return []

        rows = []
        for keyword in keywords[:3]:
            try:
                found = (
                    self.supabase.table("document_chunks")
                    .select("id,document_id,content,department,level")
                    .ilike("content", f"%{keyword}%")
                    .limit(10)
                    .execute()
                    .data
                    or []
                )
            except Exception:
                found = []
            rows.extend(found)

        user_department = (user.get("department") or "").lower()
        user_level = int(user.get("level") or 0) or None
        filtered = []
        seen = set()
        for row in rows:
            row_id = row.get("id")
            if not row_id or row_id in seen:
                continue
            department = (row.get("department") or "all").lower()
            level = row.get("level")
            department_ok = department in {"all", ""} or department == user_department
            level_ok = level in (None, user_level)
            if department_ok and level_ok:
                seen.add(row_id)
                row["similarity"] = max(0.72, float(row.get("similarity") or 0))
                filtered.append(row)
            if len(filtered) >= limit:
                break
        return filtered

    def _merge_chunks(self, primary, fallback):
        merged = []
        seen = set()
        for chunk in [*(primary or []), *(fallback or [])]:
            chunk_id = chunk.get("id")
            if chunk_id and chunk_id in seen:
                continue
            if chunk_id:
                seen.add(chunk_id)
            merged.append(chunk)
        return merged[:MATCH_COUNT]
