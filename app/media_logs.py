"""TiDB persistence helpers for recorded audio and video."""

from datetime import datetime, timezone

from app.database import get_connection

RECORDING_CHUNK_BYTES = 4 * 1024 * 1024


def create_audio_visual_log(
    user_id: int,
    media_type: str,
    storage_path: str,
    *,
    log_date: datetime | None = None,
    title: str | None = None,
    notes: str | None = None,
) -> int:
    """Insert a dated media-log record and return its TiDB ID."""
    if media_type not in {"audio", "video", "audio_video"}:
        raise ValueError("media_type must be audio, video, or audio_video")

    log_date = log_date or datetime.now(timezone.utc)
    if log_date.tzinfo is not None:
        log_date = log_date.astimezone(timezone.utc).replace(tzinfo=None)

    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """INSERT INTO audio_visual_logs
                   (user_id, log_date, media_type, storage_path, title, notes)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (user_id, log_date, media_type, storage_path, title, notes),
            )
            log_id = cursor.lastrowid
        connection.commit()
        return log_id
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def create_database_recording(
    user_id: int,
    recording_stream,
    *,
    mime_type: str,
    original_filename: str,
    duration_seconds: int | None,
    recording_url_factory,
) -> tuple[int, datetime]:
    """Store a recording as TiDB chunks and return its log ID and UTC date."""
    logged_at = datetime.now(timezone.utc)
    log_date = logged_at.replace(tzinfo=None)
    notes = f"Duration: {duration_seconds} seconds" if duration_seconds is not None else None
    connection = get_connection()
    log_id = None
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """INSERT INTO audio_visual_logs
                   (user_id, log_date, media_type, storage_path, title, notes)
                   VALUES (%s, %s, 'audio_video', '', %s, %s)""",
                (user_id, log_date, original_filename, notes),
            )
            log_id = cursor.lastrowid
            storage_path = recording_url_factory(log_id)
            cursor.execute(
                "UPDATE audio_visual_logs SET storage_path = %s WHERE id = %s",
                (storage_path, log_id),
            )
        connection.commit()

        chunk_count = 0
        file_size_bytes = 0
        while chunk := recording_stream.read(RECORDING_CHUNK_BYTES):
            with connection.cursor() as cursor:
                cursor.execute(
                    """INSERT INTO recording_chunks (log_id, chunk_index, chunk_data)
                       VALUES (%s, %s, %s)""",
                    (log_id, chunk_count, chunk),
                )
            connection.commit()
            chunk_count += 1
            file_size_bytes += len(chunk)

        if not chunk_count:
            raise ValueError("The recording file was empty")

        with connection.cursor() as cursor:
            cursor.execute(
                """INSERT INTO recording_media
                   (log_id, mime_type, original_filename, file_size_bytes, chunk_count)
                   VALUES (%s, %s, %s, %s, %s)""",
                (log_id, mime_type, original_filename, file_size_bytes, chunk_count),
            )
        connection.commit()
        return log_id, logged_at
    except Exception:
        connection.rollback()
        if log_id is not None:
            with connection.cursor() as cursor:
                cursor.execute("DELETE FROM audio_visual_logs WHERE id = %s", (log_id,))
            connection.commit()
        raise
    finally:
        connection.close()


def get_video_logs_for_user(user_id: int) -> list[dict]:
    """Return one user's recorded-video metadata, newest first."""
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """SELECT id, log_date, storage_path, title, notes
                   FROM audio_visual_logs
                   WHERE user_id = %s AND media_type IN ('video', 'audio_video')
                   ORDER BY log_date DESC, id DESC""",
                (user_id,),
            )
            return cursor.fetchall()
    finally:
        connection.close()


def user_owns_media(user_id: int, storage_path: str) -> bool:
    """Check that a media route belongs to the signed-in user."""
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """SELECT 1
                   FROM audio_visual_logs
                   WHERE user_id = %s AND storage_path = %s
                   LIMIT 1""",
                (user_id, storage_path),
            )
            return cursor.fetchone() is not None
    finally:
        connection.close()


def get_database_recording(user_id: int, log_id: int) -> dict | None:
    """Return an owned recording's MIME type, filename, and reassembled bytes."""
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """SELECT media.mime_type, media.original_filename, media.chunk_count
                   FROM recording_media AS media
                   JOIN audio_visual_logs AS logs ON logs.id = media.log_id
                   WHERE media.log_id = %s AND logs.user_id = %s""",
                (log_id, user_id),
            )
            recording = cursor.fetchone()
            if recording is None:
                return None
            cursor.execute(
                """SELECT chunk_data FROM recording_chunks
                   WHERE log_id = %s ORDER BY chunk_index""",
                (log_id,),
            )
            chunks = cursor.fetchall()
        if len(chunks) != recording["chunk_count"]:
            raise ValueError("Recording data is incomplete")
        recording["data"] = b"".join(chunk["chunk_data"] for chunk in chunks)
        return recording
    finally:
        connection.close()
