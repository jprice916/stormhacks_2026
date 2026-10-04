class RecorderApp {
  constructor() {
    this.preview = document.querySelector("#camera-preview");
    this.placeholder = document.querySelector("#preview-placeholder");
    this.cameraButton = document.querySelector("#camera-button");
    this.startButton = document.querySelector("#start-button");
    this.stopButton = document.querySelector("#stop-button");
    this.statusText = document.querySelector("#recording-status");
    this.liveReflection = document.querySelector("#live-reflection");
    this.liveReflectionQuestion = document.querySelector("#live-reflection-question");
    this.dismissReflectionButton = document.querySelector("#dismiss-reflection");
    this.debugQuestion = document.querySelector("#debug-question");
    this.debugGeminiStatus = document.querySelector("#debug-gemini-status");
    this.debugRequest = document.querySelector("#debug-request");
    this.debugResponse = document.querySelector("#debug-response");
    this.debugReflectionCheck = document.querySelector("#debug-reflection-check");
    this.debugCooldown = document.querySelector("#debug-cooldown");
    this.timer = document.querySelector("#recording-timer");
    this.timerLabel = document.querySelector("#timer-label");
    this.timerBar = document.querySelector(".timer-bar");
    this.recordedVideo = document.querySelector("#recorded-video");
    this.recordingActions = document.querySelector("#recording-actions");
    this.downloadLink = document.querySelector("#download-link");
    this.saveButton = document.querySelector("#save-button");
    this.revisitSuggestion = document.querySelector("#revisit-suggestion");
    this.revisitSuggestionText = document.querySelector("#revisit-suggestion-text");
    this.revisitSourceDate = document.querySelector("#revisit-source-date");
    this.revisitSourceSummary = document.querySelector("#revisit-source-summary");
    this.dismissRevisitButton = document.querySelector("#dismiss-revisit");

    this.mediaStream = undefined;
    this.mediaRecorder = undefined;
    this.recordingChunks = [];
    this.recordingBlob = undefined;
    this.recordingUrl = undefined;
    this.startedAt = undefined;
    this.recordedDurationSeconds = 0;
    this.timerInterval = undefined;

    // Web Speech API
    this.recognition = undefined;
    this.fullTranscript = "";
    this.interimTranscript = "";
    this.isRecording = false;
    this.pauseTimer = undefined;
    this.lastCheckpointLength = 0;
    this.livePromptCount = 0;
    this.recordingSessionId = undefined;
    this.nextLiveRequestAt = 0;
    this.liveCooldownInterval = undefined;
    this.liveApiRateLimited = false;
    this.liveCheckpointInterval = undefined;
    this.liveCheckpointCountdownInterval = undefined;
    this.nextPeriodicReflectionAt = 0;
    this.nextPauseReflectionAt = 0;

    // Stores latest backend response
    this.latestResult = null;

    this.bindEvents();
  }

  bindEvents() {
    this.cameraButton.addEventListener("click", () => this.startCamera());
    this.startButton.addEventListener("click", () => this.startRecording());
    this.stopButton.addEventListener("click", () => this.stopRecording());
    this.saveButton.addEventListener("click", () => this.uploadRecording());
    this.dismissRevisitButton.addEventListener("click", () => this.dismissRevisitSuggestion());
    this.dismissReflectionButton.addEventListener("click", () => {
      this.liveReflection.hidden = true;
    });
    window.addEventListener("beforeunload", () => this.destroy());
  }

  async startCamera() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      this.statusText.textContent = "Recording is not supported in this browser.";
      return;
    }

    this.cameraButton.disabled = true;
    this.statusText.textContent = "Requesting camera and microphone access…";
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
      });
      this.preview.srcObject = this.mediaStream;
      this.placeholder.hidden = true;
      this.cameraButton.textContent = "Camera ready";
      this.startButton.disabled = false;
      this.statusText.textContent = "Camera ready. Select Start recording when you are ready to speak.";
    } catch (error) {
      this.stopCamera();
      this.statusText.textContent = `Could not start camera: ${error.message}`;
    } finally {
      this.cameraButton.disabled = Boolean(this.mediaStream);
    }
  }

  initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Web Speech API not supported. Transcription will rely on backend fallback.");
      this.debugQuestion.textContent = "Live browser transcription is unavailable; the recording will be transcribed after it ends.";
      this.debugRequest.textContent = "This browser does not provide the Web Speech API.";
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = "en-US";

    this.recognition.onresult = (event) => {
      window.clearTimeout(this.pauseTimer);
      this.interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          this.fullTranscript += event.results[i][0].transcript + " ";
        } else {
          this.interimTranscript += event.results[i][0].transcript;
        }
      }
      const liveText = (this.fullTranscript + this.interimTranscript).trim();
      if (liveText) {
        this.statusText.textContent = `Live transcript: "${liveText}"`;
      }
      this.showLiveTranscriptDebug(liveText);
      this.scheduleLiveReflection();
    };

    this.recognition.onerror = (event) => {
      if (event.error !== "no-speech") {
        console.warn("Speech recognition error:", event.error);
      }
    };

    this.recognition.onend = () => {
      if (this.isRecording && this.recognition) {
        try {
          this.recognition.start();
        } catch (_) { }
      }
    };
  }

  startRecording() {
    if (!this.mediaStream) return;

    this.isRecording = true;
    this.startButton.disabled = true;
    this.cameraButton.disabled = true;
    this.stopButton.disabled = false;
    this.recordingActions.hidden = true;
    this.recordedVideo.hidden = true;
    this.revisitSuggestion.hidden = true;
    if (this.recordingUrl) URL.revokeObjectURL(this.recordingUrl);

    try {
      this.recordingChunks = [];
      this.recordingBlob = undefined;
      this.fullTranscript = "";
      this.interimTranscript = "";
      this.lastCheckpointLength = 0;
      this.livePromptCount = 0;
      this.recordingSessionId = String(Date.now()) + "-" + Math.random().toString(36).slice(2);
      this.liveReflection.hidden = true;
      this.debugQuestion.textContent = "Waiting for a prompt.";
      this.debugGeminiStatus.textContent = "Waiting to send a checkpoint.";
      this.debugRequest.textContent = "Waiting for a pause with enough finalized speech.";
      this.debugResponse.textContent = "No response yet.";
      this.nextLiveRequestAt = 0;
      this.liveApiRateLimited = false;
      window.clearInterval(this.liveCooldownInterval);
      window.clearInterval(this.liveCheckpointInterval);
      window.clearInterval(this.liveCheckpointCountdownInterval);
      this.debugCooldown.textContent = "Ready when you pause after 10 finalized words. Requests are spaced 15 seconds apart.";
      this.debugReflectionCheck.textContent = "Starts when recording begins.";

      this.mediaRecorder = this.createMediaRecorder(this.mediaStream);
      this.mediaRecorder.addEventListener("dataavailable", (event) => {
        if (event.data && event.data.size > 0) {
          this.recordingChunks.push(event.data);
        }
      });
      this.mediaRecorder.addEventListener("stop", () => this.finishRecording(), { once: true });
      this.mediaRecorder.start(500);

      this.initSpeechRecognition();
      if (this.recognition) {
        try {
          this.recognition.start();
        } catch (_) { }
      }

      this.startedAt = Date.now();
      this.recordedDurationSeconds = 0;
      this.timer.textContent = "00:00";
      this.timerLabel.textContent = "Recording";
      this.timerBar.classList.add("is-recording");
      this.timerInterval = window.setInterval(() => this.updateTimer(), 250);
      this.nextPeriodicReflectionAt = Date.now() + 20000;
      this.updateReflectionCheckTimer();
      this.liveCheckpointCountdownInterval = window.setInterval(() => this.updateReflectionCheckTimer(), 250);
      this.liveCheckpointInterval = window.setInterval(() => {
        this.nextPeriodicReflectionAt = Date.now() + 20000;
        this.requestLiveReflection("20-second interval");
      }, 20000);
      this.statusText.textContent = "Recording video and listening to your voice. Click Stop when finished.";
    } catch (error) {
      this.isRecording = false;
      this.startButton.disabled = false;
      this.cameraButton.disabled = false;
      this.statusText.textContent = `Could not start recording: ${error.message}`;
    }
  }

  stopRecording() {
    if (!this.isRecording) return;
    this.isRecording = false;
    window.clearTimeout(this.pauseTimer);
    window.clearInterval(this.liveCheckpointInterval);
    window.clearInterval(this.liveCheckpointCountdownInterval);

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (_) { }
      this.recognition = undefined;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }

    this.stopButton.disabled = true;
    window.clearInterval(this.timerInterval);
    this.updateTimer();
    this.recordedDurationSeconds = Math.round((Date.now() - this.startedAt) / 1000);
  }

  finishRecording() {
    const mimeType = this.mediaRecorder?.mimeType || "video/webm";
    this.recordingBlob = new Blob(this.recordingChunks, { type: mimeType });
    this.recordingUrl = URL.createObjectURL(this.recordingBlob);

    this.recordedVideo.src = this.recordingUrl;
    this.recordedVideo.hidden = false;
    this.downloadLink.href = this.recordingUrl;
    this.recordingActions.hidden = false;

    this.saveButton.disabled = true;
    this.saveButton.textContent = "Saving entry…";

    this.timerBar.classList.remove("is-recording");
    this.timerLabel.textContent = "Recording complete";
    this.startButton.disabled = false;
    this.cameraButton.disabled = false;

    this.statusText.textContent = `Recording complete (${(this.recordingBlob.size / (1024 * 1024)).toFixed(1)} MB). Analyzing with Gemini…`;

    this.uploadRecording();
  }

  async uploadRecording() {
    if (!this.recordingBlob) return;

    this.saveButton.disabled = true;

    const rawTranscript = (this.fullTranscript + this.interimTranscript);

    const sanitizedTranscript = rawTranscript.replace(/\s+/g, " ").trim();


    const formData = new FormData();
    formData.append("recording", this.recordingBlob, `entry_${Date.now()}.webm`);
    formData.append("user_id", "demo_user");
    formData.append("duration_seconds", String(this.recordedDurationSeconds));
    formData.append("current_local_date", new Date().toLocaleDateString("en-CA"));
    formData.append("user_time_zone", Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Vancouver");
    if (sanitizedTranscript) {
      formData.append("transcript", sanitizedTranscript);
    }

    try {
      const response = await fetch("/api/recordings", { method: "POST", body: formData });
      const result = await this.readResponseBody(response);

      if (response.ok) {
        this.latestResult = result;
        console.log("Entry JSON ready to use:", this.latestResult);

        // Render exclusively the spoken text
        this.statusText.textContent = sanitizedTranscript
          ? `"${sanitizedTranscript}"`
          : (result.transcript || "Recording saved.");

        this.saveButton.textContent = "Saved to Database";
        this.saveButton.disabled = true;

        if (result.analysis) {
          this.handleAnalysis(result.analysis);
        }
        this.showRevisitSuggestion(result.revisit_suggestion);
      } else {
        this.statusText.textContent = result.message || "Failed to process entry.";
        this.saveButton.disabled = false;
        this.saveButton.textContent = "Retry Save";
      }
    } catch (error) {
      this.statusText.textContent = `Server communication error: ${error.message}`;
      this.saveButton.disabled = false;
      this.saveButton.textContent = "Retry Save";
    }
  }

  handleAnalysis(analysis) {
    const textToSpeak = analysis.reflection_quote || analysis.summary;
    console.log("Prepared for ElevenLabs TTS:", textToSpeak);
    console.log("Emotion:", analysis.emotion);
    console.log("Key Takeaways:", analysis.key_takeaways);
    console.log("Important events:", analysis.important_events);
    console.log("Future revisit cues:", analysis.future_revisit_cues);
  }

  showRevisitSuggestion(suggestion) {
    if (!suggestion || !suggestion.suggestion) {
      this.revisitSuggestion.hidden = true;
      return;
    }
    this.revisitSuggestion.dataset.cueId = String(suggestion.cue_id);
    this.revisitSuggestionText.textContent = suggestion.suggestion;
    this.revisitSourceDate.textContent = suggestion.source_created_at
      ? "Original entry: " + new Date(suggestion.source_created_at).toLocaleDateString()
      : "";
    this.revisitSourceSummary.textContent = suggestion.source_summary || "";
    this.revisitSuggestion.hidden = false;
  }

  async dismissRevisitSuggestion() {
    const cueId = this.revisitSuggestion.dataset.cueId;
    if (!cueId) return;
    this.dismissRevisitButton.disabled = true;
    try {
      const response = await fetch("/api/revisit-cues/" + encodeURIComponent(cueId) + "/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: "demo_user" }),
      });
      if (response.ok) this.revisitSuggestion.hidden = true;
    } catch (error) {
      console.warn("Could not dismiss revisit suggestion:", error);
    } finally {
      this.dismissRevisitButton.disabled = false;
    }
  }

  scheduleLiveReflection() {
    if (!this.isRecording) return;

    window.clearTimeout(this.pauseTimer);
    this.nextPauseReflectionAt = Date.now() + 3000;
    this.updateReflectionCheckTimer();
    this.pauseTimer = window.setTimeout(() => this.requestLiveReflection("3-second pause"), 3000);
  }

  updateReflectionCheckTimer() {
    if (!this.isRecording) return;
    const now = Date.now();
    const pauseRemaining = this.nextPauseReflectionAt > now ? this.nextPauseReflectionAt - now : Infinity;
    const periodicRemaining = this.nextPeriodicReflectionAt > now ? this.nextPeriodicReflectionAt - now : Infinity;
    const isPause = pauseRemaining <= periodicRemaining;
    const remaining = Math.ceil(Math.min(pauseRemaining, periodicRemaining) / 1000);
    if (!Number.isFinite(remaining)) {
      this.debugReflectionCheck.textContent = "Waiting for speech or the automatic interval.";
      return;
    }
    this.debugReflectionCheck.textContent = (isPause ? "Pause check" : "Automatic check") + " in " + remaining + "s.";
  }

  showLiveTranscriptDebug(liveText) {
    const finalizedWords = this.fullTranscript.trim().split(/\s+/).filter(Boolean).length;
    const interimWords = this.interimTranscript.trim().split(/\s+/).filter(Boolean).length;
    this.debugRequest.textContent = JSON.stringify({
      state: finalizedWords >= 10 ? "Waiting for a 3-second pause" : "Listening for more finalized speech",
      finalized_words: finalizedWords,
      interim_words: interimWords,
      words_needed_for_first_check: Math.max(0, 10 - finalizedWords),
      live_transcript: liveText,
    }, null, 2);
    if (finalizedWords < 10) {
      this.debugQuestion.textContent = "Listening: " + finalizedWords + "/10 finalized words before the first reflection check.";
    }
  }

  async requestLiveReflection(trigger) {
    if (!this.isRecording) return;
    if (this.livePromptCount >= 4) {
      this.debugGeminiStatus.textContent = "Prompt cap reached: four questions have already been shown for this recording.";
      return;
    }
    if (this.liveApiRateLimited) {
      this.debugGeminiStatus.textContent = "Gemini rate limit hit: live requests are paused for this recording.";
      return;
    }
    this.nextPauseReflectionAt = 0;
    this.updateReflectionCheckTimer();

    const remainingCooldown = this.nextLiveRequestAt - Date.now();
    if (remainingCooldown > 0) {
      this.debugGeminiStatus.textContent = "Check skipped: waiting for the API cooldown.";
      window.clearTimeout(this.pauseTimer);
      this.pauseTimer = window.setTimeout(() => this.requestLiveReflection(trigger), remainingCooldown);
      return;
    }

    const words = this.fullTranscript.trim().split(/\s+/).filter(Boolean);
    const checkpointWords = words.slice(this.lastCheckpointLength);
    if (checkpointWords.length < 10) {
      this.debugGeminiStatus.textContent = "Check skipped: " + checkpointWords.length + "/10 new finalized words since the last request.";
      return;
    }

    const checkpoint = checkpointWords.join(" ");
    this.lastCheckpointLength = words.length;
    const requestPayload = {
      user_id: "demo_user",
      recording_id: this.recordingSessionId,
      trigger,
      checkpoint,
    };
    this.debugRequest.textContent = JSON.stringify(requestPayload, null, 2);
    this.debugGeminiStatus.textContent = "Sending checkpoint to Gemini.";
    this.startLiveCooldown(15);

    try {
      const response = await fetch("/api/live-reflection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
      });
      const result = await this.readResponseBody(response);
      this.debugResponse.textContent = JSON.stringify({ status: response.status, body: result }, null, 2);
      if (result.cooldown_seconds) this.startLiveCooldown(result.cooldown_seconds);
      if (result.retry_after_seconds) this.startLiveCooldown(result.retry_after_seconds);
      if (result.rate_limited) this.liveApiRateLimited = true;
      if (result.rate_limited) {
        this.debugGeminiStatus.textContent = "Gemini rate limit hit: live requests are paused for this recording.";
      } else if (result.error) {
        this.debugGeminiStatus.textContent = "Gemini returned an error.";
      } else {
        this.debugGeminiStatus.textContent = result.should_prompt
          ? "Gemini returned a reflection question."
          : "Gemini evaluated this checkpoint and chose not to prompt.";
      }
      if (response.ok && result.should_prompt && result.question) {
        this.livePromptCount += 1;
        this.liveReflectionQuestion.textContent = result.question;
        this.debugQuestion.textContent = result.question;
        this.liveReflection.hidden = false;
      } else if (response.ok) {
        this.debugQuestion.textContent = result.error || "No question returned for this checkpoint.";
      }
    } catch (error) {
      this.debugResponse.textContent = JSON.stringify({ error: error.message }, null, 2);
      this.debugGeminiStatus.textContent = "Could not reach the Flask server.";
      console.warn("Live reflection request failed:", error);
    }
  }

  startLiveCooldown(seconds) {
    this.nextLiveRequestAt = Date.now() + (seconds * 1000);
    window.clearInterval(this.liveCooldownInterval);
    const updateCooldown = () => {
      const remaining = Math.max(0, Math.ceil((this.nextLiveRequestAt - Date.now()) / 1000));
      this.debugCooldown.textContent = remaining > 0
        ? "Cooldown: " + remaining + "s before the next reflection request."
        : "Ready for the next 3-second pause.";
      if (remaining === 0) window.clearInterval(this.liveCooldownInterval);
    };
    updateCooldown();
    this.liveCooldownInterval = window.setInterval(updateCooldown, 250);
  }

  async readResponseBody(response) {
    const body = await response.text();
    try {
      return JSON.parse(body);
    } catch (_) {
      return {
        message: `Server returned HTTP ${response.status} instead of JSON.`,
        raw_response: body.slice(0, 1000),
      };
    }
  }

  updateTimer() {
    const seconds = Math.floor((Date.now() - this.startedAt) / 1000);
    this.timer.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }

  stopCamera() {
    if (this.isRecording) this.stopRecording();
    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.mediaStream = undefined;
    this.preview.srcObject = null;
    this.placeholder.hidden = false;
    this.cameraButton.textContent = "Turn on camera";
    this.startButton.disabled = true;
  }

  destroy() {
    window.clearTimeout(this.pauseTimer);
    window.clearInterval(this.liveCooldownInterval);
    window.clearInterval(this.liveCheckpointInterval);
    window.clearInterval(this.liveCheckpointCountdownInterval);
    this.stopCamera();
    if (this.recordingUrl) URL.revokeObjectURL(this.recordingUrl);
  }

  createMediaRecorder(stream) {
    const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type));
    return mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const recorderApp = new RecorderApp();
  recorderApp.startCamera();
}, { once: true });
