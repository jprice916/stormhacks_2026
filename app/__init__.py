"""Flask application setup."""

import os
from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()


def create_app() -> Flask:
    """Create and configure the Flask application."""
    app = Flask(__name__)
    app.config["SECRET_KEY"] = os.getenv("FLASK_SECRET_KEY", "dev-only-change-me")

    # Required for React to communicate across ports
    CORS(app)

    # Must match the blueprint variable name in routes.py
    from app.routes import main
    app.register_blueprint(main)

    return app