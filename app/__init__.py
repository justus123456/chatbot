from flask import Flask

from app.config import Config
from app.routes.auth import auth_bp
from app.routes.web import web_bp
from app.services.ai import AIService
from app.services.data import DataRepository
from app.services.localization import LocalizationService


def create_app(test_config=None):
    app = Flask(__name__)
    app.config.from_object(Config)

    if test_config:
        app.config.update(test_config)

    app.data_repo = DataRepository(app.config)
    app.localization = LocalizationService()
    app.ai_service = AIService(app.config, app.data_repo, app.localization)

    app.register_blueprint(web_bp)
    app.register_blueprint(auth_bp)

    @app.context_processor
    def inject_globals():
        return {
            "app_name": app.config["APP_NAME"],
        }

    return app
