from flask import Blueprint, current_app, flash, redirect, render_template, request, session, url_for


auth_bp = Blueprint("auth", __name__)


def post_login_destination(user):
    return url_for("web.dashboard")


@auth_bp.get("/login")
def login_page():
    if session.get("user"):
        return redirect(post_login_destination(session.get("user")))
    language = request.args.get("lang", session.get("language", current_app.config["APP_LOCALE_DEFAULT"]))
    language = current_app.localization.normalize_language(language)
    mode = request.args.get("mode", "signup")
    if mode not in {"signup", "login", "forgot"}:
        mode = "signup"
    return render_template(
        "login.html",
        language=language,
        labels=current_app.localization.bundle(language),
        page_name="login",
        data_mode=current_app.data_repo.mode,
        allow_demo_auth=current_app.config.get("ALLOW_DEMO_AUTH", False),
        user=session.get("user"),
        auth_mode=mode,
    )


@auth_bp.post("/login")
def login():
    email = request.form.get("email", "").strip().lower()
    password = request.form.get("password", "").strip()
    language = request.form.get("language", current_app.config["APP_LOCALE_DEFAULT"])

    result = current_app.data_repo.authenticate_user(email=email, password=password)
    if not result["ok"]:
        flash(result["message"], "error")
        return redirect(url_for("auth.login_page", lang=language, mode="login"))

    session["user"] = result["user"]
    session["language"] = result["user"].get("preferred_language", language)
    session["supabase_access_token"] = result.get("access_token")
    flash("Welcome back.", "success")
    return redirect(post_login_destination(result["user"]))


@auth_bp.post("/signup")
def signup():
    payload = {
        "name": request.form.get("name", "").strip(),
        "email": request.form.get("email", "").strip().lower(),
        "password": request.form.get("password", "").strip(),
        "preferred_language": request.form.get("language", current_app.config["APP_LOCALE_DEFAULT"]),
    }
    result = current_app.data_repo.register_user(payload)
    if not result["ok"]:
        flash(result["message"], "error")
        return redirect(url_for("auth.login_page", lang=payload["preferred_language"], mode="signup"))

    if result.get("requires_verification"):
        flash(result["message"], "success")
        return redirect(url_for("auth.login_page", lang=payload["preferred_language"], mode="login"))
    flash(result.get("message", "Your account has been created. Please log in."), "success")
    return redirect(url_for("auth.login_page", lang=payload["preferred_language"], mode="login"))


@auth_bp.post("/forgot-password")
def forgot_password():
    email = request.form.get("email", "").strip().lower()
    language = request.form.get("language", current_app.config["APP_LOCALE_DEFAULT"])
    result = current_app.data_repo.send_password_reset(email)
    flash(result["message"], "success" if result["ok"] else "error")
    return redirect(url_for("auth.login_page", lang=language, mode="forgot"))


@auth_bp.post("/logout")
def logout():
    session.clear()
    flash("You have been signed out.", "success")
    return redirect(url_for("web.index"))
