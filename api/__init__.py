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
    from api.routes.campus_map import campus_map_bp
    from api.routes.documents import documents_bp
    from api.routes.escalations import escalations_bp
    from api.routes.engagement import engagement_bp
    from api.routes.goals import goals_bp
    from api.routes.notifications import notifications_bp
    from api.routes.personalization import personalization_bp
    from api.routes.planner import planner_bp
    from api.routes.whatsapp import whatsapp_bp

    app = Flask(__name__)
    app.config.from_object(Config)
    if test_config:
        app.config.update(test_config)

    frontend_origins = {
        app.config["FRONTEND_URL"],
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    }
    CORS(app, origins=list(frontend_origins), supports_credentials=True)
    Limiter(
        key_func=lambda: getattr(request, "current_user", {}).get("id") if hasattr(request, "current_user") else get_remote_address(),
        app=app,
        storage_uri=app.config["REDIS_URL"],
        default_limits=["1000 per day", "300 per hour"],
        default_limits_exempt_when=lambda: request.method == "OPTIONS",
    )

    app.register_blueprint(auth_bp)
    app.register_blueprint(chat_bp)
    app.register_blueprint(campus_map_bp)
    app.register_blueprint(documents_bp)
    app.register_blueprint(announcements_bp)
    app.register_blueprint(notifications_bp)
    app.register_blueprint(personalization_bp)
    app.register_blueprint(planner_bp)
    app.register_blueprint(goals_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(escalations_bp)
    app.register_blueprint(engagement_bp)
    app.register_blueprint(whatsapp_bp)

    @app.get("/api/health")
    def health():
        return jsonify({"ok": True, "service": "smartcampus-api"})

    return app
