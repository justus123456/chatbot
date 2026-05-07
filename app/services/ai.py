import json
from urllib import error, request

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover
    OpenAI = None


class AIService:
    def __init__(self, config, data_repo, localization):
        self.data_repo = data_repo
        self.localization = localization
        self.provider = (config.get("AI_PROVIDER") or "auto").strip().lower()
        self.openai_model = config["OPENAI_MODEL"]
        self.ollama_base_url = (config.get("OLLAMA_BASE_URL") or "http://127.0.0.1:11434").rstrip("/")
        self.ollama_model = (config.get("OLLAMA_MODEL") or "").strip()
        self.ollama_timeout = int(config.get("OLLAMA_TIMEOUT") or 180)
        api_key = (config.get("OPENAI_API_KEY") or "").strip()
        self.openai_client = OpenAI(api_key=api_key) if api_key and OpenAI else None

    def answer_question(self, user, message, language, access_token=None):
        matches = self.data_repo.search_knowledge(message, language=language, access_token=access_token)
        if matches and matches[0]["score"] >= 2:
            response = self._format_knowledge_response(matches[:3], language)
            return {"answer": response, "source": "knowledge_base", "matches": matches[:3]}

        if not self._has_fallback_provider():
            fallback = self._local_fallback(language)
            return {"answer": fallback, "source": "ai_unavailable", "matches": []}

        context = "\n".join(f"- {item['title']}: {item['content']}" for item in matches[:3])

        try:
            answer, source = self._generate_fallback_answer(user, message, language, context)
            return {"answer": answer, "source": source, "matches": matches[:3]}
        except Exception as exc:
            return {
                "answer": self._runtime_fallback(language, exc),
                "source": "ai_unavailable",
                "matches": matches[:3],
            }

    def _has_fallback_provider(self):
        if self.provider == "ollama":
            return bool(self.ollama_model)
        if self.provider == "openai":
            return self.openai_client is not None
        return bool(self.ollama_model) or self.openai_client is not None

    def _generate_fallback_answer(self, user, message, language, context):
        if self.provider == "ollama":
            return self._answer_with_ollama(user, message, language, context), "ai_fallback"
        if self.provider == "openai":
            return self._answer_with_openai(user, message, language, context), "ai_fallback"
        if self.ollama_model:
            return self._answer_with_ollama(user, message, language, context), "ai_fallback"
        if self.openai_client:
            return self._answer_with_openai(user, message, language, context), "ai_fallback"
        raise RuntimeError("No AI provider is available.")

    def _answer_with_openai(self, user, message, language, context):
        if not self.openai_client:
            raise RuntimeError("OpenAI client is unavailable.")
        result = self.openai_client.responses.create(
            model=self.openai_model,
            input=[
                {"role": "system", "content": self._system_prompt(language)},
                {
                    "role": "user",
                    "content": f"Student name: {user['name']}\nLanguage: {language}\nKnown context:\n{context or 'None'}\nQuestion: {message}",
                },
            ],
        )
        return result.output_text

    def _answer_with_ollama(self, user, message, language, context):
        payload = {
            "model": self.ollama_model,
            "stream": False,
            "messages": [
                {"role": "system", "content": self._system_prompt(language)},
                {
                    "role": "user",
                    "content": f"Student name: {user['name']}\nLanguage: {language}\nKnown context:\n{context or 'None'}\nQuestion: {message}",
                },
            ],
        }
        req = request.Request(
            f"{self.ollama_base_url}/api/chat",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=self.ollama_timeout) as response:
                data = json.loads(response.read().decode("utf-8"))
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace").strip()
            raise RuntimeError(detail or f"Ollama HTTP {exc.code}") from exc
        except error.URLError as exc:
            reason = getattr(exc, "reason", exc)
            raise RuntimeError(f"Could not reach Ollama at {self.ollama_base_url}: {reason}") from exc

        answer = (data.get("message") or {}).get("content", "").strip()
        if not answer:
            raise RuntimeError("Ollama returned an empty response.")
        return answer

    def _format_knowledge_response(self, matches, language):
        intro = (
            "Here's what I found from the university knowledge base:"
            if language == "en"
            else "See wetin I find from the school info wey dey inside system:"
        )
        lines = [intro]
        for match in matches:
            lines.append(f"- {match['title']}: {match['content']}")
        return "\n".join(lines)

    def _local_fallback(self, language):
        if language == "pidgin":
            return (
                "I no see exact answer for that one from the school database, and AI fallback never dey configured yet. "
                "Abeg check with Student Affairs or add the missing info from the admin panel."
            )
        return (
            "I could not find a precise answer in the school database, and the AI fallback is not configured yet. "
            "Please contact Student Affairs or add the missing information through the admin panel."
        )

    def _runtime_fallback(self, language, exc):
        error_text = str(exc).strip() or exc.__class__.__name__
        if language == "pidgin":
            return (
                "I no see exact answer for the school database, and the AI fallback get temporary problem just now. "
                f"Provider error: {error_text}. Abeg confirm your model name, local server or API setup, then try again."
            )
        return (
            "I could not find a precise answer in the school database, and the AI fallback ran into a temporary problem. "
            f"Provider error: {error_text}. Please check your model name, local server or API setup, then try again."
        )

    def _system_prompt(self, language):
        if language == "pidgin":
            return (
                "You are a Veritas University student support assistant. Answer in clear Nigerian Pidgin. "
                "Use official context first, avoid making up school policies, and tell the student when human staff should confirm details."
            )
        return (
            "You are a Veritas University student support assistant. Answer clearly in English. "
            "Use official institutional context first, avoid inventing policies, and recommend staff confirmation when details may be time-sensitive."
        )
