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

## Configuration

Copy `.env.example` to `.env` and adjust values as needed. The app reads `FLASK_SECRET_KEY` and `FLASK_DEBUG` from the environment. A development key is used by default; set a unique secret key before deploying.

## Project layout

```text
app/
  __init__.py       Flask application factory
  routes.py         Page and health routes
  templates/        Jinja HTML templates
  static/           CSS and JavaScript
run.py              Local development entry point
requirements.txt    Python dependencies
```

The health check is available at `/health`. Add application routes in `app/routes.py` and page templates under `app/templates/`.
