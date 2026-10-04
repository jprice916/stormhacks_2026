"""HTTP routes for the starter app."""

from pathlib import Path
import base64
import re
import json
from datetime import datetime, time as datetime_time, timedelta

from flask import Blueprint, current_app, jsonify, render_template, send_from_directory
import os
import threading
import time
from flask import (
    Blueprint,
    abort,
    current_app,
    jsonify,
    flash,
    render_template,
    redirect,
    request,
    send_file,
    send_from_directory,
    url_for,
)
from flask_login import current_user, login_required, login_user, logout_user
from pymysql.err import MySQLError
from werkzeug.utils import secure_filename

from app.database import get_connection
from app.models.journal_entry import JournalEntry
from app.media_logs import (
    create_database_recording,
    get_database_recording,
    get_video_logs_for_user,
    user_owns_media,
)
from app.services.db_service import DatabaseService
# from app.services.email_service import EmailConfigurationError, EmailService
from app.services.gemini_service import GeminiRequestError, GeminiService
from app.services.revisit_service import RevisitService
from app.services.login_service import LoginService
from app.services.profile_service import (
    DuplicateUsernameError,
    InvalidCurrentPasswordError,
    ProfileService,
)
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
login_service = LoginService()
profile_service = ProfileService()
# email_service = EmailService()

# Configure local directory for storing audio/video uploads
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


@main.get("/", endpoint="index")
@main.get("/weekly", endpoint="weekly")
@main.get("/profile", endpoint="profile")
@login_required
def index():
    frontend_dir = Path(current_app.static_folder) / "frontend"
    if (frontend_dir / "index.html").is_file():
        return send_from_directory(frontend_dir, "index.html")
    return redirect(url_for("main.logger"))


@main.get("/logger")
@login_required
def logger():
    return send_from_directory(current_app.static_folder, "frontend/index.html")


@main.get("/my-videos")
@login_required
def my_videos():
    """Temporary library page for the signed-in user's recordings."""
    try:
        videos = get_video_logs_for_user(int(current_user.get_id()))
    except MySQLError:
        current_app.logger.exception("Could not load the signed-in user's videos")
        abort(503)
    return render_template("my_videos.html", videos=videos)


@main.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "GET":
        frontend_dir = Path(current_app.static_folder) / "frontend"
        if (frontend_dir / "index.html").is_file():
            return send_from_directory(frontend_dir, "index.html")
        return render_template("login.html")

    if request.method == "POST":
        user = login_service.authenticate(
            request.form.get("identity", ""),
            request.form.get("password", ""),
        )
        if user:
            login_user(user, remember=request.form.get("remember") == "on")
            next_url = request.args.get("next", "")
            if (
                next_url.startswith("/")
                and not next_url.startswith("//")
                and "\\" not in next_url
            ):
                return redirect(next_url)
            return redirect("/static/frontend/profile")
        flash("Username/email or password is incorrect.", "error")

    return render_template("login.html")


@main.get("/static/frontend/login")
def frontend_login_alias():
    """Redirect the frontend-base login path to the app's login route."""
    return redirect(url_for("main.login"))


@main.get("/static/frontend/profile")
def frontend_profile_alias():
    """Serve the React profile route when Flask is serving the built frontend."""
    frontend_dir = Path(current_app.static_folder) / "frontend"
    if (frontend_dir / "index.html").is_file():
        return send_from_directory(frontend_dir, "index.html")
    dev_server = os.getenv("VITE_DEV_SERVER_URL", "http://127.0.0.1:5173")
    return redirect(f"{dev_server.rstrip('/')}/static/frontend/profile")


@main.post("/api/login")
def api_login():
    """Authenticate the React login form and establish a Flask session."""
    user = login_service.authenticate(
        request.form.get("identity", ""),
        request.form.get("password", ""),
    )
    if user is None:
        return jsonify(message="Username/email or password is incorrect."), 401

    login_user(user, remember=request.form.get("remember") == "true")
    next_url = request.args.get("next", "")
    if not (
        next_url.startswith("/")
        and not next_url.startswith("//")
        and "\\" not in next_url
    ):
        next_url = "/static/frontend/profile"
    return jsonify(ok=True, redirect=next_url)


