"""Database operations for authenticated user profiles."""

from pathlib import Path
from urllib.parse import urlparse

from pymysql.err import IntegrityError
from werkzeug.security import check_password_hash, generate_password_hash

from app.database import get_connection


class DuplicateUsernameError(ValueError):
    """Raised when another account already uses the requested username."""


class InvalidCurrentPasswordError(ValueError):
    """Raised when the current password does not match the stored hash."""


class ProfileService:
    """Read and update profile data using the project's TiDB connection helper."""

    def get_profile(self, user_id: int) -> dict | None:
        connection = get_connection()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """SELECT username, email, profile_picture
                       FROM users WHERE id = %s LIMIT 1""",
                    (user_id,),
                )
                return cursor.fetchone()
        finally:
            connection.close()

    def update_username(self, user_id: int, username: str) -> None:
        connection = get_connection()
        try:
            with connection.cursor() as cursor:
                cursor.execute("UPDATE users SET username = %s WHERE id = %s", (username, user_id))
            connection.commit()
        except IntegrityError as error:
            connection.rollback()
            if error.args and error.args[0] == 1062:
                raise DuplicateUsernameError from error
            raise
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def update_picture(self, user_id: int, image: bytes) -> None:
        connection = get_connection()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """UPDATE users
                       SET profile_picture = %s WHERE id = %s""",
                    (image, user_id),
                )
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def update_password(self, user_id: int, current_password: str, new_password: str) -> None:
        connection = get_connection()
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT password_hash FROM users WHERE id = %s LIMIT 1", (user_id,))
                row = cursor.fetchone()
                if row is None or not check_password_hash(row["password_hash"], current_password):
                    raise InvalidCurrentPasswordError
                cursor.execute(
                    "UPDATE users SET password_hash = %s WHERE id = %s",
                    (generate_password_hash(new_password), user_id),
                )
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def delete_account(self, user_id: int) -> bool:
        connection = get_connection()
        legacy_uploads: list[str] = []
        try:
            with connection.cursor() as cursor:
                def table_exists(table: str) -> bool:
                    cursor.execute(
                        """SELECT 1 FROM information_schema.TABLES
                           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s LIMIT 1""",
                        (table,),
                    )
                    return cursor.fetchone() is not None

                log_ids: list[int] = []
                if table_exists("audio_visual_logs"):
                    cursor.execute(
                        "SELECT id, storage_path FROM audio_visual_logs WHERE user_id = %s",
                        (user_id,),
                    )
                    logs = cursor.fetchall()
                    log_ids = [log["id"] for log in logs]
                    legacy_uploads = [log["storage_path"] for log in logs if log.get("storage_path")]

                if log_ids:
                    placeholders = ", ".join(["%s"] * len(log_ids))
                    for table in ("recording_chunks", "recording_media"):
                        if table_exists(table):
                            cursor.execute(
                                f"DELETE FROM {table} WHERE log_id IN ({placeholders})",
                                tuple(log_ids),
                            )
                    cursor.execute("DELETE FROM audio_visual_logs WHERE user_id = %s", (user_id,))

                # These related tables are optional and use a string user_id.
                for table in ("important_events", "revisit_cues", "journal_entries"):
                    if table_exists(table):
                        cursor.execute(f"DELETE FROM {table} WHERE user_id = %s", (str(user_id),))
                cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
                if cursor.rowcount != 1:
                    connection.rollback()
                    return False
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

        upload_dir = Path(__file__).resolve().parents[1] / "uploads"
        for stored_path in legacy_uploads:
            path = urlparse(stored_path).path
            if not path.startswith("/uploads/"):
                continue
            filename = Path(path).name
            candidate = upload_dir / filename
            if candidate.parent == upload_dir:
                try:
                    candidate.unlink(missing_ok=True)
                except OSError:
                    pass
        return True
