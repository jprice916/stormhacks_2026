import { useCallback, useEffect, useRef, useState } from 'react';
import { frontendPaths } from '../lib/paths';

const MAX_RECORDING_MS = 5 * 60 * 1000;
const LIVE_COOLDOWN_SECONDS = 15;
const REFLECTION_DISPLAY_MS = 10_000;

type LiveResponse = {
  should_prompt?: boolean;
  question?: string | null;
  topic?: string | null;
  question_type?: 'baseline' | 'reflection' | null;
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
  analysis_status?: 'queued' | 'skipped';
  analysis_error?: string;
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

function formatDuration(milliseconds: number) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
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
  const isPausedRef = useRef(false);
  const activeSegmentStartedAtRef = useRef(0);
  const elapsedMsRef = useRef(0);
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
  const countdownIntervalRef = useRef<number | null>(null);
  const checkpointIntervalRef = useRef<number | null>(null);
  const reflectionTimerRef = useRef<number | null>(null);
  const aiAudioRef = useRef<HTMLAudioElement | null>(null);
  const requestReflectionRef = useRef<(trigger: string) => void>(() => undefined);

  const [cameraState, setCameraState] = useState<'loading' | 'ready' | 'error' | 'unsupported'>('loading');
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [playbackUrl, setPlaybackUrl] = useState('');
  const [journalMode, setJournalMode] = useState<'voice' | 'text'>('voice');
  const [textJournal, setTextJournal] = useState('');
  const [isTextSaving, setIsTextSaving] = useState(false);
  const [status, setStatus] = useState('Requesting camera and microphone access…');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [silenceCountdown, setSilenceCountdown] = useState<number | null>(null);
  const [reflection, setReflection] = useState<string | null>(null);
  const [reflectionProgress, setReflectionProgress] = useState(0);
  const [revisit, setRevisit] = useState<RecordingResponse['revisit_suggestion']>();
  const [analysisPreview, setAnalysisPreview] = useState<Record<string, unknown> | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const clearSilenceTimer = useCallback(() => {
    if (pauseTimerRef.current !== null) {
      window.clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
    if (countdownIntervalRef.current !== null) {
      window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setSilenceCountdown(null);
  }, []);

  const clearRecordingTimers = useCallback(() => {
    clearSilenceTimer();
    [timerRef, maxTimerRef, checkpointIntervalRef].forEach((timer) => {
      if (timer.current !== null) window.clearInterval(timer.current);
      timer.current = null;
    });
  }, [clearSilenceTimer]);

  const updateElapsedTime = useCallback(() => {
    const elapsed = elapsedMsRef.current + (isPausedRef.current ? 0 : Date.now() - activeSegmentStartedAtRef.current);
    setElapsedMs(Math.min(elapsed, MAX_RECORDING_MS));
  }, []);

  const dismissReflection = useCallback(() => {
    if (reflectionTimerRef.current !== null) {
      window.clearInterval(reflectionTimerRef.current);
      reflectionTimerRef.current = null;
    }
    if (aiAudioRef.current) {
      aiAudioRef.current.pause();
      aiAudioRef.current = null;
    }
    setReflection(null);
    setReflectionProgress(0);
  }, []);

  const playPromptAudio = useCallback((text: string) => {
    fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (blob && isRecordingRef.current) {
          if (aiAudioRef.current) aiAudioRef.current.pause();
          const audioUrl = URL.createObjectURL(blob);
          const audio = new Audio(audioUrl);
          aiAudioRef.current = audio;
          audio.play().catch(() => {
            // Audio autoplay policy fallback
          });
        }
      })
      .catch((error) => console.error('TTS prompt audio failed:', error));
  }, []);

  const showReflection = useCallback((question: string) => {
    if (reflectionTimerRef.current !== null) window.clearInterval(reflectionTimerRef.current);
    const expiresAt = Date.now() + REFLECTION_DISPLAY_MS;
    const updateProgress = () => {
      const progress = Math.max(0, (expiresAt - Date.now()) / REFLECTION_DISPLAY_MS);
      setReflectionProgress(progress);
      if (progress === 0) {
        if (reflectionTimerRef.current !== null) window.clearInterval(reflectionTimerRef.current);
        reflectionTimerRef.current = null;
        setReflection(null);
      }
    };
    setReflection(question);
    updateProgress();
    reflectionTimerRef.current = window.setInterval(updateProgress, 100);
    playPromptAudio(question);
  }, [playPromptAudio]);

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
    if (!isRecordingRef.current || isPausedRef.current || promptCountRef.current >= 4 || rateLimitedRef.current) return;
    const remainingCooldown = nextRequestAtRef.current - Date.now();
    if (remainingCooldown > 0) return;

    const words = fullTranscriptRef.current.trim().split(/\s+/).filter(Boolean);
    const totalWords = words.length;
    const newWords = totalWords - lastCheckpointLengthRef.current;

    // Require at least some speech and new input since the last prompt
    if (totalWords < 8 || newWords < 2) return;

    lastCheckpointLengthRef.current = totalWords;
    // Provide recent context (up to 30 words) so backend receives >= 10 words
    const recentWords = words.slice(Math.max(0, totalWords - 30));
    const payload = {
      recording_id: recordingIdRef.current,
      trigger,
      checkpoint: recentWords.join(' '),
    };

    startCooldown(LIVE_COOLDOWN_SECONDS);

    try {
      const response = await fetch('/api/live-reflection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await readResponse<LiveResponse>(response);
      if (!response.ok) {
        setStatus(result.message || `Reflection service returned HTTP ${response.status}.`);
        return;
      }
      if (result.cooldown_seconds) startCooldown(result.cooldown_seconds);
      if (result.retry_after_seconds) startCooldown(result.retry_after_seconds);
      if (result.rate_limited) {
        rateLimitedRef.current = true;
      } else if (result.error) {
        setStatus(result.error);
      } else if (result.should_prompt && result.question) {
        promptCountRef.current += 1;
        showReflection(result.question);
      }
    } catch (error) {
      const message = error instanceof Error ? `Could not reach the reflection service: ${error.message}` : 'Could not reach the reflection service.';
      setStatus(message);
    }
  }, [showReflection, startCooldown]);

  requestReflectionRef.current = requestReflection;

  const stopRecording = useCallback(() => {
    if (!isRecordingRef.current) return;
    if (!isPausedRef.current) elapsedMsRef.current += Date.now() - activeSegmentStartedAtRef.current;
    isRecordingRef.current = false;
    isPausedRef.current = false;
    setIsRecording(false);
    setIsPaused(false);
    setElapsedMs(Math.min(elapsedMsRef.current, MAX_RECORDING_MS));
    clearRecordingTimers();

    if (aiAudioRef.current) {
      aiAudioRef.current.pause();
      aiAudioRef.current = null;
    }

    try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
    recognitionRef.current = null;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    durationRef.current = Math.round(elapsedMsRef.current / 1000);
    recordedAtRef.current = localTimestamp();
  }, [clearRecordingTimers]);

  const startSpeechRecognition = useCallback(() => {
    const Constructor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Constructor) {
      setStatus('Live browser transcription is unavailable, so this recording cannot receive a final analysis.');
      return;
    }
    const recognition = new Constructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      clearSilenceTimer();
      interimTranscriptRef.current = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        if (event.results[index].isFinal) fullTranscriptRef.current += `${event.results[index][0].transcript} `;
        else interimTranscriptRef.current += event.results[index][0].transcript;
      }
      const transcript = `${fullTranscriptRef.current} ${interimTranscriptRef.current}`.trim();
      setStatus(transcript ? `Live transcript: “${transcript}”` : 'Listening…');

      // 3-second silence counter before taking the checkpoint
      let secondsRemaining = 3;
      setSilenceCountdown(3);

      countdownIntervalRef.current = window.setInterval(() => {
        secondsRemaining -= 1;
        if (secondsRemaining > 0) {
          setSilenceCountdown(secondsRemaining);
        } else {
          if (countdownIntervalRef.current !== null) {
            window.clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          setSilenceCountdown(null);
        }
      }, 1000);

      pauseTimerRef.current = window.setTimeout(() => {
        if (countdownIntervalRef.current !== null) {
          window.clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        setSilenceCountdown(null);
        requestReflectionRef.current('3-second pause');
      }, 3000);
    };
    recognition.onerror = (event) => {
      if (event.error !== 'no-speech') setStatus(`Live transcription error: ${event.error}`);
    };
    recognition.onend = () => {
      if (isRecordingRef.current && !isPausedRef.current) {
        try { recognition.start(); } catch { /* restart is pending */ }
      }
    };
    recognitionRef.current = recognition;
    try { recognition.start(); } catch { /* start pending */ }
  }, [clearSilenceTimer]);

  const pauseOrResumeRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!isRecordingRef.current || !recorder) return;

    if (!isPausedRef.current) {
      elapsedMsRef.current += Date.now() - activeSegmentStartedAtRef.current;
      isPausedRef.current = true;
      setIsPaused(true);
      setElapsedMs(elapsedMsRef.current);
      clearSilenceTimer();
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      if (maxTimerRef.current !== null) window.clearTimeout(maxTimerRef.current);
      if (checkpointIntervalRef.current !== null) window.clearInterval(checkpointIntervalRef.current);
      try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
      recognitionRef.current = null;
      if (recorder.state === 'recording') recorder.pause();
      if (aiAudioRef.current) aiAudioRef.current.pause();
      setStatus('Recording paused. Select Resume when you are ready.');
      return;
    }

    isPausedRef.current = false;
    setIsPaused(false);
    activeSegmentStartedAtRef.current = Date.now();
    if (recorder.state === 'paused') recorder.resume();
    startSpeechRecognition();
    timerRef.current = window.setInterval(updateElapsedTime, 250);
    maxTimerRef.current = window.setTimeout(stopRecording, Math.max(0, MAX_RECORDING_MS - elapsedMsRef.current));
    checkpointIntervalRef.current = window.setInterval(() => requestReflectionRef.current('20-second interval'), 20_000);
    setStatus('Recording video and listening to your voice. Select Stop recording when finished.');
  }, [clearSilenceTimer, startSpeechRecognition, stopRecording, updateElapsedTime]);

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    isRecordingRef.current = true;
    isPausedRef.current = false;
    setIsRecording(true);
    setIsPaused(false);
    setIsComplete(false);
    setIsSaved(false);
    setAnalysisPreview(null);
    clearSilenceTimer();
    dismissReflection();
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

    elapsedMsRef.current = 0;
    activeSegmentStartedAtRef.current = Date.now();
    setElapsedMs(0);
    timerRef.current = window.setInterval(updateElapsedTime, 250);
    maxTimerRef.current = window.setTimeout(stopRecording, MAX_RECORDING_MS);
    checkpointIntervalRef.current = window.setInterval(() => {
      requestReflectionRef.current('20-second interval');
    }, 20_000);
    setStatus('Recording video and listening to your voice. Select Stop recording when finished.');
  }, [clearSilenceTimer, dismissReflection, startSpeechRecognition, stopRecording, updateElapsedTime]);

  const resetForRetry = useCallback(() => {
    dismissReflection();
    clearSilenceTimer();
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    blobRef.current = null;
    setPlaybackUrl('');
    setIsComplete(false);
    setIsSaved(false);
    setAnalysisPreview(null);
    setStatus('Camera ready. Select Record when you are ready to speak.');
  }, [clearSilenceTimer, dismissReflection]);

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
    if (analysisPreview) formData.append('analysis_preview', JSON.stringify(analysisPreview));

    try {
      const response = await fetch('/api/recordings', { method: 'POST', body: formData });
      const result = await readResponse<RecordingResponse>(response);
      if (!response.ok) throw new Error(result.message || 'Failed to save the recording.');
      if (result.recording_url) setPlaybackUrl(result.recording_url);
      setRevisit(result.revisit_suggestion);
      setStatus(
        result.analysis_status === 'queued'
          ? 'Video saved. Final analysis is processing automatically.'
          : result.analysis_error
            ? `Video saved. Final analysis was skipped: ${result.analysis_error}`
            : result.analysis
              ? 'Video and final analysis saved.'
              : (transcript ? `“${transcript}”` : (result.transcript || 'Recording saved.')),
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save the recording.');
      setIsSaving(false);
      return;
    }
    setIsSaving(false);
    setIsSaved(true);
  }, [analysisPreview]);

  const generateFinalAnalysis = useCallback(async () => {
    const transcript = `${fullTranscriptRef.current} ${interimTranscriptRef.current}`.replace(/\s+/g, ' ').trim();
    if (!transcript) {
      setStatus('Speak during the recording so there is a transcript to analyze.');
      return;
    }
    setIsAnalyzing(true);
    setStatus('Generating final analysis preview…');
    try {
      const response = await fetch('/api/recordings/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          current_local_date: new Date().toLocaleDateString('en-CA'),
          user_time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Vancouver',
        }),
      });
      const result = await readResponse<RecordingResponse>(response);
      if (!response.ok || !result.analysis) throw new Error(result.message || 'Could not generate final analysis.');
      setAnalysisPreview(result.analysis);
      setStatus('Final analysis is ready. Complete & save when you want to upload this recording.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not generate final analysis.');
    } finally {
      setIsAnalyzing(false);
    }
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

  const saveTextJournal = useCallback(async () => {
    const transcript = textJournal.trim();
    if (!transcript) {
      setStatus('Write a journal entry before saving.');
      return;
    }
    setIsTextSaving(true);
    const formData = new FormData();
    formData.append('transcript', transcript);
    formData.append('current_local_date', new Date().toLocaleDateString('en-CA'));
    formData.append('recorded_at_local', localTimestamp());
    formData.append('user_time_zone', Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Vancouver');
    try {
      const response = await fetch('/api/process-log', { method: 'POST', body: formData });
      const result = await readResponse<RecordingResponse>(response);
      if (!response.ok) throw new Error(result.message || 'Could not save the journal entry.');
      setStatus('Text journal saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save the journal entry.');
    } finally {
      setIsTextSaving(false);
    }
  }, [textJournal]);

  useEffect(() => {
    void startCamera();
    return () => {
      clearRecordingTimers();
      if (reflectionTimerRef.current !== null) window.clearInterval(reflectionTimerRef.current);
      if (aiAudioRef.current) aiAudioRef.current.pause();
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
          <a className="font-serif text-xl italic tracking-wide" href={frontendPaths.home}>Week by week</a>
          <a className="text-sm text-[#887445] underline underline-offset-4 hover:text-[#473c21]" href={frontendPaths.myVideos}>My videos</a>
        </header>

        <section className="relative mt-10 border-2 border-[#473c21] bg-[#f9f6f1] p-5 shadow-[7px_7px_0_#b39e6c] sm:p-8" aria-labelledby="recorder-title">
          <p className="text-xs font-medium uppercase tracking-[0.17em] text-[#887445]">Voice journal</p>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#887445]">Your camera preview starts automatically. Record a moment you want to remember.</p>

          {journalMode === 'voice' ? (
            <div className="relative mt-7 aspect-video overflow-hidden border-2 border-[#473c21] bg-stone-900">
              <video className={`h-full w-full object-cover ${isComplete ? 'hidden' : ''}`} autoPlay muted playsInline ref={previewRef} />
              {isComplete && <video className="h-full w-full bg-stone-900 object-contain" controls playsInline ref={recordedVideoRef} src={playbackUrl || undefined} />}
              {cameraState === 'loading' && !isComplete && <div className="absolute inset-0 grid place-items-center text-sm text-stone-300">Starting camera…</div>}
              {cameraState === 'error' && !isComplete && <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-stone-300">Camera preview is unavailable.</div>}

              {/* 3-second STT pause countdown badge */}
              {isRecording && !isPaused && silenceCountdown !== null && (
                <div className="absolute right-4 top-4 z-20 flex items-center gap-2 rounded-full border-2 border-[#473c21] bg-[#f9f6f1]/95 px-3.5 py-1.5 text-xs font-semibold text-[#473c21] shadow-[3px_3px_0_#b39e6c] backdrop-blur-sm animate-pulse">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
                  </span>
                  <span>AI listening in <strong className="font-mono text-sm">{silenceCountdown}s</strong></span>
                </div>
              )}

              {/* Active AI Reflection card */}
              {reflection && (
                <aside
                  className="absolute bottom-11 right-4 z-10 max-w-[min(22rem,calc(100%-2rem))] cursor-pointer border-2 border-[#473c21] bg-[#f9f6f1] p-4 text-[#473c21] shadow-[4px_4px_0_#b39e6c]"
                  aria-live="polite"
                  onClick={dismissReflection}
                  role="button"
                  tabIndex={0}
                >
                  <div className="flex items-center justify-between gap-5">
                    <span className="flex items-center gap-1.5 text-[0.65rem] font-medium uppercase tracking-[0.15em] text-[#887445]">
                      <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
                      AI Thought
                    </span>
                    <span
                      aria-label="Question disappears in about ten seconds"
                      className="h-5 w-5 shrink-0 rounded-full"
                      style={{ background: `conic-gradient(#887445 ${reflectionProgress * 360}deg, #ddd5c3 0deg)` }}
                    />
                  </div>
                  <p className="mt-2 font-serif text-base italic leading-5">“{reflection}”</p>
                  <p className="mt-2 text-[0.65rem] text-[#887445]">Tap to dismiss</p>
                </aside>
              )}
            </div>
          ) : (
            <div className="mt-7 aspect-video border-2 border-[#473c21] bg-white">
              <textarea
                aria-label="Text journal entry"
                className="h-full w-full resize-none bg-transparent p-5 text-base leading-7 text-[#473c21] outline-none placeholder:text-[#bca880] sm:p-7"
                onChange={(event) => setTextJournal(event.target.value)}
                placeholder="Write what is on your mind…"
                value={textJournal}
              />
            </div>
          )}

          <p className="mt-4 h-6 overflow-hidden text-ellipsis whitespace-nowrap text-sm leading-6 text-[#887445]" role="status">
            {journalMode === 'voice' ? (
              silenceCountdown !== null ? (
                <span className="font-medium text-[#473c21]">
                  Pause detected ({silenceCountdown}s) · {status}
                </span>
              ) : status
            ) : ''}
          </p>

          {revisit?.suggestion && (
            <aside className="mt-5 border-2 border-[#998350] bg-[#eeebe4] p-4" aria-live="polite">
              <p className="text-xs font-medium uppercase tracking-[0.15em] text-[#887445]">From an earlier chapter</p>
              <p className="mt-2 text-sm leading-6">{revisit.suggestion}</p>
              {revisit.source_created_at && <p className="mt-2 text-xs text-[#887445]">Original entry: {new Date(revisit.source_created_at).toLocaleDateString()}</p>}
              {revisit.source_summary && <p className="mt-1 text-xs text-[#887445]">{revisit.source_summary}</p>}
              <button className="mt-3 text-sm text-[#887445] underline underline-offset-4" onClick={() => void dismissRevisit()} type="button">Not now</button>
            </aside>
          )}

          {journalMode === 'text' ? (
            <div className="mt-6 flex h-16 items-center justify-center">
              <button className="min-h-12 border-2 border-[#473c21] bg-[#473c21] px-6 py-3 text-sm font-medium text-[#f9f6f1] shadow-[3px_3px_0_#b39e6c] hover:bg-[#887445] disabled:cursor-not-allowed disabled:opacity-50" disabled={isTextSaving} onClick={() => void saveTextJournal()} type="button">{isTextSaving ? 'Saving…' : 'Save journal'}</button>
            </div>
          ) : !isComplete ? (
            <div className="relative mt-6 flex h-16 items-center justify-center">
              {isRecording ? (
                <button
                  aria-label={isPaused ? 'Resume recording' : 'Pause recording'}
                  className="absolute right-[calc(50%+3.5rem)] grid h-12 w-12 place-items-center rounded-full border-2 border-[#998350] bg-[#eeebe4] text-[#473c21] transition-colors hover:bg-[#ddd5c3]"
                  onClick={pauseOrResumeRecording}
                  type="button"
                >
                  <span aria-hidden="true" className={isPaused ? 'ml-0.5 h-0 w-0 border-y-[7px] border-l-[11px] border-y-transparent border-l-current' : 'flex gap-1'}>
                    {!isPaused && <><span className="h-4 w-1.5 bg-current" /><span className="h-4 w-1.5 bg-current" /></>}
                  </span>
                </button>
              ) : null}
              <button
                aria-label={isRecording ? 'Stop recording' : recordLabel}
                className={`grid h-16 w-16 place-items-center rounded-full border-2 border-[#473c21] text-[#f9f6f1] shadow-[3px_3px_0_#b39e6c] transition-colors hover:bg-[#887445] disabled:cursor-not-allowed disabled:opacity-50 ${isRecording ? 'bg-red-700' : 'bg-[#473c21]'}`}
                disabled={!canRecord}
                onClick={() => { if (!streamRef.current) void startCamera(); else if (isRecordingRef.current) stopRecording(); else startRecording(); }}
                type="button"
              >
                <span aria-hidden="true" className={isRecording ? 'h-4 w-4 bg-[#f9f6f1]' : 'h-5 w-5 rounded-full bg-red-500 ring-2 ring-[#f9f6f1]'} />
              </button>
              <div className="absolute left-[calc(50%+3.5rem)] min-w-28 text-left">
                <p className="text-[0.65rem] font-medium uppercase tracking-[0.13em] text-[#887445]">{isPaused ? 'Paused' : isRecording ? 'Recording' : 'Maximum length'}</p>
                <time className="font-mono text-lg font-semibold" dateTime={`PT${Math.ceil(MAX_RECORDING_MS / 1000)}S`}>{formatDuration(elapsedMs)} / {formatDuration(MAX_RECORDING_MS)}</time>
              </div>
            </div>
          ) : (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button className="min-h-12 border-2 border-[#998350] px-6 py-3 text-sm font-medium hover:bg-[#eeebe4]" disabled={isSaving} onClick={resetForRetry} type="button">Retry</button>
              <button className="min-h-12 border-2 border-[#998350] bg-[#eeebe4] px-6 py-3 text-sm font-medium hover:bg-[#ddd5c3] disabled:cursor-not-allowed disabled:opacity-50" disabled={isSaving || isSaved || isAnalyzing} onClick={() => void generateFinalAnalysis()} type="button">{isAnalyzing ? 'Generating…' : analysisPreview ? 'Regenerate analysis' : 'Generate final analysis'}</button>
              <button className="min-h-12 border-2 border-[#473c21] bg-[#473c21] px-6 py-3 text-sm font-medium text-[#f9f6f1] shadow-[3px_3px_0_#b39e6c] hover:bg-[#887445] disabled:cursor-not-allowed disabled:opacity-50" disabled={isSaving || isSaved || isAnalyzing} onClick={() => void uploadRecording()} type="button">{isSaving ? 'Saving…' : isSaved ? 'Saved' : 'Complete & save'}</button>
              <time className="font-mono text-lg font-semibold" dateTime={`PT${Math.ceil(MAX_RECORDING_MS / 1000)}S`}>{formatDuration(elapsedMs)} / {formatDuration(MAX_RECORDING_MS)}</time>
            </div>
          )}
          {analysisPreview && (
            <details className="mt-5 border-2 border-[#998350] bg-[#eeebe4] p-4" open>
              <summary className="cursor-pointer text-sm font-medium text-[#473c21]">Final analysis preview</summary>
              <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs leading-5 text-[#473c21]">{JSON.stringify(analysisPreview, null, 2)}</pre>
            </details>
          )}
          <button
            className="absolute bottom-3 right-4 text-xs text-[#887445] underline underline-offset-4 hover:text-[#473c21] disabled:no-underline disabled:opacity-50 sm:bottom-4 sm:right-6"
            disabled={isRecording}
            onClick={() => setJournalMode((mode) => mode === 'voice' ? 'text' : 'voice')}
            type="button"
          >
            {journalMode === 'voice' ? 'Or enter a journal in text' : 'Back to voice journal'}
          </button>
        </section>
      </div>
    </main>
  );
}
