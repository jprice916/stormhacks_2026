# Flask Web App

A small Flask web app starter with server-rendered templates and static assets.

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

Open <http://127.0.0.1:5000>. The app reloads automatically when `FLASK_DEBUG=1` is set.

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
