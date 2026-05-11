import json
from urllib import request

from groq import Groq


class GroqLLM:
    def __init__(self, api_key, model):
        self.model = model
        self.client = Groq(api_key=api_key) if api_key else None

    def is_configured(self):
        return self.client is not None

    def answer(self, query, context, user, history=None, personalization_context=None):
        if not self.client:
            raise RuntimeError("Groq API key is not configured.")

        system = build_system_prompt(has_context=bool(context))
        recent_history = format_history(history)
        user_prompt = (
            f"{format_profile(user)}\n\n"
            f"{personalization_context or ''}\n\n"
            f"{recent_history}"
            f"{'Context:' if context else 'No matching school context was found.'}\n{context}\n\nQuestion: {query}"
        )
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user_prompt}],
            temperature=0.2,
            max_tokens=500,
        )
        return response.choices[0].message.content


class OllamaLLM:
    def __init__(self, base_url, model, timeout=180):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout

    def is_configured(self):
        return bool(self.base_url and self.model)

    def answer(self, query, context, user, history=None, personalization_context=None):
        if not self.is_configured():
            raise RuntimeError("Ollama model is not configured.")

        recent_history = format_history(history)
        payload = json.dumps(
            {
                "model": self.model,
                "stream": False,
                "messages": [
                    {"role": "system", "content": build_system_prompt(has_context=bool(context))},
                    {
                        "role": "user",
                        "content": (
                            f"{format_profile(user)}\n\n"
                            f"{personalization_context or ''}\n\n"
                            f"{recent_history}"
                            f"{'Context:' if context else 'No matching school context was found.'}\n{context}\n\nQuestion: {query}"
                        ),
                    },
                ],
                "options": {"num_predict": 450, "temperature": 0.2},
            }
        ).encode("utf-8")
        req = request.Request(
            f"{self.base_url}/api/chat",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with request.urlopen(req, timeout=self.timeout) as response:
            data = json.loads(response.read().decode("utf-8"))
        return data.get("message", {}).get("content", "").strip()


def create_llm(config):
    provider = config["AI_PROVIDER"].strip().lower()
    if provider == "ollama":
        return OllamaLLM(config["OLLAMA_BASE_URL"], config["OLLAMA_MODEL"], config["OLLAMA_TIMEOUT"])
    return GroqLLM(config["GROQ_API_KEY"], config["GROQ_MODEL"])


def build_system_prompt(has_context):
    if has_context:
        return (
            "You are SmartCampus AI for Veritas University. Use the supplied school context first. "
            "Personalize gently using the student's profile, preferred language, preferred tone, recent goals, uploaded-document focus, and upcoming deadlines when relevant. "
            "Do not mention private behavior unless it directly helps the student. "
            "Answer concisely in 3 to 6 sentences unless the student asks for detailed steps. "
            "For school-specific questions, answer only from the supplied context and recent conversation. "
            "Do not use general outside knowledge for Veritas-specific policies, dates, deadlines, exams, seminars, registration, or departmental instructions. "
            "When a date appears, include the full date and year if available. If the context has old, conflicting, or incomplete information, say exactly what the archive shows and ask the student to confirm the latest update with the department or school staff. "
            "If the student challenges a previous answer, acknowledge it and do not repeat the old date as current unless the context proves it is current."
        )
    return (
        "You are SmartCampus AI for Veritas University. No matching school context was found for this question. "
        "Use the student's preferred language and tone. "
        "Answer briefly. "
        "For official school-specific procedures, dates, deadlines, exams, seminars, registration, fees, or departmental instructions, do not give a general answer. "
        "Say that no matching official school context was found and ask the student to check announcements or confirm with the appropriate school office. "
        "Only answer general non-school questions when the question is clearly not asking about Veritas University."
    )


def format_history(history):
    if not history:
        return ""
    lines = ["Recent conversation:"]
    for item in history[-4:]:
        if item.get("message"):
            lines.append(f"Student: {item['message']}")
        if item.get("response"):
            lines.append(f"Assistant: {item['response']}")
    return "\n".join(lines) + "\n\n"


def format_profile(user):
    language = user.get("preferred_language") or "en"
    tone = user.get("preferred_tone") or "simple"
    language_label = "Nigerian Pidgin English" if language == "pidgin" else "standard English"
    tone_label = "short key points" if tone == "simple" else "full structured explanation"
    return (
        "Student profile: "
        f"name={user.get('name')}, department={user.get('department')}, level={user.get('level')}, "
        f"preferred_language={language_label}, preferred_tone={tone_label}"
    )
