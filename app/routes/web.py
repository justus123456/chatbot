from functools import wraps
from calendar import Calendar, month_name
from datetime import datetime, timezone

from flask import Blueprint, current_app, flash, jsonify, redirect, render_template, request, session, url_for


web_bp = Blueprint("web", __name__)


def current_access_token():
    return session.get("supabase_access_token")


def current_language():
    return current_app.localization.normalize_language(
        request.args.get("lang") or session.get("language") or current_app.config["APP_LOCALE_DEFAULT"]
    )


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("user"):
            return redirect(url_for("auth.login_page", lang=current_language()))
        return view(*args, **kwargs)

    return wrapped


def admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = session.get("user")
        if not user:
            return redirect(url_for("auth.login_page", lang=current_language()))
        if user.get("role") != "admin":
            return redirect(url_for("web.dashboard"))
        return view(*args, **kwargs)

    return wrapped


def localized_context(page_name):
    language = current_language()
    session["language"] = language
    return {
        "language": language,
        "labels": current_app.localization.bundle(language),
        "page_name": page_name,
        "user": session.get("user"),
        "data_mode": current_app.data_repo.mode,
        "profile_complete": current_app.data_repo.is_profile_complete(session.get("user")),
    }


def profile_setup_required():
    user = session.get("user")
    return bool(user and user.get("role") == "student" and not current_app.data_repo.is_profile_complete(user))


def build_calendar_view(events, month_param=None):
    today = datetime.now(timezone.utc).date()
    if month_param:
        try:
            active_month = datetime.strptime(month_param, "%Y-%m").date().replace(day=1)
        except ValueError:
            active_month = today.replace(day=1)
    else:
        active_month = today.replace(day=1)

    month_grid = Calendar(firstweekday=0).monthdatescalendar(active_month.year, active_month.month)
    events_by_day = {}
    for event in events:
        start_date = datetime.strptime(event["start_date"], "%Y-%m-%d").date()
        end_raw = event.get("end_date") or event["start_date"]
        end_date = datetime.strptime(end_raw, "%Y-%m-%d").date()
        current = start_date
        while current <= end_date:
            events_by_day.setdefault(current.isoformat(), []).append(event)
            current = current.fromordinal(current.toordinal() + 1)

    return {
        "label": f"{month_name[active_month.month]} {active_month.year}",
        "month_value": active_month.strftime("%Y-%m"),
        "month_number": active_month.month,
        "weeks": month_grid,
        "events_by_day": events_by_day,
        "today": today.isoformat(),
    }


@web_bp.get("/")
def index():
    return render_template("index.html", **localized_context("home"))


@web_bp.get("/dashboard")
@login_required
def dashboard():
    data = current_app.data_repo.get_dashboard_data(session["user"], access_token=current_access_token())
    return render_template("dashboard.html", dashboard=data, **localized_context("dashboard"))


@web_bp.get("/chatbot")
@login_required
def chatbot():
    chats = current_app.data_repo.list_chats(session["user"]["id"], access_token=current_access_token())
    return render_template("chatbot.html", chats=chats, **localized_context("chatbot"))


@web_bp.get("/notifications")
@login_required
def notifications():
    items = current_app.data_repo.list_notifications(session["user"]["id"], access_token=current_access_token())
    return render_template("notifications.html", notifications=items, **localized_context("notifications"))


@web_bp.get("/resources")
@login_required
def resources():
    return render_template(
        "resources.html",
        resources=current_app.data_repo.list_resources(access_token=current_access_token()),
        **localized_context("resources"),
    )


@web_bp.get("/tools")
@login_required
def tools():
    return render_template("tools.html", **localized_context("tools"))


@web_bp.get("/map")
@login_required
def campus_map():
    return render_template("map.html", **localized_context("map"))


@web_bp.route("/settings", methods=["GET", "POST"])
@login_required
def settings():
    if request.method == "POST":
        payload = {
            "name": request.form.get("name", "").strip(),
            "phone": request.form.get("phone", "").strip(),
            "department": request.form.get("department", "").strip(),
            "faculty": request.form.get("faculty", "").strip(),
            "level": request.form.get("level", "").strip(),
            "student_number": request.form.get("student_number", "").strip(),
            "preferred_language": current_app.localization.normalize_language(
                request.form.get("preferred_language", current_app.config["APP_LOCALE_DEFAULT"])
            ),
        }
        missing_fields = [label for key, label in (("phone", "Phone number"), ("department", "Department"), ("level", "Level")) if not payload[key]]
        if missing_fields:
            error_message = f"Please complete these required fields: {', '.join(missing_fields)}."
            return render_template("settings.html", profile_error=error_message, **localized_context("settings"))
        result = current_app.data_repo.update_profile(
            session["user"]["id"],
            payload,
            access_token=current_access_token(),
        )
        if not result["ok"]:
            return render_template("settings.html", profile_error=result["message"], **localized_context("settings"))
        session["user"] = result["user"]
        session["language"] = result["user"].get("preferred_language", session.get("language", "en"))
        flash("Profile updated successfully.", "success")
        return redirect(url_for("web.dashboard"))
    return render_template("settings.html", profile_error=None, **localized_context("settings"))


