import os
from urllib.parse import urlparse

from dotenv import load_dotenv

from app import create_app


load_dotenv()

app = create_app()


if __name__ == "__main__":
    api_url = urlparse(os.getenv("FLASK_API_URL", "http://localhost:5000"))
    app.run(debug=app.config["DEBUG"], port=api_url.port or 5000)
