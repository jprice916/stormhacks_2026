# SumUpLife

SumUpLife is a growth-based video diary. Record a private voice journal, receive optional questions while speaking, and revisit earlier moments when a later entry shows meaningful progress.

## What it does

- Records webcam video and microphone audio in the browser, up to five minutes at a requested 720p/30 FPS.
- Uses browser speech recognition for a live transcript. Every 20 seconds and after a three-second pause, Gemini can offer one optional reflection or baseline question.
- Generates a final JSON analysis only when the user selects **Generate final analysis**. The preview is not saved until **Complete & save** is selected.
- Stores the video in TiDB as chunked binary data, linked to the signed-in user.
- Stores the transcript, detailed summary, concise `On this day, you...` recap, takeaways, events, growth context, and revisit cues in TiDB.
- Shows a week carousel, detailed daily recordings, the latest saved transcript, and each recording's saved analysis JSON.
- Matches a new entry with a relevant entry at least 14 days old, using a Gemini embedding plus specific topic terms, then asks Gemini to verify the connection before showing a revisit suggestion.

## Stack

- Flask and Flask-Login
- React, TypeScript, Vite, and Tailwind CSS
- TiDB Cloud with PyMySQL
- Google Gemini for final analysis, embeddings, revisit verification, and live reflection questions

## Local setup

Requirements:

- Python 3.10+
- Node.js 20.19+ or 22.12+
- A TiDB Cloud database
- A Gemini API key

Create and activate the Python environment from the repository root:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Install frontend dependencies:

```powershell
cd frontend
npm install
cd ..
```

Create a `.env` file in the repository root:

```env
FLASK_SECRET_KEY=replace-with-a-long-random-value

DB_HOST=your-cluster.tidbcloud.com
DB_PORT=4000
DB_USERNAME=your-tidb-user
DB_PASSWORD=your-tidb-password
DB_DATABASE=your-database-name
TIDB_CA_PATH=C:\path\to\tidb-ca.pem

GEMINI_API_KEY=your-gemini-key
# JAYS_GEMINI_API_KEY is also supported.

# Optional overrides
GEMINI_ANALYSIS_MODEL=gemini-3.5-flash-lite
GEMINI_LIVE_MODEL=gemini-3.5-flash-lite
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
```

Never commit `.env` or the TiDB CA certificate.

Create or update the database tables:

```powershell
.\.venv\Scripts\python.exe -m flask --app run.py init-db
```

Start the React and Flask development servers:

```powershell
cd frontend
npm run dev
```

Vite serves the app at `http://127.0.0.1:5173/static/frontend/`. If port 5173 is already in use, Vite chooses the next available port and prints it. Flask runs on port 5001; Vite proxies API requests there.

## Recording flow

1. Sign in and open `/logger`.
2. Allow camera and microphone access. The preview starts automatically.
3. Record, pause if needed, and stop when finished.
4. Select **Generate final analysis** to inspect the JSON without uploading video or saving a journal entry.
5. Select **Complete & save** to store the recording, transcript, and analysis in TiDB.
6. Open **My weeks**, select a day, and click the centered carousel card to view recordings, the day summary, transcript, and analysis JSON.

## Final analysis format

Gemini returns a JSON object with this core structure:

```json
{
  "entry_type": "struggle | achievement | general",
  "core_topic": "short topic label",
  "emotion": "emotion or neutral",
  "summary": "detailed factual summary",
  "concise_summary": "On this day, you...",
  "key_takeaways": ["..."],
  "growth_signal": {
    "type": "education_start | career_goal | new_job | skill_building | aspiration | personal_growth | null",
    "topic": "topic or null",
    "future_revisit_reason": "reason or null"
  },
  "important_events": [
    {
      "title": "event",
      "scheduled_for": "ISO date/time or null",
      "original_time_reference": "exact phrase",
      "reminder_reason": "reason"
    }
  ],
  "future_revisit_cues": [
    {
      "trigger_concepts": ["specific concept"],
      "trigger": "future milestone",
      "reason": "why it matters"
    }
  ],
  "temporal_references": "relative wording or null"
}
```

Baseline questions belong to the live interim prompt, where the speaker can answer them aloud. Final analysis does not generate new questions after the recording has ended.

## Current limits

- Browser speech recognition support varies by browser. Chrome-based browsers give the best experience.
- Gemini quotas apply to both live questions and final analysis. The app surfaces API failures, but a quota increase or reset is needed when a configured model is exhausted.
- Important events are stored with a pending status. Automated notifications or a due-event surface are not implemented yet.
- The app is intended for local development and hackathon presentation. Use a production WSGI server, HTTPS, database migrations, and an access-controlled object-storage strategy before a public deployment.

## Project layout

```text
app/
  routes.py              Flask pages and API routes
  database.py            TiDB connection and schema initialization
  media_logs.py          Chunked recording storage and retrieval
  services/
    gemini_service.py    Analysis, embeddings, live prompts, revisits
    db_service.py        Journal, event, and revisit persistence
    revisit_service.py   Candidate retrieval and verification
frontend/
  src/pages/             Logger, weekly, day recordings, profile pages
  package.json           Vite development scripts
requirements.txt         Python dependencies
run.py                   Flask app entry point
```