@web_bp.get("/notes")
@login_required
def notes():
    return render_template("notes.html", **localized_context("notes"))


@web_bp.get("/calendar")
@login_required
def calendar():
    events = current_app.data_repo.list_calendar_events(session["user"], access_token=current_access_token())
    calendar_view = build_calendar_view(events, request.args.get("month"))
    return render_template("calendar.html", calendar_events=events, calendar_view=calendar_view, **localized_context("calendar"))


@web_bp.get("/admin")
@admin_required
def admin():
    return render_template(
        "admin.html",
        admin_data=current_app.data_repo.get_admin_data(access_token=current_access_token()),
        **localized_context("admin"),
    )


@web_bp.get("/api/announcements")
@login_required
def api_announcements():
    return jsonify(current_app.data_repo.list_announcements(access_token=current_access_token()))


@web_bp.get("/api/notifications")
@login_required
def api_notifications():
    return jsonify(current_app.data_repo.list_notifications(session["user"]["id"], access_token=current_access_token()))


@web_bp.get("/api/resources")
@login_required
def api_resources():
    return jsonify(current_app.data_repo.list_resources(access_token=current_access_token()))


@web_bp.post("/api/chat")
@login_required
def api_chat():
    payload = request.get_json(silent=True) or {}
    message = payload.get("message", "").strip()
    language = current_app.localization.normalize_language(payload.get("language") or session.get("language", "en"))
    session["language"] = language

    if not message:
        return jsonify({"error": "Message is required."}), 400

    result = current_app.ai_service.answer_question(
        session["user"],
        message,
        language,
        access_token=current_access_token(),
    )
    record = current_app.data_repo.save_chat(
        user_id=session["user"]["id"],
        message=message,
        response=result["answer"],
        source=result["source"],
        access_token=current_access_token(),
    )
    return jsonify(
        {
            "message": record["message"],
            "response": record["response"],
            "source": record["source"],
            "created_at": record["created_at"],
            "labels": {
                "knowledge_base": current_app.localization.get_text(language, "knowledge_label"),
                "ai_fallback": current_app.localization.get_text(language, "ai_label"),
                "openai_fallback": current_app.localization.get_text(language, "ai_label"),
                "ollama_fallback": current_app.localization.get_text(language, "ai_label"),
                "ai_unavailable": current_app.localization.get_text(language, "ai_label"),
            },
        }
    )


def admin_json_payload(required_fields):
    user = session.get("user")
    if not user or user.get("role") != "admin":
        return None, (jsonify({"error": "Unauthorized"}), 403)

    payload = request.get_json(silent=True) or {}
    missing = [field for field in required_fields if not payload.get(field)]
    if missing:
        return None, (jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400)
    return payload, None


@web_bp.post("/api/admin/faqs")
def api_admin_faqs():
    payload, error = admin_json_payload(["question", "answer", "category", "language"])
    if error:
        return error
    record = current_app.data_repo.add_record("faqs", payload, access_token=current_access_token())
    return jsonify(record), 201


@web_bp.post("/api/admin/announcements")
def api_admin_announcements():
    payload, error = admin_json_payload(["title", "content", "expires_at"])
    if error:
        return error
    record = current_app.data_repo.add_record("announcements", payload, access_token=current_access_token())
    return jsonify(record), 201


@web_bp.post("/api/admin/contacts")
def api_admin_contacts():
    payload, error = admin_json_payload(["name", "role", "email", "phone", "office_location"])
    if error:
        return error
    record = current_app.data_repo.add_record("contacts", payload, access_token=current_access_token())
    return jsonify(record), 201


@web_bp.post("/api/admin/resources")
def api_admin_resources():
    payload, error = admin_json_payload(["title", "file_url", "type", "description"])
    if error:
        return error
    record = current_app.data_repo.add_record("resources", payload, access_token=current_access_token())
    return jsonify(record), 201


@web_bp.post("/api/admin/rules")
def api_admin_rules():
    payload, error = admin_json_payload(["title", "content", "category"])
    if error:
        return error
    record = current_app.data_repo.add_record("rules", payload, access_token=current_access_token())
    return jsonify(record), 201


@web_bp.post("/api/admin/notifications")
def api_admin_notifications():
    payload, error = admin_json_payload(["user_id", "message", "type", "date"])
    if error:
        return error
    record = current_app.data_repo.add_record("notifications", payload, access_token=current_access_token())
    return jsonify(record), 201


@web_bp.post("/api/admin/reminders")
def api_admin_reminders():
    payload, error = admin_json_payload(["title", "message", "target_role", "due_date"])
    if error:
        return error
    payload["created_by"] = session["user"]["id"]
    record = current_app.data_repo.add_record("reminders", payload, access_token=current_access_token())
    return jsonify(record), 201


@web_bp.post("/api/admin/calendar")
def api_admin_calendar():
    payload, error = admin_json_payload(["title", "event_type", "start_date"])
    if error:
        return error
    payload["created_by"] = session["user"]["id"]
    record = current_app.data_repo.add_record("school_calendar", payload, access_token=current_access_token())
    return jsonify(record), 201
