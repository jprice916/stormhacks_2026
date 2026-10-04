import { useEffect, useState } from 'react';
import { frontendPaths } from '../lib/paths';

type Recording = {
  id: number;
  user_id: number;
  log_date: string;
  media_type: string;
  storage_path: string;
  title: string | null;
  notes: string | null;
  created_at: string;
  filename: string;
  recorded_at: string;
  recording_url: string;
  mime_type: string;
  original_filename: string;
  file_size_bytes: number | string;
  chunk_count: number;
  analysis?: Record<string, unknown> | null;
  transcript?: string | null;
};

type RecordingsResponse = {
  videos?: Recording[];
  message?: string;
};

type JournalSummary = {
  full_summary?: string;
};

type JournalSummariesResponse = {
  entries_by_date?: Record<string, JournalSummary[]>;
  summaries?: Record<string, string[]>;
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

function sundayFor(dateValue: string) {
  const [year, month, day] = dateValue.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - date.getDay());
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function DayRecordingsPage() {
  const date = new URLSearchParams(window.location.search).get('date') ?? '';
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [message, setMessage] = useState('Loading recordings…');
  const [daySummary, setDaySummary] = useState('');

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
      setDaySummary('');
      return;
    }

    const controller = new AbortController();
    fetch(`/api/journal/summaries?week_start=${encodeURIComponent(sundayFor(date))}`, {
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json() as JournalSummariesResponse;
        if (!response.ok) throw new Error(result.message || 'Could not load the journal summary.');
        const detailedSummaries = (result.entries_by_date?.[date] ?? [])
          .map((entry) => entry.full_summary)
          .filter((summary): summary is string => Boolean(summary?.trim()));
        return detailedSummaries.length > 0
          ? detailedSummaries
          : result.summaries?.[date] ?? [];
      })
      .then((summaries) => setDaySummary(summaries.join('\n\n')))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setDaySummary('');
      });

    return () => controller.abort();
  }, [date]);

  const formattedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? formatSelectedDate(date) : 'Selected day';
  const latestTranscript = recordings[0]?.transcript?.trim();

  return (
    <main className="min-h-screen bg-[#fbfaf8] px-5 py-8 text-stone-800 sm:px-10 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <a className="text-sm underline decoration-stone-400 underline-offset-4 hover:text-[#887445]" href={frontendPaths.weekly}>
          Back to your week
        </a>
        <header className="mb-8 mt-6">
          <p className="text-sm uppercase tracking-[0.18em] text-stone-500">Your recordings</p>
          <h1 className="mt-2 font-serif text-3xl sm:text-4xl">{formattedDate}</h1>
        </header>

        {daySummary && (
          <section className="mb-8 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7" aria-labelledby="day-summary-title">
            <p className="text-sm uppercase tracking-[0.18em] text-stone-500">Journal summary</p>
            <h2 className="mt-2 font-serif text-2xl" id="day-summary-title">Your day, in full</h2>
            <p className="mt-4 whitespace-pre-wrap text-base leading-7 text-stone-700">{daySummary}</p>
          </section>
        )}

        {latestTranscript && (
          <section className="mb-8 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7" aria-labelledby="latest-transcript-title">
            <p className="text-sm uppercase tracking-[0.18em] text-stone-500">Most recent recording</p>
            <h2 className="mt-2 font-serif text-2xl" id="latest-transcript-title">Transcript</h2>
            <p className="mt-4 whitespace-pre-wrap text-base leading-7 text-stone-700">{latestTranscript}</p>
          </section>
        )}

        {message && <p className="rounded-xl bg-white p-5" role="status">{message}</p>}
        {!message && recordings.length === 0 && (
          <p className="rounded-xl bg-white p-5">No recordings were saved for this day.</p>
        )}

        <div className="space-y-6">
          {recordings.map((recording) => (
            <article className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-7" key={recording.id}>
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
              {recording.analysis && (
                <details className="mt-5 border-t border-stone-200 pt-4">
                  <summary className="cursor-pointer text-sm font-medium text-stone-700">Analysis JSON</summary>
                  <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-stone-950 p-4 text-xs leading-5 text-stone-100">
                    {JSON.stringify(recording.analysis, null, 2)}
                  </pre>
                </details>
              )}
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
