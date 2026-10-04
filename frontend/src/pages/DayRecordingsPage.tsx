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

function formatFileSize(size: number | string) {
  const bytes = Number(size);
  if (!Number.isFinite(bytes)) return String(size);
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

export function DayRecordingsPage() {
  const date = new URLSearchParams(window.location.search).get('date') ?? '';
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [message, setMessage] = useState('Loading recordings…');

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

  const formattedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? formatSelectedDate(date) : 'Selected day';

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
              <dl className="mt-5 grid gap-x-6 gap-y-3 border-t border-stone-200 pt-4 text-sm sm:grid-cols-2">
                <div><dt className="font-medium text-stone-500">Log ID</dt><dd>{recording.id}</dd></div>
                <div><dt className="font-medium text-stone-500">User ID</dt><dd>{recording.user_id}</dd></div>
                <div><dt className="font-medium text-stone-500">Media type</dt><dd>{recording.media_type}</dd></div>
                <div><dt className="font-medium text-stone-500">Title</dt><dd>{recording.title || '—'}</dd></div>
                <div><dt className="font-medium text-stone-500">Log date</dt><dd>{new Date(recording.log_date).toLocaleString()}</dd></div>
                <div><dt className="font-medium text-stone-500">Created at</dt><dd>{new Date(recording.created_at).toLocaleString()}</dd></div>
                <div><dt className="font-medium text-stone-500">Storage path</dt><dd className="break-all">{recording.storage_path}</dd></div>
                <div><dt className="font-medium text-stone-500">Notes</dt><dd className="whitespace-pre-wrap">{recording.notes || '—'}</dd></div>
                <div><dt className="font-medium text-stone-500">Original filename</dt><dd className="break-all">{recording.original_filename}</dd></div>
                <div><dt className="font-medium text-stone-500">MIME type</dt><dd>{recording.mime_type}</dd></div>
                <div><dt className="font-medium text-stone-500">File size</dt><dd>{formatFileSize(recording.file_size_bytes)}</dd></div>
                <div><dt className="font-medium text-stone-500">Stored chunks</dt><dd>{recording.chunk_count}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
