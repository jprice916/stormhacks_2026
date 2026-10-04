"""TiDB persistence helpers for recorded audio and video."""

from datetime import datetime, timezone

from app.database import get_connection


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
