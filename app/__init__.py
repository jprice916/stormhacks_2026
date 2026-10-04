"""Flask application setup."""

import os
from pathlib import Path

from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

from app.database import get_tidb_config


def load_project_env() -> None:
    """Load simple KEY=value entries from the project .env without dependencies."""
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        name = name.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        if name:
            os.environ.setdefault(name, value)


def create_app() -> Flask:
    """Create and configure the Flask application."""
    load_project_env()
    app = Flask(__name__)
    app.config["SECRET_KEY"] = os.getenv("FLASK_SECRET_KEY", "dev-only-change-me")
    try:
        get_tidb_config()
        app.config["DATABASE_CONFIGURED"] = True
    except (KeyError, ValueError):
        app.config["DATABASE_CONFIGURED"] = False

    @app.cli.command("init-db")
    def init_db_command() -> None:
        """Create the initial database tables."""
        from app.database import initialize_database

        initialize_database()
        print("Database tables created.")

    # Required for React to communicate across ports
    CORS(app)

    # Must match the blueprint variable name in routes.py
    from app.routes import main
    app.register_blueprint(main)

    return app