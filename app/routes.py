"""HTTP routes for the starter app."""

from flask import Blueprint, current_app, jsonify, render_template

from pymysql.err import MySQLError

from app.database import get_connection

main = Blueprint("main", __name__)


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
