from collections import Counter
from datetime import date, timedelta


STOP_WORDS = {
    "about",
    "after",
    "again",
    "also",
    "because",
    "before",
    "could",
    "does",
    "from",
    "have",
    "how",
    "into",
    "please",
    "that",
    "their",
    "them",
    "there",
    "this",
    "what",
    "when",
    "where",
    "which",
    "with",
    "your",
}


def build_personalization_context(supabase, user):
    """Return a compact, privacy-safe context block for the LLM prompt."""
    profile = _profile_context(user)
    chat_rows = _safe_rows(
        supabase,
        "chats",
        "message,source,confidence_score,created_at",
        user_id=user.get("id"),
        limit=20,
    )
    document_rows = _safe_rows(
        supabase,
        "documents",
        "title,category,created_at",
        user_id=user.get("id"),
        limit=8,
    )
    goal_rows = _safe_rows(
        supabase,
        "goals",
        "title,status,current_value,target_value,deadline,created_at",
        user_id=user.get("id"),
        limit=8,
    )
    activity_rows = _safe_rows(
        supabase,
        "engagement_events",
        "event_type,target_table,label,metadata,created_at",
        user_id=user.get("id"),
        limit=20,
    )
    upcoming_deadlines = _upcoming_deadlines(supabase, user)
    topics = infer_topics([row.get("message") or "" for row in chat_rows])
    active_documents = [row.get("title") for row in document_rows if row.get("title")][:5]
    active_goals = [
        _goal_summary(row)
        for row in goal_rows
        if (row.get("status") or "pending") != "completed"
    ][:5]
    style = _communication_style(chat_rows)
    activity_labels = [row.get("label") for row in activity_rows if row.get("label")][:5]

    lines = [
        "Personalization context for this student:",
        f"- Profile: {profile}",
        f"- Recent recurring topics: {_join_or_none(topics)}",
        f"- Recent uploaded/studied documents: {_join_or_none(active_documents)}",
        f"- Active goals: {_join_or_none(active_goals)}",
        f"- Upcoming applicable deadlines within 14 days: {_join_or_none(upcoming_deadlines)}",
        f"- Recent app search/activity signals: {_join_or_none(activity_labels)}",
        f"- Learned response style: {style}",
        "- Use this context only when it genuinely helps. Do not sound like you are monitoring the student.",
    ]

    return "\n".join(lines)


def build_chat_suggestions(supabase, user):
    context = build_personalization_context(supabase, user)
    chat_rows = _safe_rows(
        supabase,
        "chats",
        "message,created_at",
        user_id=user.get("id"),
        limit=12,
    )
    document_rows = _safe_rows(
        supabase,
        "documents",
        "title,category,created_at",
        user_id=user.get("id"),
        limit=4,
    )
    goal_rows = _safe_rows(
        supabase,
        "goals",
        "title,status,deadline",
        user_id=user.get("id"),
        limit=5,
    )
    topics = infer_topics([row.get("message") or "" for row in chat_rows])

    suggestions = []
    for topic in topics[:3]:
        suggestions.append(f"Explain {topic} simply")
        suggestions.append(f"What should I know about {topic}?")

    for document in document_rows[:2]:
        title = document.get("title")
        if title:
            suggestions.append(f"Summarize {title}")
            suggestions.append(f"Explain {title} simply")

    for goal in goal_rows:
        if (goal.get("status") or "pending") != "completed" and goal.get("title"):
            suggestions.append(f"Help me continue my goal: {goal['title']}")

    for deadline in _upcoming_deadlines(supabase, user)[:3]:
        suggestions.append(f"What do I need to do for {deadline}?")

    defaults = [
        "How do I register my courses?",
        "What deadlines should I remember?",
        "Summarize my uploaded document",
        "Explain this note simply",
        "What announcements affect me?",
    ]
    return {"suggestions": _dedupe([*suggestions, *defaults])[:8], "context_preview": context}


