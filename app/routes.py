"""HTTP routes for the starter app."""

import os
from flask import Blueprint, jsonify, render_template, request, send_from_directory
from werkzeug.utils import secure_filename

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


@main.get("/health")
def health():
    return jsonify(status="ok")


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
        video_filename=saved_filename
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
        matched_past_struggle=past_match
    ), 200


@main.get("/uploads/<filename>")
def serve_upload(filename):
    """Allows React to stream or play back previously recorded video/audio files."""
    return send_from_directory(UPLOAD_FOLDER, filename)
