import { useEffect, useState } from 'react';

type VideoRecord = {
  id: number;
  filename: string;
  recorded_at: string;
  recording_url: string;
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

  useEffect(() => {
    const loadVideos = async () => {
      try {
        const response = await fetch('/api/recordings');
        const result = await readJson(response);
        if (!response.ok) throw new Error(result.message || 'Could not load videos.');
        setVideos(result.videos || []);
        setMessage('');
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not load videos.');
      }
    };
    void loadVideos();
  }, []);

  return (
    <main>
      <h1>My videos</h1>
      <p>Debug page: videos stored for the signed-in account.</p>
      <p><a href="/static/frontend/logger">Record a video</a></p>

      {message && <p role="status">{message}</p>}
      {!message && videos.length === 0 && <p>No saved videos yet.</p>}

      {videos.map((video) => (
        <section key={video.id}>
          <h2>{video.filename}</h2>
          <p>{new Date(video.recorded_at).toLocaleString()}</p>
          <video controls playsInline preload="auto" src={`${video.recording_url}?playback=${video.id}-${Date.parse(video.recorded_at)}`} />
        </section>
      ))}
    </main>
  );
}