def track_activity(supabase, user_id, action_type, content=None, metadata=None):
    payload = {
        "user_id": user_id,
        "action_type": action_type,
        "content": content,
        "metadata": metadata or {},
    }
    try:
        supabase.table("user_activity").insert(payload).execute()
    except Exception:
        pass

    event_payload = {
        "user_id": user_id,
        "event_type": action_type,
        "label": content,
        "metadata": metadata or {},
    }
    try:
        supabase.table("engagement_events").insert(event_payload).execute()
    except Exception:
        pass


def infer_topics(texts, limit=5):
    words = []
    for text in texts:
        for raw in (text or "").replace("/", " ").replace("-", " ").split():
            word = raw.strip(".,?!:;\"'()[]{}").lower()
            if len(word) >= 4 and word not in STOP_WORDS and not word.isnumeric():
                words.append(word)
    return [word for word, _ in Counter(words).most_common(limit)]


def _profile_context(user):
    language = user.get("preferred_language") or "en"
    tone = user.get("preferred_tone") or "simple"
    language_label = "Nigerian Pidgin" if language == "pidgin" else "standard English"
    tone_label = "short key points" if tone == "simple" else "full structured explanations"
    department = user.get("department") or "unknown department"
    level = user.get("level") or "unknown level"
    name = (user.get("name") or "").split(" ")[0] or "the student"
    return f"{name}, {level}-level {department}, prefers {language_label}, prefers {tone_label}"


def _safe_rows(supabase, table, columns, user_id=None, limit=10):
    try:
        query = supabase.table(table).select(columns)
        if user_id:
            query = query.eq("user_id", user_id)
        return query.order("created_at", desc=True).limit(limit).execute().data or []
    except Exception:
        return []


def _upcoming_deadlines(supabase, user):
    today = date.today()
    end = today + timedelta(days=14)
    try:
        rows = (
            supabase.table("school_calendar")
            .select("title,event_type,start_date,end_date,target_departments,target_levels")
            .gte("start_date", today.isoformat())
            .lte("start_date", end.isoformat())
            .order("start_date", desc=False)
            .limit(8)
            .execute()
            .data
            or []
        )
    except Exception:
        return []

    applicable = []
    for row in rows:
        if _targets_user(row.get("target_departments"), user.get("department")) and _targets_user(row.get("target_levels"), user.get("level")):
            start = row.get("start_date")
            title = row.get("title") or "School event"
            event_type = row.get("event_type") or "event"
            applicable.append(f"{title} ({event_type}, {start})")
    return applicable


def _targets_user(target, value):
    if target in (None, "all"):
        return True
    if isinstance(target, str):
        return target.lower() == "all" or str(value or "").lower() == target.lower()
    if isinstance(target, list):
        lowered = [str(item).lower() for item in target]
        return "all" in lowered or str(value or "").lower() in lowered
    return True


def _goal_summary(row):
    title = row.get("title") or "Untitled goal"
    current = row.get("current_value") or 0
    target = row.get("target_value") or 1
    deadline = row.get("deadline")
    deadline_text = f", deadline {deadline}" if deadline else ""
    return f"{title} ({current}/{target}{deadline_text})"


def _communication_style(chat_rows):
    count = len(chat_rows)
    if count >= 12:
        familiarity = "experienced SmartCampus user"
    elif count >= 4:
        familiarity = "returning SmartCampus user"
    else:
        familiarity = "new or light SmartCampus user"

    short_questions = sum(1 for row in chat_rows if len((row.get("message") or "").split()) <= 6)
    if count and short_questions / count >= 0.6:
        depth = "often asks short follow-up questions, so preserve conversation context"
    else:
        depth = "can handle structured answers with a little context"
    return f"{familiarity}; {depth}"


def _join_or_none(items):
    clean = [str(item) for item in items if item]
    return ", ".join(clean) if clean else "none yet"


def _dedupe(items):
    seen = set()
    result = []
    for item in items:
        normalized = item.strip().lower()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        result.append(item.strip())
    return result
