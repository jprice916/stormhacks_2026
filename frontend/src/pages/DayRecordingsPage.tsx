import { useEffect, useState } from 'react';
import { loadWeeklySummaries, type JournalSummary } from '../data/weeklyJournal';

type Recording = {
  id: number;
  filename: string;
  recorded_at: string;
  recording_url: string;
  mime_type: string;
};

type RecordingsResponse = {
  videos?: Recording[];
  message?: string;
};

function formatSelectedDate(dateValue: string) {
  const [year, month, day] = dateValue.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function getWeekStart(dateValue: string) {
  const [year, month, day] = dateValue.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - date.getDay());
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function DayRecordingsPage() {
  const date = new URLSearchParams(window.location.search).get('date') ?? '';
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [message, setMessage] = useState('Loading recordings…');
  const [summaries, setSummaries] = useState<JournalSummary[]>([]);
  const [summaryMessage, setSummaryMessage] = useState('Loading summary…');

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setMessage('Choose a day from the weekly carousel to view its recordings.');
      return;
    }

    let active = true;
    fetch(`/api/recordings?date=${encodeURIComponent(date)}`, { credentials: 'same-origin' })
      .then(async (response) => {
        const result = await response.json() as RecordingsResponse;
        if (!response.ok) throw new Error(result.message || 'Could not load recordings.');
        return result.videos ?? [];
      })
      .then((items) => {
        if (!active) return;
        setRecordings(items);
        setMessage('');
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : 'Could not load recordings.');
      });

    return () => { active = false; };
  }, [date]);

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setSummaryMessage('');
      return;
    }

    let active = true;
    setSummaries([]);
    setSummaryMessage('Loading summary…');
    loadWeeklySummaries(getWeekStart(date))
      .then((entriesByDate) => {
        if (!active) return;
        setSummaries(entriesByDate[date] ?? []);
        setSummaryMessage('');
      })
      .catch((error: unknown) => {
        if (!active) return;
        setSummaryMessage(error instanceof Error ? error.message : 'Could not load this day’s summary.');
      });

    return () => { active = false; };
  }, [date]);

  const formattedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? formatSelectedDate(date) : 'Selected day';

  return (
    <main className="min-h-screen bg-[#fbfaf8] px-5 py-8 text-stone-800 sm:px-10 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <a className="text-sm underline decoration-stone-400 underline-offset-4 hover:text-[#887445]" href="/static/frontend/weekly">
          Back to your week
        </a>
        <header className="mb-8 mt-6">
          <p className="text-sm uppercase tracking-[0.18em] text-stone-500">Your recordings</p>
          <h1 className="mt-2 font-serif text-3xl sm:text-4xl">{formattedDate}</h1>
        </header>

        {message && <p className="rounded-xl bg-white p-5" role="status">{message}</p>}
        {!message && recordings.length === 0 && (
          <p className="rounded-xl bg-white p-5">No recordings were saved for this day.</p>
        )}

        <div className="space-y-6">
          {recordings.map((recording) => (
            <article className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7" key={recording.id}>
              <h2 className="font-serif text-xl">{recording.filename || 'Recording'}</h2>
              <p className="mb-4 mt-1 text-sm text-stone-500">
                {new Date(recording.recorded_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </p>
              {recording.mime_type.startsWith('audio/') ? (
                <audio
                  className="w-full"
                  controls
                  preload="metadata"
                  src={`${recording.recording_url}?playback=${recording.id}-${Date.parse(recording.recorded_at)}`}
                />
              ) : (
                <video
                  className="max-h-[70vh] w-full rounded-xl bg-stone-950"
                  controls
                  playsInline
                  preload="metadata"
                  src={`${recording.recording_url}?playback=${recording.id}-${Date.parse(recording.recorded_at)}`}
                />
              )}
            </article>
          ))}
        </div>

        {!message && recordings.length > 0 && (
          <section aria-label="Full journal summaries" className="mt-8 rounded-2xl border border-stone-200 bg-white p-5 sm:p-7">
            <h2 className="font-serif text-2xl">Full summary</h2>
            {summaryMessage && <p className="mt-4 text-sm text-stone-500" role="status">{summaryMessage}</p>}
            {!summaryMessage && summaries.length === 0 && <p className="mt-4 text-stone-600">No journal summary was saved for this day.</p>}
            <div className="mt-4 space-y-4">
              {summaries.map((summary, index) => (
                <p className="leading-7 text-stone-700" key={`${index}-${summary.full_summary}`}>{summary.full_summary}</p>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