def _profile_picture_mime(image: bytes) -> str | None:
    """Identify supported profile image formats from their file signatures."""
    if image.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if image.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if len(image) >= 12 and image[:4] == b"RIFF" and image[8:12] == b"WEBP":
        return "image/webp"
    return None


@main.get("/api/profile")
def api_profile():
    """Return profile fields loaded directly from the signed-in user's database row."""
    if not current_user.is_authenticated:
        return jsonify(message="Please sign in to view your profile."), 401
    try:
        profile = profile_service.get_profile(int(current_user.get_id()))
    except MySQLError:
        current_app.logger.exception("Could not load profile from TiDB")
        return jsonify(message="The profile database is unavailable. Please try again."), 503
    if profile is None:
        return jsonify(message="This account could not be found."), 404

    image = profile.get("profile_picture")
    mime_type = _profile_picture_mime(bytes(image)) if image else None
    avatar_url = None
    if image and mime_type:
        avatar_url = f"data:{mime_type};base64,{base64.b64encode(bytes(image)).decode('ascii')}"
    return jsonify(profile={
        "name": profile["username"],
        "email": profile["email"],
        "avatarUrl": avatar_url,
    })


@main.put("/api/profile")
def api_update_profile():
    """Update the authenticated user's username."""
    if not current_user.is_authenticated:
        return jsonify(message="Please sign in to update your profile."), 401
    payload = request.get_json(silent=True) or {}
    username = payload.get("name", "")
    if not isinstance(username, str) or not 3 <= len(username.strip()) <= 80:
        return jsonify(message="Username must be between 3 and 80 characters."), 400
    username = username.strip()
    try:
        profile_service.update_username(int(current_user.get_id()), username)
    except DuplicateUsernameError:
        return jsonify(message="That username is already in use."), 409
    except MySQLError:
        current_app.logger.exception("Could not update profile username in TiDB")
        return jsonify(message="The profile database is unavailable. Please try again."), 503
    return api_profile()


@main.post("/api/profile/picture")
def api_update_profile_picture():
    """Store a small profile image in the user's TiDB row."""
    if not current_user.is_authenticated:
        return jsonify(message="Please sign in to update your profile picture."), 401
    picture = request.files.get("picture")
    if picture is None:
        return jsonify(message="Choose a PNG, JPG, or WebP picture."), 400
    image = picture.stream.read(2 * 1024 * 1024 + 1)
    if not image or len(image) > 2 * 1024 * 1024:
        return jsonify(message="Choose a picture smaller than 2 MB."), 400
    if _profile_picture_mime(image) is None:
        return jsonify(message="Choose a PNG, JPG, or WebP picture."), 400
    try:
        profile_service.update_picture(int(current_user.get_id()), image)
    except MySQLError:
        current_app.logger.exception("Could not save profile picture in TiDB")
        return jsonify(message="The profile database is unavailable. Please try again."), 503
    return api_profile()


@main.post("/api/profile/password")
def api_update_password():
    """Verify the current password and store a hash of the new password."""
    if not current_user.is_authenticated:
        return jsonify(message="Please sign in to change your password."), 401
    payload = request.get_json(silent=True) or {}
    current_password = payload.get("currentPassword", "")
    new_password = payload.get("newPassword", "")
    if not isinstance(current_password, str) or not isinstance(new_password, str):
        return jsonify(message="Enter your current and new passwords."), 400
    if not 8 <= len(new_password) <= 128:
        return jsonify(message="Your new password must be between 8 and 128 characters."), 400
    try:
        profile_service.update_password(int(current_user.get_id()), current_password, new_password)
    except InvalidCurrentPasswordError:
        return jsonify(message="Your current password is incorrect."), 401
    except MySQLError:
        current_app.logger.exception("Could not update account password in TiDB")
        return jsonify(message="The profile database is unavailable. Please try again."), 503
    return jsonify(ok=True)


