"""HTTP routes for the starter app."""

from pathlib import Path

from flask import Blueprint, current_app, jsonify, render_template, send_from_directory

main = Blueprint("main", __name__)


@main.get("/")
@main.get("/weekly")
@main.get("/profile")
@main.get("/voice-settings")
def index():
    frontend_dir = Path(current_app.static_folder) / "frontend"
    if (frontend_dir / "index.html").is_file():
        return send_from_directory(frontend_dir, "index.html")
    return render_template("index.html")


@main.get("/health")
def health():
    return jsonify(status="ok")
