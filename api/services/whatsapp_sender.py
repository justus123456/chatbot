import json
from urllib import request


class WhatsAppSender:
    def __init__(self, access_token, phone_number_id):
        self.access_token = access_token
        self.phone_number_id = phone_number_id

    def is_configured(self):
        return bool(self.access_token and self.phone_number_id)

    def send_text(self, to_phone_number, text):
        if not self.is_configured():
            return {"ok": False, "skipped": True, "reason": "WhatsApp credentials are not configured."}

        payload = {
            "messaging_product": "whatsapp",
            "to": to_phone_number,
            "type": "text",
            "text": {"body": text},
        }
        req = request.Request(
            f"https://graph.facebook.com/v19.0/{self.phone_number_id}/messages",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.access_token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
