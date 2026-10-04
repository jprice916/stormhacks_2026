import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_RECORDING_MS = 5 * 60 * 1000;
const LIVE_COOLDOWN_SECONDS = 15;
const MIN_CHECKPOINT_WORDS = 10;

type LiveResponse = {
  should_prompt?: boolean;
  question?: string | null;
  topic?: string | null;
  error?: string;
  details?: string;
  rate_limited?: boolean;
  cooldown_seconds?: number;
  retry_after_seconds?: number;
};

type RecordingResponse = {
  message?: string;
  recording_url?: string;
  transcript?: string;
  analysis?: Record<string, unknown>;
  revisit_suggestion?: {
    cue_id?: number;
    suggestion?: string;
    source_created_at?: string;
    source_summary?: string;
  };
};

type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function formatTime(milliseconds: number) {
  const seconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function localTimestamp() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
}

async function readResponse<T>(response: Response): Promise<T & { message?: string }> {
  const body = await response.text();
  try {
    return JSON.parse(body) as unknown as T & { message?: string };
  } catch {
    return { message: `Server returned HTTP ${response.status} instead of JSON.` } as T & { message?: string };
  }
}

export function LoggerPage() {
  const previewRef = useRef<HTMLVideoElement>(null);
  const recordedVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fullTranscriptRef = useRef('');
  const interimTranscriptRef = useRef('');
  const isRecordingRef = useRef(false);
  const startedAtRef = useRef(0);
  const durationRef = useRef(0);
  const recordedAtRef = useRef('');
  const lastCheckpointLengthRef = useRef(0);
  const promptCountRef = useRef(0);
  const nextRequestAtRef = useRef(0);
  const rateLimitedRef = useRef(false);
  const recordingIdRef = useRef('');
  const timerRef = useRef<number | null>(null);
  const maxTimerRef = useRef<number | null>(null);
  const pauseTimerRef = useRef<number | null>(null);
  const checkpointIntervalRef = useRef<number | null>(null);
  const requestReflectionRef = useRef<(trigger: string) => void>(() => undefined);

  const [cameraState, setCameraState] = useState<'loading' | 'ready' | 'error' | 'unsupported'>('loading');
  const [isRecording, setIsRecording] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [playbackUrl, setPlaybackUrl] = useState('');
  const [status, setStatus] = useState('Requesting camera and microphone access…');
  const [timeLeft, setTimeLeft] = useState(formatTime(MAX_RECORDING_MS));
  const [reflection, setReflection] = useState<string | null>(null);
  const [revisit, setRevisit] = useState<RecordingResponse['revisit_suggestion']>();

  const clearRecordingTimers = useCallback(() => {
    [timerRef, maxTimerRef, pauseTimerRef, checkpointIntervalRef].forEach((timer) => {
      if (timer.current !== null) window.clearInterval(timer.current);
      timer.current = null;
    });
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setCameraState('unsupported');
      setStatus('Recording is not supported in this browser.');
      return;
    }
    if (streamRef.current) return;

    setCameraState('loading');
    setStatus('Requesting camera and microphone access…');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
      });
      streamRef.current = stream;
      if (previewRef.current) previewRef.current.srcObject = stream;
      setCameraState('ready');
      setStatus('Camera ready. Select Record when you are ready to speak.');
    } catch (error) {
      setCameraState('error');
      setStatus(`Could not start camera: ${error instanceof Error ? error.message : 'Unknown error'}. Select Retry camera after allowing access.`);
    }
  }, []);

  const startCooldown = useCallback((seconds: number) => {
    nextRequestAtRef.current = Date.now() + seconds * 1000;
  }, []);

  const requestReflection = useCallback(async (trigger: string) => {
    if (!isRecordingRef.current || promptCountRef.current >= 4 || rateLimitedRef.current) return;
    const remainingCooldown = nextRequestAtRef.current - Date.now();
    if (remainingCooldown > 0) {
      return;
    }

    const words = fullTranscriptRef.current.trim().split(/\s+/).filter(Boolean);
    const checkpointWords = words.slice(lastCheckpointLengthRef.current);
    if (checkpointWords.length < MIN_CHECKPOINT_WORDS) {
      return;
    }

    lastCheckpointLengthRef.current = words.length;
    const payload = { recording_id: recordingIdRef.current, trigger, checkpoint: checkpointWords.join(' ') };
    startCooldown(LIVE_COOLDOWN_SECONDS);

    try {
      const response = await fetch('/api/live-reflection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await readResponse<LiveResponse>(response);
      if (result.cooldown_seconds) startCooldown(result.cooldown_seconds);
      if (result.retry_after_seconds) startCooldown(result.retry_after_seconds);
      if (result.rate_limited) {
        rateLimitedRef.current = true;
      } else if (result.error) {
        setStatus(result.error);
      } else if (result.should_prompt && result.question) {
        promptCountRef.current += 1;
        setReflection(result.question);
      }
    } catch (error) {
      setStatus(error instanceof Error ? `Could not reach the reflection service: ${error.message}` : 'Could not reach the reflection service.');
    }
  }, [startCooldown]);

  requestReflectionRef.current = requestReflection;

  const stopRecording = useCallback(() => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    setIsRecording(false);
    if (pauseTimerRef.current !== null) window.clearTimeout(pauseTimerRef.current);
    if (checkpointIntervalRef.current !== null) window.clearInterval(checkpointIntervalRef.current);
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    if (maxTimerRef.current !== null) window.clearTimeout(maxTimerRef.current);

    try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
    recognitionRef.current = null;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    durationRef.current = Math.round((Date.now() - startedAtRef.current) / 1000);
    recordedAtRef.current = localTimestamp();
  }, []);

  const startSpeechRecognition = useCallback(() => {
    const Constructor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Constructor) {
      setStatus('Live browser transcription is unavailable; the recording will be transcribed after it ends.');
      return;
    }
    const recognition = new Constructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      if (pauseTimerRef.current !== null) window.clearTimeout(pauseTimerRef.current);
      interimTranscriptRef.current = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        if (event.results[index].isFinal) fullTranscriptRef.current += `${event.results[index][0].transcript} `;
        else interimTranscriptRef.current += event.results[index][0].transcript;
      }
      const transcript = `${fullTranscriptRef.current} ${interimTranscriptRef.current}`.trim();
      setStatus(transcript ? `Live transcript: “${transcript}”` : 'Listening…');
      pauseTimerRef.current = window.setTimeout(() => requestReflectionRef.current('3-second pause'), 3000);
    };
    recognition.onerror = (event) => {
      if (event.error !== 'no-speech') setStatus(`Live transcription error: ${event.error}`);
    };
    recognition.onend = () => {
      if (isRecordingRef.current) {
        try { recognition.start(); } catch { /* restart is already pending */ }
      }
    };
    recognitionRef.current = recognition;
    try { recognition.start(); } catch { /* browser may already be starting recognition */ }
  }, []);

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    isRecordingRef.current = true;
    setIsRecording(true);
    setIsComplete(false);
    setIsSaved(false);
    setReflection(null);
    setRevisit(undefined);
    fullTranscriptRef.current = '';
    interimTranscriptRef.current = '';
    chunksRef.current = [];
    lastCheckpointLengthRef.current = 0;
    promptCountRef.current = 0;
    rateLimitedRef.current = false;
    recordingIdRef.current = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const mimeTypes = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    const mimeType = mimeTypes.find((candidate) => MediaRecorder.isTypeSupported(candidate));
    const recorder = mimeType ? new MediaRecorder(streamRef.current, { mimeType }) : new MediaRecorder(streamRef.current);
    recorderRef.current = recorder;
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    });
    recorder.addEventListener('stop', () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
      blobRef.current = blob;
      objectUrlRef.current = URL.createObjectURL(blob);
      setPlaybackUrl(objectUrlRef.current);
      setIsComplete(true);
      setStatus(`Recording complete (${(blob.size / (1024 * 1024)).toFixed(1)} MB). Complete it to save.`);
    }, { once: true });
    recorder.start(500);
    startSpeechRecognition();

    startedAtRef.current = Date.now();
    setTimeLeft(formatTime(MAX_RECORDING_MS));
    timerRef.current = window.setInterval(() => setTimeLeft(formatTime(MAX_RECORDING_MS - (Date.now() - startedAtRef.current))), 250);
    maxTimerRef.current = window.setTimeout(stopRecording, MAX_RECORDING_MS);
    checkpointIntervalRef.current = window.setInterval(() => {
      requestReflectionRef.current('20-second interval');
    }, 20_000);
    setStatus('Recording video and listening to your voice. Select Stop recording when finished.');
  }, [startSpeechRecognition, stopRecording]);

  const resetForRetry = useCallback(() => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    blobRef.current = null;
    setPlaybackUrl('');
    setIsComplete(false);
    setIsSaved(false);
    setStatus('Camera ready. Select Record when you are ready to speak.');
  }, []);

  const uploadRecording = useCallback(async () => {
    if (!blobRef.current) return;
    setIsSaving(true);
    const transcript = `${fullTranscriptRef.current} ${interimTranscriptRef.current}`.replace(/\s+/g, ' ').trim();
    const formData = new FormData();
    formData.append('recording', blobRef.current, `entry_${Date.now()}.webm`);
    formData.append('duration_seconds', String(durationRef.current));
    formData.append('recorded_at_local', recordedAtRef.current || localTimestamp());
    formData.append('current_local_date', new Date().toLocaleDateString('en-CA'));
    formData.append('user_time_zone', Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Vancouver');
    if (transcript) formData.append('transcript', transcript);

    try {
      const response = await fetch('/api/recordings', { method: 'POST', body: formData });
      const result = await readResponse<RecordingResponse>(response);
      if (!response.ok) throw new Error(result.message || 'Failed to save the recording.');
      if (result.recording_url) setPlaybackUrl(result.recording_url);
      setRevisit(result.revisit_suggestion);
      setStatus(transcript ? `“${transcript}”` : (result.transcript || 'Recording saved.'));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save the recording.');
      setIsSaving(false);
      return;
    }
    setIsSaving(false);
    setIsSaved(true);
  }, []);

  const dismissRevisit = useCallback(async () => {
    if (!revisit?.cue_id) return;
    try {
      await fetch(`/api/revisit-cues/${encodeURIComponent(revisit.cue_id)}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    } finally {
      setRevisit(undefined);
    }
  }, [revisit]);

  useEffect(() => {
    void startCamera();
    return () => {
      clearRecordingTimers();
      try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, [clearRecordingTimers, startCamera]);

  const recordLabel = cameraState === 'error' ? 'Retry camera' : isRecording ? 'Stop recording' : 'Record';
  const canRecord = cameraState === 'ready' || cameraState === 'error';

  return (
    <main className="min-h-screen bg-[#f9f6f1] px-5 pb-24 pt-7 text-[#473c21] sm:px-10 sm:pt-10">
      <div className="mx-auto max-w-4xl">
        <header className="flex items-center justify-between border-b border-[#ddd5c3] pb-6">
          <a className="font-serif text-xl italic tracking-wide" href="/">Week by week</a>
          <a className="text-sm text-[#887445] underline underline-offset-4 hover:text-[#473c21]" href="/my-videos">My videos</a>
        </header>

        <section className="mt-10 border-2 border-[#473c21] bg-[#f9f6f1] p-5 shadow-[7px_7px_0_#b39e6c] sm:p-8" aria-labelledby="recorder-title">
          <p className="text-xs font-medium uppercase tracking-[0.17em] text-[#887445]">Voice journal</p>
          <h1 className="mt-3 font-serif text-4xl sm:text-5xl" id="recorder-title">Recording studio</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#887445]">Your camera preview starts automatically. Record a moment you want to remember.</p>

          <div className="relative mt-7 aspect-video overflow-hidden border-2 border-[#473c21] bg-stone-900">
            <video className={`h-full w-full object-cover ${isComplete ? 'hidden' : ''}`} autoPlay muted playsInline ref={previewRef} />
            {isComplete && <video className="h-full w-full bg-stone-900 object-contain" controls playsInline ref={recordedVideoRef} src={playbackUrl || undefined} />}
            {cameraState === 'loading' && !isComplete && <div className="absolute inset-0 grid place-items-center text-sm text-stone-300">Starting camera…</div>}
            {cameraState === 'error' && !isComplete && <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-stone-300">Camera preview is unavailable.</div>}
            {reflection && (
              <aside className="absolute bottom-4 right-4 max-w-[min(20rem,calc(100%-2rem))] border-2 border-[#473c21] bg-[#f9f6f1] p-4 text-[#473c21] shadow-[4px_4px_0_#b39e6c]" aria-live="polite">
                <p className="text-[0.65rem] font-medium uppercase tracking-[0.15em] text-[#887445]">A thought to explore</p>
                <p className="mt-2 font-serif text-base leading-5 italic">{reflection}</p>
                <button className="mt-3 text-xs text-[#887445] underline underline-offset-4 hover:text-[#473c21]" onClick={() => setReflection(null)} type="button">Keep talking</button>
              </aside>
            )}
          </div>

          <p className="mt-4 min-h-6 text-sm leading-6 text-[#887445]" role="status">{status}</p>

          {revisit?.suggestion && (
            <aside className="mt-5 border-2 border-[#998350] bg-[#eeebe4] p-4" aria-live="polite">
              <p className="text-xs font-medium uppercase tracking-[0.15em] text-[#887445]">From an earlier chapter</p>
              <p className="mt-2 text-sm leading-6">{revisit.suggestion}</p>
              {revisit.source_created_at && <p className="mt-2 text-xs text-[#887445]">Original entry: {new Date(revisit.source_created_at).toLocaleDateString()}</p>}
              {revisit.source_summary && <p className="mt-1 text-xs text-[#887445]">{revisit.source_summary}</p>}
              <button className="mt-3 text-sm text-[#887445] underline underline-offset-4" onClick={() => void dismissRevisit()} type="button">Not now</button>
            </aside>
          )}

          {!isComplete ? (
            <div className="mt-6 flex items-center justify-center gap-4">
              <button
                aria-label={recordLabel}
                className={`grid h-16 w-16 place-items-center rounded-full border-2 border-[#473c21] text-[#f9f6f1] shadow-[3px_3px_0_#b39e6c] transition-colors hover:bg-[#887445] disabled:cursor-not-allowed disabled:opacity-50 ${isRecording ? 'bg-red-700' : 'bg-[#473c21]'}`}
                disabled={!canRecord}
                onClick={() => { if (!streamRef.current) void startCamera(); else if (isRecordingRef.current) stopRecording(); else startRecording(); }}
                type="button"
              >
                <span aria-hidden="true" className={isRecording ? 'h-4 w-4 bg-[#f9f6f1]' : 'h-5 w-5 rounded-full bg-red-500 ring-2 ring-[#f9f6f1]'} />
              </button>
              <div className="min-w-20 text-left">
                <p className="text-[0.65rem] font-medium uppercase tracking-[0.13em] text-[#887445]">{isRecording ? 'Time left' : 'Ready'}</p>
                <time className="font-mono text-lg font-semibold" dateTime={`PT${Math.ceil(MAX_RECORDING_MS / 1000)}S`}>{timeLeft}</time>
              </div>
            </div>
          ) : (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button className="min-h-12 border-2 border-[#998350] px-6 py-3 text-sm font-medium hover:bg-[#eeebe4]" disabled={isSaving} onClick={resetForRetry} type="button">Retry</button>
              <button className="min-h-12 border-2 border-[#473c21] bg-[#473c21] px-6 py-3 text-sm font-medium text-[#f9f6f1] shadow-[3px_3px_0_#b39e6c] hover:bg-[#887445] disabled:cursor-not-allowed disabled:opacity-50" disabled={isSaving || isSaved} onClick={() => void uploadRecording()} type="button">{isSaving ? 'Saving…' : isSaved ? 'Saved' : 'Complete'}</button>
              <time className="font-mono text-lg font-semibold" dateTime={`PT${Math.ceil(MAX_RECORDING_MS / 1000)}S`}>{timeLeft}</time>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
