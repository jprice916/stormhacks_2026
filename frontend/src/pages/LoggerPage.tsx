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
  const cooldownIntervalRef = useRef<number | null>(null);
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
  const [debugQuestion, setDebugQuestion] = useState('Waiting for a prompt.');
  const [debugGemini, setDebugGemini] = useState('Waiting to send a checkpoint.');
  const [debugRequest, setDebugRequest] = useState('Waiting for a pause with enough finalized speech.');
  const [debugResponse, setDebugResponse] = useState('No response yet.');
  const [reflectionCheck, setReflectionCheck] = useState('Starts when recording begins.');
  const [cooldown, setCooldown] = useState('Ready when you pause after 10 finalized words.');

  const clearRecordingTimers = useCallback(() => {
    [timerRef, maxTimerRef, pauseTimerRef, checkpointIntervalRef, cooldownIntervalRef].forEach((timer) => {
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
    if (cooldownIntervalRef.current !== null) window.clearInterval(cooldownIntervalRef.current);
    const update = () => {
      const remaining = Math.max(0, Math.ceil((nextRequestAtRef.current - Date.now()) / 1000));
      setCooldown(remaining > 0 ? `Cooldown: ${remaining}s before the next reflection request.` : 'Ready for the next 3-second pause.');
      if (remaining === 0 && cooldownIntervalRef.current !== null) {
        window.clearInterval(cooldownIntervalRef.current);
        cooldownIntervalRef.current = null;
      }
    };
    update();
    cooldownIntervalRef.current = window.setInterval(update, 250);
  }, []);

  const requestReflection = useCallback(async (trigger: string) => {
    if (!isRecordingRef.current || promptCountRef.current >= 4 || rateLimitedRef.current) return;
    const remainingCooldown = nextRequestAtRef.current - Date.now();
    if (remainingCooldown > 0) {
      setDebugGemini('Check skipped: waiting for the API cooldown.');
      return;
    }

    const words = fullTranscriptRef.current.trim().split(/\s+/).filter(Boolean);
    const checkpointWords = words.slice(lastCheckpointLengthRef.current);
    if (checkpointWords.length < MIN_CHECKPOINT_WORDS) {
      setDebugGemini(`Check skipped: ${checkpointWords.length}/10 new finalized words since the last request.`);
      return;
    }

    lastCheckpointLengthRef.current = words.length;
    const payload = { recording_id: recordingIdRef.current, trigger, checkpoint: checkpointWords.join(' ') };
    setDebugRequest(JSON.stringify(payload, null, 2));
    setDebugGemini('Sending checkpoint to Gemini.');
    startCooldown(LIVE_COOLDOWN_SECONDS);

    try {
      const response = await fetch('/api/live-reflection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await readResponse<LiveResponse>(response);
      setDebugResponse(JSON.stringify({ status: response.status, body: result }, null, 2));
      if (result.cooldown_seconds) startCooldown(result.cooldown_seconds);
      if (result.retry_after_seconds) startCooldown(result.retry_after_seconds);
      if (result.rate_limited) {
        rateLimitedRef.current = true;
        setDebugGemini('Gemini rate limit hit: live requests are paused for this recording.');
      } else if (result.error) {
        setDebugGemini(result.details ? `Gemini error: ${result.details}` : 'Gemini returned an error.');
        setDebugQuestion(result.error);
      } else if (result.should_prompt && result.question) {
        promptCountRef.current += 1;
        setReflection(result.question);
        setDebugQuestion(result.question);
        setDebugGemini('Gemini returned a reflection question.');
      } else {
        setDebugQuestion('No question returned for this checkpoint.');
        setDebugGemini('Gemini evaluated this checkpoint and chose not to prompt.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setDebugResponse(JSON.stringify({ error: message }, null, 2));
      setDebugGemini('Could not reach the Flask server.');
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
      setDebugQuestion('Live browser transcription is unavailable; the recording will be transcribed after it ends.');
      setDebugRequest('This browser does not provide the Web Speech API.');
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
      const finalizedWords = fullTranscriptRef.current.trim().split(/\s+/).filter(Boolean).length;
      setStatus(transcript ? `Live transcript: “${transcript}”` : 'Listening…');
      setDebugRequest(JSON.stringify({
        state: finalizedWords >= MIN_CHECKPOINT_WORDS ? 'Waiting for a 3-second pause' : 'Listening for more finalized speech',
        finalized_words: finalizedWords,
        interim_words: interimTranscriptRef.current.trim().split(/\s+/).filter(Boolean).length,
        words_needed_for_first_check: Math.max(0, MIN_CHECKPOINT_WORDS - finalizedWords),
        live_transcript: transcript,
      }, null, 2));
      if (finalizedWords < MIN_CHECKPOINT_WORDS) setDebugQuestion(`Listening: ${finalizedWords}/10 finalized words before the first reflection check.`);
      setReflectionCheck('Pause check in 3s.');
      pauseTimerRef.current = window.setTimeout(() => requestReflectionRef.current('3-second pause'), 3000);
    };
    recognition.onerror = (event) => {
      if (event.error !== 'no-speech') setDebugGemini(`Speech recognition error: ${event.error}`);
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
    setDebugQuestion('Waiting for a prompt.');
    setDebugGemini('Waiting to send a checkpoint.');
    setDebugRequest('Waiting for a pause with enough finalized speech.');
    setDebugResponse('No response yet.');
    setCooldown('Ready when you pause after 10 finalized words. Requests are spaced 15 seconds apart.');

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
    setReflectionCheck('Automatic check in 20s.');
    timerRef.current = window.setInterval(() => setTimeLeft(formatTime(MAX_RECORDING_MS - (Date.now() - startedAtRef.current))), 250);
    maxTimerRef.current = window.setTimeout(stopRecording, MAX_RECORDING_MS);
    checkpointIntervalRef.current = window.setInterval(() => {
      setReflectionCheck('Automatic check now.');
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
          </div>

          <p className="mt-4 min-h-6 text-sm leading-6 text-[#887445]" role="status">{status}</p>

          {reflection && (
            <aside className="mt-5 border-2 border-[#bca880] bg-[#eeebe4] p-4" aria-live="polite">
              <p className="text-xs font-medium uppercase tracking-[0.15em] text-[#887445]">Thought to explore</p>
              <p className="mt-2 font-serif text-lg italic">{reflection}</p>
              <button className="mt-3 text-sm text-[#887445] underline underline-offset-4" onClick={() => setReflection(null)} type="button">Keep talking</button>
            </aside>
          )}

          {revisit?.suggestion && (
            <aside className="mt-5 border-2 border-[#998350] bg-[#eeebe4] p-4" aria-live="polite">
              <p className="text-xs font-medium uppercase tracking-[0.15em] text-[#887445]">From an earlier chapter</p>
              <p className="mt-2 text-sm leading-6">{revisit.suggestion}</p>
              {revisit.source_created_at && <p className="mt-2 text-xs text-[#887445]">Original entry: {new Date(revisit.source_created_at).toLocaleDateString()}</p>}
              {revisit.source_summary && <p className="mt-1 text-xs text-[#887445]">{revisit.source_summary}</p>}
              <button className="mt-3 text-sm text-[#887445] underline underline-offset-4" onClick={() => void dismissRevisit()} type="button">Not now</button>
            </aside>
          )}

          <section className="mt-6 border border-[#bca880] bg-[#eeebe4] p-4 text-sm" aria-labelledby="live-debug-title">
            <h2 className="font-serif text-lg" id="live-debug-title">Live reflection debug</h2>
            <p className="mt-3"><strong>Question:</strong> {debugQuestion}</p>
            <p className="mt-2"><strong>Gemini status:</strong> {debugGemini}</p>
            <p className="mt-2"><strong>Next reflection check:</strong> {reflectionCheck}</p>
            <p className="mt-2"><strong>API cooldown:</strong> {cooldown}</p>
            <p className="mt-4 font-medium">Outgoing checkpoint</p>
            <pre className="mt-2 max-h-44 overflow-auto bg-[#473c21] p-3 text-xs leading-5 text-[#f9f6f1] whitespace-pre-wrap">{debugRequest}</pre>
            <p className="mt-4 font-medium">Incoming response</p>
            <pre className="mt-2 max-h-44 overflow-auto bg-[#473c21] p-3 text-xs leading-5 text-[#f9f6f1] whitespace-pre-wrap">{debugResponse}</pre>
          </section>

          {!isComplete ? (
            <button
              className="mt-6 min-h-12 border-2 border-[#473c21] bg-[#473c21] px-6 py-3 text-sm font-medium text-[#f9f6f1] shadow-[3px_3px_0_#b39e6c] transition-colors hover:bg-[#887445] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canRecord}
              onClick={() => { if (!streamRef.current) void startCamera(); else if (isRecordingRef.current) stopRecording(); else startRecording(); }}
              type="button"
            >
              {recordLabel}
            </button>
          ) : (
            <div className="mt-6 flex flex-wrap gap-3">
              <button className="min-h-12 border-2 border-[#998350] px-6 py-3 text-sm font-medium hover:bg-[#eeebe4]" disabled={isSaving} onClick={resetForRetry} type="button">Retry</button>
              <button className="min-h-12 border-2 border-[#473c21] bg-[#473c21] px-6 py-3 text-sm font-medium text-[#f9f6f1] shadow-[3px_3px_0_#b39e6c] hover:bg-[#887445] disabled:cursor-not-allowed disabled:opacity-50" disabled={isSaving || isSaved} onClick={() => void uploadRecording()} type="button">{isSaving ? 'Saving…' : isSaved ? 'Saved' : 'Complete'}</button>
            </div>
          )}
        </section>
      </div>

      <footer className="fixed inset-x-0 bottom-0 flex min-h-16 items-center justify-center gap-3 border-t-2 border-[#473c21] bg-[#f9f6f1]/95 px-5 text-sm backdrop-blur">
        <span className={`h-2.5 w-2.5 rounded-full ${isRecording ? 'bg-red-600 ring-4 ring-red-200' : 'bg-[#bca880]'}`} />
        <span>{isRecording ? 'Time left' : isComplete ? 'Recording complete' : 'Ready to record'}</span>
        <time className="font-mono font-semibold" dateTime={`PT${Math.ceil(MAX_RECORDING_MS / 1000)}S`}>{timeLeft}</time>
      </footer>
    </main>
  );
}
