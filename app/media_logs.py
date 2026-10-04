"""TiDB persistence helpers for recorded audio and video."""

from datetime import datetime, timedelta, timezone

from app.database import get_connection

RECORDING_CHUNK_BYTES = 4 * 1024 * 1024
MAX_ANALYSIS_ATTEMPTS = 5


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
    recorded_at_local: datetime,
    user_time_zone: str | None,
    recording_url_factory,
) -> tuple[int, datetime]:
    """Store a recording as TiDB chunks with the user's local recording date."""
    logged_at = recorded_at_local.replace(tzinfo=None)
    notes_parts = []
    if duration_seconds is not None:
        notes_parts.append(f"Duration: {duration_seconds} seconds")
    if user_time_zone:
        notes_parts.append(f"Time zone: {user_time_zone}")
    notes = "; ".join(notes_parts) or None
    connection = get_connection()
    log_id = None
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """INSERT INTO audio_visual_logs
                   (user_id, log_date, media_type, storage_path, title, notes)
                   VALUES (%s, %s, 'audio_video', '', %s, %s)""",
                (user_id, logged_at, original_filename, notes),
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
                """SELECT logs.id, logs.log_date, logs.storage_path, logs.title, logs.notes,
                          logs.transcript, logs.analysis_status, logs.analysis_error,
                          entries.analysis_json
                   FROM audio_visual_logs AS logs
                   LEFT JOIN journal_entries AS entries
                     ON entries.recording_log_id = logs.id
                    AND entries.user_id = logs.user_id
                   WHERE logs.user_id = %s AND logs.media_type IN ('video', 'audio_video')
                   ORDER BY logs.log_date DESC, logs.id DESC""",
                (user_id,),
            )
            return cursor.fetchall()
    finally:
        connection.close()


def update_recording_analysis_state(
    log_id: int,
    *,
    transcript: str | None = None,
    status: str,
    error: str | None = None,
) -> None:
    """Persist browser-transcript and final-analysis progress for a saved recording."""
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """UPDATE audio_visual_logs
                   SET transcript = COALESCE(%s, transcript), analysis_status = %s, analysis_error = %s
                   WHERE id = %s""",
                (transcript, status, error, log_id),
            )
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def get_recording_analysis_input(user_id: int, log_id: int) -> dict | None:
    """Return the saved browser transcript and title for an owned recording."""
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """SELECT id, title, transcript, analysis_status
                   FROM audio_visual_logs
                   WHERE id = %s AND user_id = %s AND media_type IN ('video', 'audio_video')""",
                (log_id, user_id),
            )
            return cursor.fetchone()
    finally:
        connection.close()


def enqueue_recording_analysis(
    log_id: int, user_id: int, *, current_date: str | None, user_time_zone: str,
) -> None:
    """Add a confirmed recording to the durable final-analysis queue."""
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """INSERT INTO recording_analysis_jobs
                   (log_id, user_id, journal_date, user_time_zone, status, next_attempt_at)
                   VALUES (%s, %s, %s, %s, 'queued', UTC_TIMESTAMP())
                   ON DUPLICATE KEY UPDATE
                       journal_date = VALUES(journal_date), user_time_zone = VALUES(user_time_zone),
                       status = IF(status = 'succeeded', status, 'queued'),
                       next_attempt_at = IF(status = 'succeeded', next_attempt_at, UTC_TIMESTAMP()),
                       last_error = IF(status = 'succeeded', last_error, NULL)""",
                (log_id, user_id, current_date, user_time_zone),
            )
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def claim_recording_analysis_job(log_id: int) -> dict | None:
    """Atomically claim one due job so duplicate workers cannot analyze it twice."""
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """UPDATE recording_analysis_jobs
                   SET status = 'processing', attempt_count = attempt_count + 1
                   WHERE log_id = %s
                     AND status IN ('queued', 'retrying')
                     AND next_attempt_at <= UTC_TIMESTAMP()""",
                (log_id,),
            )
            if cursor.rowcount != 1:
                connection.commit()
                return None
            cursor.execute("SELECT * FROM recording_analysis_jobs WHERE log_id = %s", (log_id,))
            job = cursor.fetchone()
        connection.commit()
        return job
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def get_due_recording_analysis_job_ids(limit: int = 10) -> list[int]:
    """Find jobs that survived a restart and are ready for another attempt."""
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """SELECT log_id FROM recording_analysis_jobs
                   WHERE status IN ('queued', 'retrying') AND next_attempt_at <= UTC_TIMESTAMP()
                   ORDER BY next_attempt_at ASC LIMIT %s""",
                (limit,),
            )
            return [int(row["log_id"]) for row in cursor.fetchall()]
    finally:
        connection.close()


def finish_recording_analysis_job(log_id: int) -> None:
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """UPDATE recording_analysis_jobs
                   SET status = 'succeeded', last_error = NULL WHERE log_id = %s""",
                (log_id,),
            )
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def retry_or_fail_recording_analysis_job(log_id: int, attempt_count: int, error: str) -> int | None:
    """Schedule exponential backoff and return its delay, or mark a job terminally failed."""
    delay_seconds = min(15 * (4 ** max(0, attempt_count - 1)), 15 * 60)
    is_terminal = attempt_count >= MAX_ANALYSIS_ATTEMPTS
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            if is_terminal:
                cursor.execute(
                    """UPDATE recording_analysis_jobs
                       SET status = 'failed', last_error = %s WHERE log_id = %s""",
                    (error, log_id),
                )
            else:
                next_attempt_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(seconds=delay_seconds)
                cursor.execute(
                    """UPDATE recording_analysis_jobs
                       SET status = 'retrying', next_attempt_at = %s, last_error = %s
                       WHERE log_id = %s""",
                    (next_attempt_at, error, log_id),
                )
        connection.commit()
        return None if is_terminal else delay_seconds
    except Exception:
        connection.rollback()
        raise
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
