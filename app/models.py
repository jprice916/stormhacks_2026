"""Password helpers and queries for users and audio/AV logs."""

from datetime import datetime, timezone

from werkzeug.security import check_password_hash, generate_password_hash

from app.database import get_connection


def hash_password(password: str) -> str:
    """Return a one-way password hash suitable for storage."""
    return generate_password_hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    """Check a candidate password against a stored hash."""
    return check_password_hash(password_hash, password)


def create_user(username: str, email: str, password: str) -> int:
    """Insert a user with a hashed password and return the new ID."""
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO users (username, email, password_hash) VALUES (%s, %s, %s)",
                (username, email, hash_password(password)),
            )
            user_id = cursor.lastrowid
        connection.commit()
        return user_id
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def create_audio_visual_log(
    user_id: int,
    media_type: str,
    storage_path: str,
    *,
    log_date: datetime | None = None,
    title: str | None = None,
    notes: str | None = None,
) -> int:
    """Insert a dated log and return its ID. Naive dates are treated as UTC."""
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
