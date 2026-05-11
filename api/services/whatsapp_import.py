import re


WHATSAPP_LINE = re.compile(
    r"^\[?(\d{1,2}/\d{1,2}/\d{2,4}),?\s+(\d{1,2}:\d{2}(?:\s?[AP]M)?)\]?\s+-\s+([^:]+):\s+(.*)$",
    re.IGNORECASE,
)


def parse_export(text):
    """Parse a WhatsApp txt export into message dictionaries.

    WhatsApp exports vary by phone locale, so unmatched continuation lines are
    appended to the previous message instead of being discarded.
    """
    messages = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        match = WHATSAPP_LINE.match(line)
        if match:
            date, time, sender, message = match.groups()
            messages.append({"date": date, "time": time, "sender": sender.strip(), "message": message.strip()})
        elif messages:
            messages[-1]["message"] = f"{messages[-1]['message']}\n{line}"
    return messages


def export_to_knowledge_text(messages):
    return "\n".join(
        f"[{item['date']} {item['time']}] {item['sender']}: {item['message']}"
        for item in messages
    )
