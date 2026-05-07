from groq import Groq


class GroqLLM:
    def __init__(self, api_key, model):
        self.model = model
        self.client = Groq(api_key=api_key) if api_key else None

    def is_configured(self):
        return self.client is not None

    def answer(self, query, context, user):
        if not self.client:
            raise RuntimeError("Groq API key is not configured.")

        system = (
            "You are SmartCampus AI for Veritas University. Answer only with the supplied context. "
            "If the answer is not in the context, say the question should be escalated to school staff."
        )
        user_prompt = (
            f"Student profile: department={user.get('department')}, level={user.get('level')}\n\n"
            f"Context:\n{context}\n\nQuestion: {query}"
        )
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user_prompt}],
            temperature=0.2,
        )
        return response.choices[0].message.content
