from pathlib import Path

from dotenv import load_dotenv

from api import create_app

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

app = create_app()

if __name__ == "__main__":
    app.run(debug=True, port=5000)
