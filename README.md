# Weekly Screen Preview

## Requirements

- Python 3.10+ and pip for the Flask backend
- Node.js 20.19+ or 22.12+ and npm for the React frontend

The dependency manifests are split by ecosystem:

- `requirements.txt` lists Python packages for Flask.
- `frontend/package.json` lists frontend packages, and `frontend/package-lock.json` pins their resolved versions.

## Run locally

Start Flask in Terminal 1 from the repository root:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python run.py
```

Start the React development server in Terminal 2, also from the repository root:

```powershell
cd frontend
npm ci
npm run dev
```

Open <http://127.0.0.1:5173/static/frontend/>. Vite serves the page with live reload; Flask runs on port 5000. `npm ci` installs the exact frontend versions in the lockfile. Run it after cloning or whenever the frontend lockfile changes.

The current preview uses mock weekly entries. Flask currently exposes `/health`; weekly-data integration is not configured.

To share the development app with friends on the same network, run Flask and Vite with network binding enabled. Run these in place of the matching startup commands above:

```powershell
$env:FLASK_HOST="0.0.0.0"
python run.py
```

```powershell
cd frontend
$env:VITE_HOST="0.0.0.0"
npm run dev
```

Friends should open `http://YOUR_IPV4_ADDRESS:5173/static/frontend/`.

## Serve the built frontend through Flask

From the `frontend` directory, install frontend dependencies and build the React app:

```powershell
npm ci
npm run build
```

The build is written to `app/static/frontend`. Then start Flask from the repository root and open <http://127.0.0.1:5000/>. For hosting, build the frontend as part of deployment and run Flask through the host's supported WSGI server rather than Flask's development server.

## Configuration

Copy `.env.example` to `.env` and adjust values as needed. The app reads `FLASK_SECRET_KEY` and `FLASK_DEBUG` from the environment. A development key is used by default; set a unique secret key before deploying.

## Project layout

```text
app/
  __init__.py       Flask application factory
  routes.py         Page and health routes
  templates/        Jinja HTML templates
  static/           Built frontend and static assets
frontend/
  package.json      Frontend dependencies and scripts
  package-lock.json Locked frontend dependency versions
requirements.txt    Python dependencies
run.py              Local development entry point
```

The health check is available at `/health`. Add Flask routes in `app/routes.py`.

On macOS or Linux, use `python3 -m venv .venv` and `source .venv/bin/activate` in place of the Windows virtual-environment commands. The remaining Python and npm commands are the same.
