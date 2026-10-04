"""HTTP routes for the starter app."""

import os
import threading
import time
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
from app.services.gemini_service import GeminiRequestError, GeminiService
from app.services.revisit_service import RevisitService
from app.services.stt_service import STTService

main = Blueprint("main", __name__)

gemini_service = GeminiService()
db_service = DatabaseService()
revisit_service = RevisitService(db_service, gemini_service)
LIVE_REFLECTION_COOLDOWN_SECONDS = 15
LIVE_REFLECTION_MAX_PER_RECORDING = 4
LIVE_REFLECTION_MIN_WORDS = 10
live_reflection_limits: dict[str, dict[str, float | int]] = {}
live_reflection_lock = threading.Lock()

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


@main.post("/api/live-reflection")
def live_reflection():
    """Rate-limit optional live prompts while the user is recording."""
    payload = request.get_json(silent=True) or {}
    user_id = str(payload.get("user_id") or "demo_user")
    recording_id = str(payload.get("recording_id") or "default")
    limit_key = f"{user_id}:{recording_id}"
    checkpoint = str(payload.get("checkpoint") or "").strip()
    if len(checkpoint.split()) < LIVE_REFLECTION_MIN_WORDS:
        return jsonify(should_prompt=False, question=None, topic=None)

    now = time.monotonic()
    with live_reflection_lock:
        state = live_reflection_limits.get(limit_key, {"last_request": 0.0, "count": 0})
        if now - float(state["last_request"]) < LIVE_REFLECTION_COOLDOWN_SECONDS:
            return jsonify(should_prompt=False, question=None, topic=None, limited=True,
                           cooldown_seconds=round(LIVE_REFLECTION_COOLDOWN_SECONDS - (now - float(state["last_request"])), 1))
        if int(state["count"]) >= LIVE_REFLECTION_MAX_PER_RECORDING:
            return jsonify(should_prompt=False, question=None, topic=None, limited=True,
                           cooldown_seconds=0, reason="recording_prompt_limit_reached")
        state["last_request"] = now
        live_reflection_limits[limit_key] = state

    result = gemini_service.analyze_live_reflection(checkpoint)
    result["model"] = "mock" if gemini_service.use_mock else gemini_service.live_model
    if result["should_prompt"]:
        with live_reflection_lock:
            live_reflection_limits[limit_key]["count"] = int(live_reflection_limits[limit_key]["count"]) + 1
    return jsonify(result)


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
    try:
        analysis = gemini_service.analyze_transcript(
            transcript,
            current_date=request.form.get("current_local_date"),
            user_time_zone=request.form.get("user_time_zone", "America/Vancouver"),
        )

        # 2. Generate 768-dimensional vector embedding for TiDB
        embedding = gemini_service.generate_embedding(transcript)
    except GeminiRequestError as error:
        return jsonify(message=str(error), service="gemini"), 503

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

    # 4. Persist entry metadata and vector string to TiDB
    try:
        entry_id = db_service.save_entry(entry, analysis)
    except MySQLError as error:
        current_app.logger.exception("Could not save journal entry to TiDB")
        error_code = error.args[0] if error.args else None
        message = "Could not save the entry to TiDB."
        if error_code == 1146:
            message = "The journal tables have not been created in TiDB yet."
        return jsonify(message=message, database_error_code=error_code), 503

    # 5. Find a verified, user-scoped revisit suggestion.
    revisit_suggestion = None
    try:
        revisit_suggestion = revisit_service.find_suggestion(
            user_id=user_id,
            entry_id=entry_id,
            transcript=transcript,
            analysis=analysis,
            embedding=embedding,
        )
    except MySQLError:
        current_app.logger.exception("Could not retrieve or update revisit cues")

    # 6. Return response to the client.
    return jsonify(
        stored=True,
        entry_id=entry_id,
        filename=saved_filename,
        analysis=analysis,
        revisit_suggestion=revisit_suggestion,
    ), 200


@main.post("/api/revisit-cues/<int:cue_id>/dismiss")
def dismiss_revisit(cue_id: int):
    """Record that a user dismissed a revisit suggestion."""
    payload = request.get_json(silent=True) or {}
    user_id = str(payload.get("user_id") or "demo_user")
    try:
        dismissed = db_service.mark_revisit_dismissed(cue_id, user_id)
    except MySQLError:
        current_app.logger.exception("Could not dismiss revisit cue")
        return jsonify(message="Could not dismiss revisit suggestion."), 503
    return jsonify(dismissed=dismissed)


@main.get("/uploads/<filename>")
def serve_upload(filename):
    """Allows React to stream or play back previously recorded video/audio files."""
    return send_from_directory(UPLOAD_FOLDER, filename)
