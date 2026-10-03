"""HTTP routes for the starter app."""

from flask import Blueprint, jsonify, render_template, request

main = Blueprint("main", __name__)


@main.get("/")
def index():
    return render_template("index.html")


@main.get("/health")
def health():
    return jsonify(status="ok")


@main.post("/api/recordings")
def create_recording():
    """Accept the recording upload; TiDB persistence is intentionally not wired yet."""
    recording = request.files.get("recording")
    if recording is None or not recording.filename:
        return jsonify(message="Choose a recording before uploading."), 400

    # TODO: Upload the media file to object storage, then insert its metadata and
    # storage URI into TiDB using the schema in sql/recordings.sql.
    # Keep large video/audio blobs out of TiDB rows.
    return jsonify(
        stored=False,
        message="The Flask upload endpoint received the recording, but TiDB is not connected yet. Nothing was saved.",
        filename=recording.filename,
        duration_seconds=request.form.get("duration_seconds", type=int),
    ), 501
