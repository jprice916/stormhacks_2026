class RecorderApp {
  static maxRecordingDurationMs = 5 * 60 * 1000;

  constructor() {
    this.preview = document.querySelector("#camera-preview");
    this.placeholder = document.querySelector("#preview-placeholder");
    this.recordButton = document.querySelector("#record-button");
    this.statusText = document.querySelector("#recording-status");
    this.timer = document.querySelector("#recording-timer");
    this.timerLabel = document.querySelector("#timer-label");
    this.timerBar = document.querySelector(".timer-bar");
    this.recordedVideo = document.querySelector("#recorded-video");
    this.recordingActions = document.querySelector("#recording-actions");
    this.retryButton = document.querySelector("#retry-button");
    this.completeButton = document.querySelector("#complete-button");

    this.mediaStream = undefined;
    this.mediaRecorder = undefined;
    this.recordingMimeType = undefined;
    this.recordingChunks = [];
    this.recordingBlob = undefined;
    this.recordingUrl = undefined;
    this.startedAt = undefined;
    this.recordedDurationSeconds = 0;
    this.recordedAtLocal = undefined;
    this.userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    this.isRecording = false;
    this.timerInterval = undefined;
    this.recordingTimeout = undefined;

    this.bindEvents();
  }

  bindEvents() {
    this.recordButton.addEventListener("click", () => this.toggleRecording());
    this.retryButton.addEventListener("click", () => this.retryRecording());
    this.completeButton.addEventListener("click", () => this.uploadRecording());
    this.recordedVideo.addEventListener("error", () => {
      if (this.recordingUrl) {
        this.statusText.textContent = "This recording could not be played in this browser. Select Retry to record a new clip.";
      }
    });
    window.addEventListener("beforeunload", () => this.destroy());
  }

  async startCamera() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      this.statusText.textContent = "Recording is not supported in this browser. Try a current version of Chrome, Edge, or Firefox over HTTPS or localhost.";
      return;
    }

    this.recordButton.disabled = true;
    this.statusText.textContent = "Requesting camera and microphone access…";
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
      });
      this.preview.hidden = false;
      this.recordedVideo.hidden = true;
      this.preview.srcObject = this.mediaStream;
      this.placeholder.hidden = true;
      this.recordButton.disabled = false;
      this.statusText.textContent = "Camera and microphone are ready. Select Record when you are ready.";
    } catch (error) {
      this.stopCamera();
      this.statusText.textContent = error.name === "NotAllowedError"
        ? "Camera or microphone access was denied. Allow access in your browser settings and try again."
        : `Could not start the camera: ${error.message}`;
    } finally {
      this.recordButton.disabled = !this.mediaStream;
    }
  }

  toggleRecording() {
    if (this.isRecording) {
      this.stopRecording();
      return;
    }
    this.startRecording();
  }

  startRecording() {
    if (!this.mediaStream) return;

    this.recordButton.disabled = true;
    try {
      this.recordingChunks = [];
      this.recordingBlob = undefined;
      this.recordingActions.hidden = true;
      this.completeButton.disabled = false;
      this.recordedVideo.hidden = true;
      if (this.recordingUrl) URL.revokeObjectURL(this.recordingUrl);

      this.mediaRecorder = this.createMediaRecorder(this.mediaStream);
      this.recordingMimeType = this.mediaRecorder.mimeType || "video/webm";
      this.mediaRecorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) this.recordingChunks.push(event.data);
      });
      this.mediaRecorder.addEventListener("stop", () => {
        window.setTimeout(() => this.finishRecording(), 0);
      }, { once: true });
      // A single finalized chunk is more broadly playable than timed WebM
      // fragments assembled after the recording stops.
      this.mediaRecorder.start();

      this.startedAt = Date.now();
      this.recordedDurationSeconds = 0;
      this.recordedAtLocal = undefined;
      this.timer.textContent = this.formatTime(RecorderApp.maxRecordingDurationMs);
      this.timerLabel.textContent = "Time left";
      this.timerBar.classList.add("is-recording");
      this.timerInterval = window.setInterval(() => this.updateTimer(), 250);
      this.recordingTimeout = window.setTimeout(
        () => this.stopRecording(),
        RecorderApp.maxRecordingDurationMs,
      );
      this.isRecording = true;
      this.recordButton.textContent = "Stop recording";
      this.recordButton.disabled = false;
      this.statusText.textContent = "Recording video and audio. Five minutes remaining; recording stops automatically at the limit.";
    } catch (error) {
      this.recordButton.disabled = false;
      this.statusText.textContent = `Could not start recording: ${error.message}`;
    }
  }

  stopRecording() {
    if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") return;

    // stop() flushes the final playable WebM chunk before the "stop" event.
    this.mediaRecorder.stop();
    this.isRecording = false;
    this.recordButton.disabled = true;
    window.clearInterval(this.timerInterval);
    window.clearTimeout(this.recordingTimeout);
    this.updateTimer();
    this.recordedDurationSeconds = Math.round((Date.now() - this.startedAt) / 1000);
    this.recordedAtLocal = this.localTimestamp();
  }

  finishRecording() {
    const chunkMimeType = this.recordingChunks.find((chunk) => chunk.type)?.type;
    this.recordingBlob = new Blob(this.recordingChunks, { type: chunkMimeType || this.recordingMimeType || "video/webm" });
    if (!this.recordingBlob.size) {
      this.stopCamera();
      this.timerBar.classList.remove("is-recording");
      this.timerLabel.textContent = "Recording failed";
      this.completeButton.disabled = true;
      this.statusText.textContent = "The browser did not produce a recording. Select Retry and try again.";
      this.recordingActions.hidden = false;
      this.recordButton.hidden = true;
      return;
    }
    this.recordingUrl = URL.createObjectURL(this.recordingBlob);
    this.preview.hidden = true;
    this.placeholder.hidden = true;
    this.recordedVideo.src = this.recordingUrl;
    this.recordedVideo.hidden = false;
    this.recordedVideo.load();
    this.recordingActions.hidden = false;
    this.stopCamera(false);
    this.statusText.textContent = `Recording ready (${(this.recordingBlob.size / (1024 * 1024)).toFixed(1)} MB). Select Retry or Complete.`;
    this.timerBar.classList.remove("is-recording");
    this.timerLabel.textContent = "Recording complete";
    this.recordButton.hidden = true;
  }

  retryRecording() {
    this.recordingActions.hidden = true;
    this.recordedVideo.pause();
    this.recordedVideo.removeAttribute("src");
    this.recordedVideo.load();
    this.recordedVideo.hidden = true;
    if (this.recordingUrl) URL.revokeObjectURL(this.recordingUrl);
    this.recordingUrl = undefined;
    this.recordingBlob = undefined;
    this.recordButton.hidden = false;
    this.recordButton.textContent = "Record";
    this.recordButton.disabled = true;
    this.timer.textContent = this.formatTime(RecorderApp.maxRecordingDurationMs);
    this.timerLabel.textContent = "Ready to record";
    this.preview.hidden = false;
    this.placeholder.hidden = false;
    this.startCamera();
  }

  async uploadRecording() {
    if (!this.recordingBlob) return;

    this.completeButton.disabled = true;
    this.statusText.textContent = "Saving recording and log date…";
    const formData = new FormData();
    formData.append("recording", this.recordingBlob, "webcam-recording.webm");
    formData.append("duration_seconds", String(this.recordedDurationSeconds));
    formData.append("recorded_at_local", this.recordedAtLocal || this.localTimestamp());
    formData.append("user_time_zone", this.userTimeZone || "");

    try {
      const response = await fetch("/api/recordings", { method: "POST", body: formData });
      const result = await response.json();
      this.statusText.textContent = response.ok
        ? `Saved to TiDB on ${new Date(result.logged_at).toLocaleString()}.`
        : (result.message || "Could not save the recording.");
    } catch (error) {
      this.statusText.textContent = `Could not reach the Flask server: ${error.message}`;
    } finally {
    this.completeButton.disabled = false;
    }
  }

  createMediaRecorder(stream) {
    const candidates = ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"];
    const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type));
    return mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  }

  updateTimer() {
    const elapsed = Date.now() - this.startedAt;
    this.timer.textContent = this.formatTime(Math.max(0, RecorderApp.maxRecordingDurationMs - elapsed));
  }

  formatTime(milliseconds) {
    const seconds = Math.ceil(milliseconds / 1000);
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }

  localTimestamp() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }

  stopCamera(showPlaceholder = true) {
    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.mediaStream = undefined;
    this.preview.srcObject = null;
    this.placeholder.hidden = !showPlaceholder;
  }

  destroy() {
    window.clearInterval(this.timerInterval);
    window.clearTimeout(this.recordingTimeout);
    this.stopCamera();
    if (this.recordingUrl) URL.revokeObjectURL(this.recordingUrl);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const recorderApp = new RecorderApp();
  recorderApp.startCamera();
}, { once: true });