@main.delete("/api/profile")
def api_delete_profile():
    """Delete the signed-in user's account and database records."""
    if not current_user.is_authenticated:
        return jsonify(message="Please sign in to delete your account."), 401
    payload = request.get_json(silent=True) or {}
    if payload.get("confirmation") != "delete":
        return jsonify(message='Type "delete" to confirm account removal.'), 400
    try:
        profile_service.delete_account(int(current_user.get_id()))
    except MySQLError:
        current_app.logger.exception("Could not delete account data from TiDB")
        return jsonify(message="The account could not be deleted. Please try again."), 503
    logout_user()
    return jsonify(ok=True)


@main.get("/api/journal/takeaways")
def api_journal_takeaways():
    """Return the signed-in user's journal takeaways for one Sunday-based week."""
    if not current_user.is_authenticated:
        return jsonify(message="Please sign in to view journal highlights."), 401

    week_start_value = request.args.get("week_start", "")
    try:
        week_start = datetime.strptime(week_start_value, "%Y-%m-%d").date()
    except ValueError:
        return jsonify(message="week_start must be a date in YYYY-MM-DD format."), 400
    if week_start.weekday() != 6:
        return jsonify(message="week_start must be a Sunday."), 400

    start_at = datetime.combine(week_start, datetime_time.min)
    end_at = start_at + timedelta(days=7)
    connection = None
    try:
        connection = get_connection()
        with connection.cursor() as cursor:
            cursor.execute(
                """SELECT DATE(created_at) AS entry_date, key_takeaways
                   FROM journal_entries
                   WHERE user_id = %s AND created_at >= %s AND created_at < %s
                   ORDER BY created_at, id""",
                (current_user.get_id(), start_at, end_at),
            )
            rows = cursor.fetchall()
    except (MySQLError, KeyError, ValueError):
        current_app.logger.exception("Could not load journal takeaways from TiDB")
        return jsonify(message="Journal highlights could not be loaded from the database."), 503
    finally:
        if connection is not None:
            connection.close()

    takeaways_by_date: dict[str, list[str]] = {}
    for row in rows:
        value = row.get("key_takeaways")
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except json.JSONDecodeError:
                value = []
        if not isinstance(value, list):
            continue
        date_key = row["entry_date"].isoformat()
        daily_takeaways = takeaways_by_date.setdefault(date_key, [])
        daily_takeaways.extend(
            item.strip() for item in value if isinstance(item, str) and item.strip()
        )

    return jsonify(week_start=week_start.isoformat(), takeaways=takeaways_by_date)


@main.route("/signup", methods=["GET", "POST"])
def signup():
    if current_user.is_authenticated:
        return redirect(url_for("main.index"))

    if request.method == "POST":
        username = request.form.get("username", "").strip()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        confirmation = request.form.get("confirm_password", "")

        if not 3 <= len(username) <= 80:
            flash("Username must be between 3 and 80 characters.", "error")
        elif len(email) > 254 or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
            flash("Enter a valid email address.", "error")
        elif not 8 <= len(password) <= 128:
            flash("Password must be between 8 and 128 characters.", "error")
        elif password != confirmation:
            flash("The passwords do not match.", "error")
        else:
            user = login_service.register_user(username, email, password)
            if user is None:
                flash("That username or email is already registered.", "error")
            else:
                login_user(user)
                return redirect("/static/frontend/profile")

    return render_template("signup.html")


@main.get("/verify-email/<token>")
def verify_email(token):
    user = login_service.verify_registration_token(
        token,
        current_app.config["SECRET_KEY"],
    )
    if user is None:
        flash("This verification link is invalid, expired, or already used.", "error")
        return redirect(url_for("main.login"))

    login_user(user)
    flash("Your email is verified and your account is ready.", "info")
    return redirect(url_for("main.index"))


@main.post("/logout")
@login_required
def logout():
    logout_user()
    flash("You have been signed out.", "info")
    return redirect(url_for("main.login"))


