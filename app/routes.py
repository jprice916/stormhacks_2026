"""HTTP routes for the starter app."""

import os
from flask import (
    Blueprint,
    current_app,
    jsonify,
    render_template,
    request,
    send_from_directory,
)
from pymysql.err import MySQLError
from werkzeug.utils import secure_filename

from app.database import get_connection
from app.models.journal_entry import JournalEntry
from app.services.db_service import DatabaseService
from app.services.gemini_service import GeminiService
from app.services.stt_service import STTService

main = Blueprint("main", __name__)

gemini_service = GeminiService()
db_service = DatabaseService()

# Configure local directory for storing audio/video uploads
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


@main.get("/")
def index():
    return render_template("index.html")


@main.get("/database")
def database_page():
    if not current_app.config.get("DATABASE_CONFIGURED"):
        return render_template("database.html", logs=None, db_status="not_configured"), 503

    try:
        connection = get_connection()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """SELECT logs.id, logs.log_date, logs.media_type, logs.storage_path,
                              logs.title, logs.notes, users.username
                       FROM audio_visual_logs AS logs
                       JOIN users ON users.id = logs.user_id
                       ORDER BY logs.log_date DESC, logs.id DESC
                       LIMIT 200"""
                )
                logs = cursor.fetchall()
        finally:
            connection.close()
    except MySQLError as error:
        error_code = error.args[0] if error.args else None
        current_app.logger.warning("TiDB read failed (MySQL error code %s)", error_code)
        db_status = {
            2002: "endpoint_unreachable",
            2003: "endpoint_unreachable",
            2005: "endpoint_unreachable",
            1044: "database_access_denied",
            1049: "database_not_found",
            1045: "authentication_failed",
            1146: "tables_missing",
            2026: "tls_failed",
        }.get(error_code, "unavailable")
        return render_template("database.html", logs=None, db_status=db_status), 503
    except (KeyError, ValueError):
        return render_template("database.html", logs=None, db_status="unavailable"), 503

    return render_template("database.html", logs=logs, db_status="ok")


@main.get("/health")
def health():
    return jsonify(status="ok")


@main.get("/health/db")
def database_health():
    """Check whether the configured database accepts a connection."""
    if not current_app.config.get("DATABASE_CONFIGURED"):
        return jsonify(status="not_configured"), 503
    try:
        connection = get_connection()
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
        finally:
            connection.close()
        return jsonify(status="ok")
    except (MySQLError, KeyError, ValueError):
        return jsonify(status="unavailable"), 503


@main.post("/api/recordings")
@main.post("/api/process-log")
def create_recording():
    """Accepts recording uploads or text transcripts, processes with Gemini, and saves to TiDB."""
    user_id = request.form.get("user_id", "demo_user")
    transcript = request.form.get("transcript")

    # Accept either teammate's "recording" or "audio" form field
    file = request.files.get("recording") or request.files.get("audio")

    saved_filename = None
    if file and file.filename:
        saved_filename = secure_filename(file.filename)
        file_path = os.path.join(UPLOAD_FOLDER, saved_filename)
        file.save(file_path)

        # If frontend didn't already send live transcript text, transcribe the saved file
        if not transcript:
            with open(file_path, "rb") as f:
                transcript = STTService.transcribe_audio_file(f)

    if not transcript:
        return jsonify(message="No transcript or valid recording file provided."), 400

    # 1. Parse milestones and core topics via Gemini
    analysis = gemini_service.analyze_transcript(transcript)

    # 2. Generate 768-dimensional vector embedding for TiDB
    embedding = gemini_service.generate_embedding(transcript)

    # 3. Create entry model conforming to the DB schema
    entry = JournalEntry(
        user_id=user_id,
        transcript=transcript,
        entry_type=analysis.get("entry_type", "general"),
        summary=analysis.get("summary", ""),
        core_topic=analysis.get("core_topic", ""),
        embedding=embedding,
        video_filename=saved_filename,
    )

    # 4. Check for matching historical struggle if user logged an achievement
    past_match = None
    if entry.entry_type == "achievement":
        past_match = db_service.find_matching_struggle(user_id, embedding)

    # 5. Persist entry metadata and vector string to TiDB
    entry_id = db_service.save_entry(entry)

    # 6. Return response to React
    return jsonify(
        stored=True,
        entry_id=entry_id,
        filename=saved_filename,
        analysis=analysis,
        matched_past_struggle=past_match,
    ), 200


@main.get("/uploads/<filename>")
def serve_upload(filename):
    """Allows React to stream or play back previously recorded video/audio files."""
    return send_from_directory(UPLOAD_FOLDER, filename)