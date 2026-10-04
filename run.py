"""Run the Flask application locally."""

import os
import shutil
import subprocess
from pathlib import Path

from app import create_app

app = create_app()

if __name__ == "__main__":
    frontend_dir = Path(__file__).resolve().parent / "frontend"
    npm = shutil.which("npm")
    if not npm:
        raise SystemExit("Node.js and npm are required to start the React frontend.")

    frontend = subprocess.Popen([npm, "run", "dev:react"], cwd=frontend_dir)
    try:
        app.run(
            host=os.getenv("FLASK_HOST", "127.0.0.1"),
            port=int(os.getenv("FLASK_PORT", "5000")),
            debug=os.getenv("FLASK_DEBUG", "0").lower() in {"1", "true", "yes"},
            use_reloader=False,
        )
    finally:
        frontend.terminate()
        try:
            frontend.wait(timeout=5)
        except subprocess.TimeoutExpired:
            frontend.kill()
            frontend.wait()
