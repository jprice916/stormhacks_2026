# Flask Web App

A Flask web app with a webcam and microphone recording test page.

## Requirements

- Python 3.10+
- pip

## Run locally

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python run.py
```

Open <http://127.0.0.1:5000>. The app reloads automatically when `FLASK_DEBUG=1` is set. Camera access works on `localhost` or HTTPS and requires browser permission.

## Recording test page

Select **Start recording** to request camera and microphone access, then **Stop** when finished. The page asks for 1280×720 at up to 30 FPS (the browser may choose another supported size); the badge shows the actual camera resolution. Recordings can be previewed and downloaded in the browser. The timer stays at the bottom of the page.

**Send to TiDB (placeholder)** posts the WebM recording to `POST /api/recordings`. The Flask endpoint currently confirms receipt and responds that nothing was saved; no database or file storage is connected. See `sql/recordings.sql` for a starting TiDB metadata table. The suggested design stores the video in object storage and saves its URI and metadata in TiDB.

On macOS or Linux, activate the environment with `source .venv/bin/activate`.

## TiDB Cloud setup

The app connects only to TiDB Cloud. It uses PyMySQL to speak TiDB's MySQL-compatible wire protocol; no MySQL server is supported. Create a TiDB Cloud cluster, allow the machine running this app in its IP access list, and use the cluster's **Connect** dialog to get the host, port, username, password, database name, and CA certificate. TLS certificate verification is enabled.

Copy `.env.example` to `.env` and set `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, and `DB_DATABASE` using the values from TiDB Cloud. Set `TIDB_CA_PATH` to the downloaded CA certificate path when your cluster provides one. Passwords are read as plain environment values, so URL-encoding is not needed.

Never commit `.env` or the CA certificate.

Install dependencies and create the initial tables:

```powershell
python -m pip install -r requirements.txt
flask --app run.py init-db
python run.py
```

Visit `/database` to view recent audio/video log records, or check `/health/db` for a JSON connection status. The initial schema includes `users` and `audio_visual_logs`. User passwords are stored as Werkzeug password hashes. `app.models.create_user` and `app.models.verify_password` provide account storage and password checking; `app.models.create_audio_visual_log` stores dated log metadata. Audio/video files themselves should live in file or object storage, with the path recorded in TiDB. `flask init-db` creates missing tables for initial setup; use database migrations for later schema changes.

For sample accounts and media log rows, run `seed_demo.sql` with the app database selected. It creates the `users` and `audio_visual_logs` tables if missing, then adds sample records. It is safe to rerun and uses the demo password `DemoPass123!` for all three sample users.

The app reads `FLASK_SECRET_KEY` and `FLASK_DEBUG` from `.env`. Set a unique secret key before deploying.

## Project layout

```text
app/
  __init__.py       Flask application factory
  models.py         User and audio/AV log database models
  routes.py         Page and health routes
  templates/        Jinja HTML templates
  static/           CSS and JavaScript
run.py              Local development entry point
requirements.txt    Python dependencies
```

The health check is available at `/health`. Add application routes in `app/routes.py` and page templates under `app/templates/`.
