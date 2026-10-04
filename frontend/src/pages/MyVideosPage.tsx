import { useEffect, useState } from 'react';
import { frontendPaths } from '../lib/paths';

type VideoRecord = {
  id: number;
  filename: string;
  recorded_at: string;
  recording_url: string;
  media_type?: string;
  mime_type?: string;
};

type VideosResponse = {
  videos?: VideoRecord[];
  message?: string;
};

type PageState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; videos: VideoRecord[] };

async function readJson(response: Response): Promise<VideosResponse> {
  try {
    return await response.json() as VideosResponse;
  } catch {
    return { message: `The server returned an unexpected response (HTTP ${response.status}).` };
  }
}

function formatRecordedDate(value: string): string {
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(isDateOnly ? `${value}T12:00:00` : value);

  if (Number.isNaN(date.getTime())) return 'Date unavailable';

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function isAudioRecording(video: VideoRecord): boolean {
  return video.mime_type?.startsWith('audio/') === true || video.media_type?.toLowerCase() === 'audio';
}

function recordingSource(video: VideoRecord): string {
  const separator = video.recording_url.includes('?') ? '&' : '?';
  const recordedAt = Date.parse(video.recorded_at);
  const cacheKey = Number.isNaN(recordedAt) ? video.recorded_at : recordedAt;
  return `${video.recording_url}${separator}playback=${video.id}-${encodeURIComponent(cacheKey)}`;
}

export function MyVideosPage() {
  const [pageState, setPageState] = useState<PageState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadVideos() {
      setPageState({ status: 'loading' });

      try {
        const response = await fetch('/api/recordings', {
          credentials: 'same-origin',
          signal: controller.signal,
        });
        const result = await readJson(response);

        if (!response.ok) {
          throw new Error(result.message || 'Your videos could not be loaded. Please try again.');
        }

        setPageState({ status: 'ready', videos: result.videos ?? [] });
      } catch (error) {
        if (controller.signal.aborted) return;

        setPageState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Your videos could not be loaded. Please try again.',
        });
      }
    }

    void loadVideos();
    return () => controller.abort();
  }, [reloadKey]);

  const videos = pageState.status === 'ready' ? pageState.videos : [];

  return (
    <main className="min-h-screen bg-[#f9f6f1] px-5 pb-16 pt-7 text-[#473c21] sm:px-10 sm:pb-24 sm:pt-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#ddd5c3] pb-6">
          <a className="font-serif text-xl italic tracking-wide sm:text-2xl" href={frontendPaths.home}>
            Week by week
          </a>
          <nav aria-label="My videos navigation" className="flex items-center gap-3 sm:gap-5">
            <a
              className="rounded-full border-2 border-[#998350] px-4 py-2 text-sm font-medium text-[#473c21] transition-colors hover:bg-[#eeebe4] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#473c21] sm:px-5 sm:text-base"
              href={frontendPaths.weekly}
            >
              My weeks
            </a>
            <a
              className="text-sm text-[#887445] underline underline-offset-4 transition-colors hover:text-[#473c21] sm:text-base"
              href={frontendPaths.logger}
            >
              Record a moment
            </a>
          </nav>
        </header>

        <section className="mb-8 mt-10 sm:mb-10 sm:mt-14" aria-labelledby="my-videos-title">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#998350]">A little library</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-serif text-4xl leading-tight sm:text-5xl" id="my-videos-title">My videos</h1>
              <p className="mt-2 max-w-xl text-base leading-7 text-[#887445] sm:text-lg">
                The moments you recorded, ready to revisit whenever you need them.
              </p>
            </div>
            {pageState.status === 'ready' && pageState.videos.length > 0 ? (
              <p className="rounded-full border border-[#d7c69d] bg-[#eeebe4] px-4 py-2 text-sm text-[#887445]" aria-live="polite">
                {pageState.videos.length} {pageState.videos.length === 1 ? 'moment' : 'moments'} saved
              </p>
            ) : null}
          </div>
        </section>

        {pageState.status === 'loading' ? (
          <section className="rounded-2xl border-2 border-[#473c21] bg-[#fffdfa] p-8 text-center shadow-[5px_5px_0_#b39e6c] sm:p-12" aria-busy="true" aria-live="polite" role="status">
            <div aria-hidden="true" className="mx-auto mb-4 h-10 w-10 animate-pulse rounded-full border-2 border-[#bca880] bg-[#eeebe4]" />
            <p className="font-serif text-xl italic">Gathering your saved moments…</p>
          </section>
        ) : null}

        {pageState.status === 'error' ? (
          <section className="rounded-2xl border-2 border-[#473c21] bg-[#fffdfa] p-8 shadow-[5px_5px_0_#b39e6c] sm:p-10" aria-labelledby="videos-error-title" role="alert">
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-[#998350]">A small pause</p>
            <h2 className="mt-2 font-serif text-2xl" id="videos-error-title">We couldn’t open your library.</h2>
            <p className="mt-2 text-base leading-7 text-[#887445]">{pageState.message}</p>
            <button
              className="mt-6 rounded-full border-2 border-[#473c21] bg-[#473c21] px-5 py-3 text-sm font-medium text-[#f9f6f1] transition-colors hover:bg-[#887445] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#473c21]"
              onClick={() => setReloadKey((key) => key + 1)}
              type="button"
            >
              Try again
            </button>
          </section>
        ) : null}

        {pageState.status === 'ready' && videos.length === 0 ? (
          <section className="rounded-2xl border-2 border-[#473c21] bg-[#fffdfa] px-6 py-10 text-center shadow-[5px_5px_0_#b39e6c] sm:px-10 sm:py-14" aria-labelledby="videos-empty-title">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-[#bca880] bg-[#eeebe4] text-[#887445]" aria-hidden="true">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 32 32">
                <circle cx="16" cy="16" r="12.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="m13 11 8 5-8 5V11Z" fill="currentColor" />
              </svg>
            </span>
            <h2 className="mt-5 font-serif text-2xl" id="videos-empty-title">Your library is ready for its first moment.</h2>
            <p className="mx-auto mt-2 max-w-lg text-base leading-7 text-[#887445]">
              Record something you’d like to remember, and it’ll find a home here.
            </p>
            <a
              className="mt-6 inline-flex rounded-full border-2 border-[#473c21] bg-[#473c21] px-5 py-3 text-sm font-medium text-[#f9f6f1] transition-colors hover:bg-[#887445] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#473c21]"
              href={frontendPaths.logger}
            >
              Record a moment
            </a>
          </section>
        ) : null}

        {pageState.status === 'ready' && videos.length > 0 ? (
          <section className="grid gap-6 sm:grid-cols-2" aria-label="Saved recordings">
            {videos.map((video) => {
              const audio = isAudioRecording(video);
              const recordedDate = formatRecordedDate(video.recorded_at);
              const source = recordingSource(video);

              return (
                <article className="overflow-hidden rounded-2xl border-2 border-[#473c21] bg-[#fffdfa] shadow-[5px_5px_0_#b39e6c]" key={video.id}>
                  {audio ? (
                    <div className="flex min-h-44 flex-col justify-center gap-5 bg-[#eeebe4] p-5 sm:p-7">
                      <div className="flex items-center gap-3 text-[#887445]">
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#bca880] bg-[#f9f6f1]" aria-hidden="true">
                          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24">
                            <path d="M12 3v18m-4-14v10m8-12v14M4 9v6m16-9v12" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
                          </svg>
                        </span>
                        <span className="text-sm font-medium uppercase tracking-[0.14em]">Audio moment</span>
                      </div>
                      <audio aria-label={`Play ${video.filename}`} className="w-full" controls preload="metadata" src={source} />
                    </div>
                  ) : (
                    <video
                      aria-label={`Play ${video.filename}`}
                      className="aspect-video w-full bg-[#282314] object-contain"
                      controls
                      playsInline
                      preload="metadata"
                      src={source}
                    />
                  )}
                  <div className="p-5 sm:p-6">
                    <h2 className="break-words font-serif text-xl leading-snug">{video.filename || 'Recorded moment'}</h2>
                    <p className="mt-2 text-sm text-[#887445]">
                      Saved <time dateTime={video.recorded_at}>{recordedDate}</time>
                    </p>
                  </div>
                </article>
              );
            })}
          </section>
        ) : null}
      </div>
    </main>
  );
}
