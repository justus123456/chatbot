from api.services.whatsapp_import import export_to_knowledge_text, parse_export


def test_parse_whatsapp_export_with_continuation_line():
    export = """[04/28/2026, 12:36 PM] - Student One: When is registration?
This is a follow-up line.
[04/28/2026, 12:37 PM] - Admin: Registration closes Friday."""

    messages = parse_export(export)

    assert len(messages) == 2
    assert messages[0]["sender"] == "Student One"
    assert "follow-up line" in messages[0]["message"]
    assert messages[1]["message"] == "Registration closes Friday."


def test_export_to_knowledge_text_keeps_speaker_context():
    messages = [{"sender": "Student", "message": "Where is bursary?"}]

    assert export_to_knowledge_text(messages) == "Student: Where is bursary?"
