"""TiDB Cloud connections and schema setup."""

import os
import ssl
from pathlib import Path

import pymysql
from pymysql.err import ProgrammingError
from pymysql.connections import Connection


def get_tidb_config() -> dict[str, object]:
    """Read and validate separate TiDB Cloud connection settings."""
    host = os.getenv("DB_HOST")
    port_value = os.getenv("DB_PORT")
    username = os.getenv("DB_USERNAME")
    password = os.getenv("DB_PASSWORD")
    database = os.getenv("DB_DATABASE")
    if not all((host, port_value, username, password, database)):
        raise KeyError("DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, and DB_DATABASE are required")

    if not host.endswith(".tidbcloud.com"):
        raise ValueError("DB_HOST must point to a TiDB Cloud endpoint")
    try:
        port = int(port_value)
    except ValueError as error:
        raise ValueError("DB_PORT must be a valid port number") from error
    if not 1 <= port <= 65535:
        raise ValueError("DB_PORT must be between 1 and 65535")

    ca_path = os.getenv("TIDB_CA_PATH")
    if ca_path and not Path(ca_path).is_file():
        raise ValueError("TIDB_CA_PATH must point to a valid CA certificate")

    return {
        "host": host,
        "port": port,
        "user": username,
        "password": password,
        "database": database,
        "ssl": ssl.create_default_context(cafile=ca_path or None),
    }


def get_connection() -> Connection:
    """Open a TLS-verified connection to TiDB Cloud."""
    options = {
        **get_tidb_config(),
        "charset": "utf8mb4",
        "autocommit": False,
        "cursorclass": pymysql.cursors.DictCursor,
        "connect_timeout": 10,
    }
    return pymysql.connect(**options)


def initialize_database() -> None:
    """Create the account and audio/AV log tables if they do not exist."""
    statements = (
        """CREATE TABLE IF NOT EXISTS users (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(80) NOT NULL UNIQUE,
            email VARCHAR(254) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
        """CREATE TABLE IF NOT EXISTS audio_visual_logs (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            user_id BIGINT UNSIGNED NOT NULL,
            log_date DATETIME NOT NULL,
            media_type VARCHAR(20) NOT NULL,
            storage_path VARCHAR(1024) NOT NULL,
            title VARCHAR(200),
            notes TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX ix_audio_visual_logs_user_id (user_id),
            INDEX ix_audio_visual_logs_log_date (log_date),
            CONSTRAINT fk_audio_visual_logs_user FOREIGN KEY (user_id)
                REFERENCES users (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
        """CREATE TABLE IF NOT EXISTS journal_entries (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            user_id VARCHAR(255) NOT NULL,
            transcript MEDIUMTEXT NOT NULL,
            entry_type VARCHAR(30) NOT NULL,
            core_topic VARCHAR(200) NOT NULL,
            emotion VARCHAR(80) NOT NULL,
            summary TEXT NOT NULL,
            key_takeaways JSON,
            reflection_question JSON,
            reflection_quote TEXT,
            temporal_references TEXT,
            embedding JSON,
            video_filename VARCHAR(255),
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX ix_journal_entries_user_created (user_id, created_at),
            INDEX ix_journal_entries_topic (core_topic)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
        """CREATE TABLE IF NOT EXISTS important_events (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            entry_id BIGINT UNSIGNED NOT NULL,
            user_id VARCHAR(255) NOT NULL,
            title VARCHAR(200) NOT NULL,
            scheduled_for DATETIME NULL,
            original_time_reference VARCHAR(255),
            reminder_reason TEXT,
            status VARCHAR(30) NOT NULL DEFAULT 'pending',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX ix_important_events_user_date (user_id, scheduled_for),
            INDEX ix_important_events_entry (entry_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
        """CREATE TABLE IF NOT EXISTS revisit_cues (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            source_entry_id BIGINT UNSIGNED NOT NULL,
            user_id VARCHAR(255) NOT NULL,
            topic VARCHAR(200) NOT NULL,
            trigger_text VARCHAR(500) NOT NULL,
            trigger_concepts JSON,
            reason TEXT,
            baseline_questions JSON,
            status VARCHAR(30) NOT NULL DEFAULT 'active',
            last_suggested_at DATETIME NULL,
            last_dismissed_at DATETIME NULL,
            shown_count INT UNSIGNED NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX ix_revisit_cues_user_status (user_id, status),
            INDEX ix_revisit_cues_source (source_entry_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
    )
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            for statement in statements:
                cursor.execute(statement)
            # TEMPORARY-MIGRATION-SAFE: existing hackathon databases may have the
            # earlier revisit_cues schema. These statements are safe to rerun and
            # can be replaced by a formal migration tool during a later refactor.
            for statement in (
                "ALTER TABLE revisit_cues ADD COLUMN last_suggested_at DATETIME NULL",
                "ALTER TABLE revisit_cues ADD COLUMN last_dismissed_at DATETIME NULL",
                "ALTER TABLE revisit_cues ADD COLUMN shown_count INT UNSIGNED NOT NULL DEFAULT 0",
            ):
                try:
                    cursor.execute(statement)
                except ProgrammingError as error:
                    if error.args and error.args[0] != 1060:  # Duplicate column
                        raise
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()
