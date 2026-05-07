def parse_whatsapp_payload(payload):
    entries = payload.get("entry", [])
    messages = []
    for entry in entries:
        for change in entry.get("changes", []):
            value = change.get("value", {})
            for message in value.get("messages", []):
                messages.append(
                    {
                        "message_id": message.get("id"),
                        "phone_number": message.get("from"),
                        "text": (message.get("text") or {}).get("body", ""),
                        "raw_payload": message,
                    }
                )
    return messages