@main.get("/database")
@login_required
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
                cursor.execute(
                    """SELECT id, username, email, created_at
                       FROM users
                       ORDER BY created_at DESC, id DESC
                       LIMIT 200"""
                )
                users = cursor.fetchall()
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
        return render_template("database.html", logs=None, users=None, db_status=db_status), 503
    except (KeyError, ValueError):
        return render_template("database.html", logs=None, users=None, db_status="unavailable"), 503

    return render_template("database.html", logs=logs, users=users, db_status="ok")


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


@main.post("/api/process-log")
@login_required
def process_log():
    """Processes text transcripts through Gemini and saves a journal entry."""
    user_id = current_user.get_id()
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


@main.get("/api/recordings")
@login_required
def list_recordings():
    """Return the signed-in user's TiDB-backed recordings for the React debug page."""
    try:
        videos = get_video_logs_for_user(int(current_user.get_id()))
    except MySQLError:
        current_app.logger.exception("Could not list recordings from TiDB")
        return jsonify(message="Could not load recordings from TiDB."), 503

    return jsonify(videos=[
        {
            "id": video["id"],
            "filename": video["title"] or "Recorded video",
            "recorded_at": video["log_date"].isoformat(),
            "recording_url": video["storage_path"],
        }
        for video in videos
    ])


@main.post("/api/recordings")
@login_required
def save_recording():
    """Store a media file and its user-linked metadata entirely in TiDB."""
    recording = request.files.get("recording")
    if recording is None or not recording.filename:
        return jsonify(message="Choose a recording before saving."), 400

    if not recording.mimetype.startswith(("audio/", "video/")):
        return jsonify(message="Only audio or video recording files are supported."), 415

    original_name = secure_filename(recording.filename) or "webcam-recording.webm"
    user_id = int(current_user.get_id())
    try:
        duration_seconds = request.form.get("duration_seconds", type=int)
        recorded_at_value = request.form.get("recorded_at_local", "")
        try:
            recorded_at_local = datetime.fromisoformat(recorded_at_value)
        except ValueError:
            recorded_at_local = datetime.now().astimezone().replace(tzinfo=None)
        log_id, logged_at = create_database_recording(
            user_id,
            recording.stream,
            mime_type=recording.mimetype,
            original_filename=original_name,
            duration_seconds=duration_seconds,
            recorded_at_local=recorded_at_local,
            user_time_zone=request.form.get("user_time_zone"),
            recording_url_factory=lambda record_id: url_for(
                "main.serve_recording", log_id=record_id
            ),
        )
    except ValueError as error:
        return jsonify(message=str(error)), 400
    except MySQLError:
        current_app.logger.exception("Could not save recording to TiDB")
        return jsonify(
            message=(
                "Could not save the recording to TiDB. Run `flask --app run.py init-db` "
                "to create the recording tables, then try again."
            )
        ), 503

    return jsonify(
        stored=True,
        log_id=log_id,
        filename=original_name,
        recording_url=url_for("main.serve_recording", log_id=log_id),
        logged_at=logged_at.isoformat(),
    ), 201


@main.get("/recordings/<int:log_id>")
@login_required
def serve_recording(log_id: int):
    """Stream a recording from TiDB only to the user who owns it."""
    try:
        recording = get_database_recording(int(current_user.get_id()), log_id)
    except (MySQLError, ValueError):
        current_app.logger.exception("Could not read recording %s from TiDB", log_id)
        abort(503)
    if recording is None:
        abort(404)
    return send_file(
        BytesIO(recording["data"]),
        mimetype=recording["mime_type"],
        download_name=recording["original_filename"],
        conditional=True,
    )


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
@login_required
def serve_upload(filename):
    """Allows React to stream or play back previously recorded video/audio files."""
    storage_path = url_for("main.serve_upload", filename=filename)
    try:
        if not user_owns_media(int(current_user.get_id()), storage_path):
            abort(404)
    except MySQLError:
        current_app.logger.exception("Could not verify recording ownership")
        abort(503)
    return send_from_directory(UPLOAD_FOLDER, filename)
