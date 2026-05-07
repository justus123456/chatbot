import pytest

from app import create_app


@pytest.fixture
def app():
    app = create_app(
        {
            "TESTING": True,
            "SECRET_KEY": "test-secret",
            "WTF_CSRF_ENABLED": False,
            "SUPABASE_URL": "",
            "SUPABASE_ANON_KEY": "",
            "ALLOW_DEMO_AUTH": True,
            "OPENAI_API_KEY": "",
        }
    )
    return app


@pytest.fixture
def client(app):
    return app.test_client()


def login(client, email, password):
    return client.post(
        "/login",
        data={"email": email, "password": password, "language": "en"},
        follow_redirects=True,
    )
