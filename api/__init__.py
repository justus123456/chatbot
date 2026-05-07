from flask import Flask, jsonify, request

from api.config import Config


def create_app(test_config=None):
    from flask_cors import CORS
    from flask_limiter import Limiter
    from flask_limiter.util import get_remote_address

    from api.routes.admin import admin_bp
    from api.routes.announcements import announcements_bp
    from api.routes.auth import auth_bp
    from api.routes.chat import chat_bp
    from api.routes.documents import documents_bp
    from api.routes.escalations import escalations_bp
    from api.routes.notifications import notifications_bp
    from api.routes.whatsapp import whatsapp_bp

    app = Flask(__name__)
    app.config.from_object(Config)
    if test_config:
        app.config.update(test_config)

    CORS(app, origins=[app.config["FRONTEND_URL"]], supports_credentials=True)
    Limiter(
        key_func=lambda: getattr(request, "current_user", {}).get("id") if hasattr(request, "current_user") else get_remote_address(),
        app=app,
        storage_uri=app.config["REDIS_URL"],
        default_limits=["200 per day", "60 per hour"],
    )

    app.register_blueprint(auth_bp)
    app.register_blueprint(chat_bp)
    app.register_blueprint(documents_bp)
    app.register_blueprint(announcements_bp)
    app.register_blueprint(notifications_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(escalations_bp)
    app.register_blueprint(whatsapp_bp)

    @app.get("/api/health")
    def health():
        return jsonify({"ok": True, "service": "smartcampus-api"})

    return app
