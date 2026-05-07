import hashlib
import json
from urllib import request


class EmbeddingService:
    def __init__(self, config):
        self.provider = config["EMBEDDING_PROVIDER"]
        self.ollama_base_url = config["OLLAMA_BASE_URL"]
        self.ollama_model = config["OLLAMA_EMBED_MODEL"]

    def embed(self, text):
        if self.provider == "ollama":
            return self._embed_ollama(text)
        return self._stable_fake_embedding(text)

    def _embed_ollama(self, text):
        payload = json.dumps({"model": self.ollama_model, "prompt": text}).encode("utf-8")
        req = request.Request(
            f"{self.ollama_base_url}/api/embeddings",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with request.urlopen(req, timeout=60) as response:
            data = json.loads(response.read().decode("utf-8"))
        return data["embedding"]

    def _stable_fake_embedding(self, text):
        digest = hashlib.sha256(text.encode("utf-8")).digest()
        values = []
        while len(values) < 768:
            for byte in digest:
                values.append((byte / 255.0) - 0.5)
                if len(values) == 768:
                    break
            digest = hashlib.sha256(digest).digest()
        return values
