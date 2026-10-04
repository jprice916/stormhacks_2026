import { useEffect, useState } from 'react';
import { frontendPaths } from '../lib/paths';

type VideoRecord = {
  id: number;
  filename: string;
  recorded_at: string;
  recording_url: string;
  analysis: FinalAnalysis | null;
  analysis_status?: 'queued' | 'processing' | 'retrying' | 'saved' | 'failed' | 'skipped' | null;
  analysis_error?: string | null;
  transcript_available?: boolean;
};

type FinalAnalysis = {
  entry_type?: string;
  core_topic?: string;
  emotion?: string;
  summary?: string;
  concise_summary?: string;
  key_takeaways?: string[];
  important_events?: Array<{ title?: string; scheduled_for?: string | null }>;
  growth_signal?: {
    type?: string | null;
    topic?: string | null;
    baseline_questions?: Array<{ question?: string }>;
  };
};

async function readJson(response: Response) {
  const body = await response.text();
  try {
    return JSON.parse(body) as { videos?: VideoRecord[]; message?: string };
  } catch {
    return { message: `Server returned HTTP ${response.status} instead of JSON.` };
  }
}

export function MyVideosPage() {
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [message, setMessage] = useState('Loading your videos…');

  const loadVideos = async () => {
    const response = await fetch('/api/recordings');
    const result = await readJson(response);
    if (!response.ok) throw new Error(result.message || 'Could not load videos.');
    setVideos(result.videos || []);
    setMessage('');
  };

  useEffect(() => {
    void loadVideos().catch((error) => setMessage(error instanceof Error ? error.message : 'Could not load videos.'));
    const refresh = window.setInterval(() => {
      if (videos.some((video) => ['queued', 'processing', 'retrying'].includes(video.analysis_status || ''))) {
        void loadVideos().catch(() => undefined);
      }
    }, 4_000);
    return () => window.clearInterval(refresh);
  }, [videos]);

  return (
    <main>
      <h1>My videos</h1>
      <p>Debug page: videos stored for the signed-in account.</p>
<<<<<<< HEAD
      <p><a href={frontendPaths.logger}>Record a video</a></p>
=======
      <p><a href="/static/frontend/logger">Record a video</a></p>
>>>>>>> origin/DB

      {message && <p role="status">{message}</p>}
      {!message && videos.length === 0 && <p>No saved videos yet.</p>}

      {videos.map((video) => (
        <section key={video.id} style={{ borderTop: '1px solid #ccc', display: 'flex', flexWrap: 'wrap', gap: '16px', padding: '16px 0' }}>
          <div>
          <h2>{video.filename}</h2>
          <p>{new Date(video.recorded_at).toLocaleString()}</p>
          <video controls playsInline preload="auto" src={`${video.recording_url}?playback=${video.id}-${Date.parse(video.recorded_at)}`} style={{ maxWidth: '100%', width: '360px' }} />
          </div>
          <div style={{ flex: '1 1 280px' }}>
            <h3>Final analysis</h3>
            {video.analysis ? (
              <>
                <p><strong>Topic:</strong> {video.analysis.core_topic || '—'}</p>
                <p><strong>Type:</strong> {video.analysis.entry_type || '—'} · <strong>Emotion:</strong> {video.analysis.emotion || '—'}</p>
                <p><strong>Detailed summary</strong></p>
                <p>{video.analysis.summary || 'No summary returned.'}</p>
                {video.analysis.concise_summary && <><p><strong>Quick recap</strong></p><p>{video.analysis.concise_summary}</p></>}
                {!!video.analysis.key_takeaways?.length && <><strong>Takeaways</strong><ul>{video.analysis.key_takeaways.map((takeaway, index) => <li key={index}>{takeaway}</li>)}</ul></>}
                {video.analysis.growth_signal?.type && <p><strong>Growth signal:</strong> {video.analysis.growth_signal.topic || video.analysis.growth_signal.type}</p>}
                {!!video.analysis.important_events?.length && <><strong>Important events</strong><ul>{video.analysis.important_events.map((event, index) => <li key={index}>{event.title}{event.scheduled_for ? ` — ${event.scheduled_for}` : ''}</li>)}</ul></>}
              </>
            ) : <>
              {['queued', 'processing', 'retrying'].includes(video.analysis_status || '')
                ? <p>Final analysis is processing automatically.</p>
                : <p>No final analysis was saved for this recording.</p>}
              {video.analysis_status === 'failed' && <p><strong>Reason:</strong> {video.analysis_error || 'Automatic analysis retries were exhausted.'}</p>}
              {video.analysis_status === 'skipped' && <p><strong>Reason:</strong> {video.analysis_error || 'No browser transcript was available.'}</p>}
              {!video.analysis_status && <p>This older recording was saved before analysis status was tracked.</p>}
            </>}
          </div>
        </section>
      ))}
    </main>
  );
}
