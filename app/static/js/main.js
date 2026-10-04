class RecorderApp {
  constructor() {
    this.preview = document.querySelector("#camera-preview");
    this.placeholder = document.querySelector("#preview-placeholder");
    this.cameraButton = document.querySelector("#camera-button");
    this.startButton = document.querySelector("#start-button");
    this.stopButton = document.querySelector("#stop-button");
    this.statusText = document.querySelector("#recording-status");
    this.timer = document.querySelector("#recording-timer");
    this.timerLabel = document.querySelector("#timer-label");
    this.timerBar = document.querySelector(".timer-bar");
    this.recordedVideo = document.querySelector("#recorded-video");
    this.recordingActions = document.querySelector("#recording-actions");
    this.downloadLink = document.querySelector("#download-link");
    this.saveButton = document.querySelector("#save-button");

    this.mediaStream = undefined;
    this.mediaRecorder = undefined;
    this.recordingChunks = [];
    this.recordingBlob = undefined;
    this.recordingUrl = undefined;
    this.startedAt = undefined;
    this.recordedDurationSeconds = 0;
    this.timerInterval = undefined;

    this.bindEvents();
  }

  bindEvents() {
    this.cameraButton.addEventListener("click", () => this.startCamera());
    this.startButton.addEventListener("click", () => this.startRecording());
    this.stopButton.addEventListener("click", () => this.stopRecording());
    this.saveButton.addEventListener("click", () => this.uploadRecording());
    window.addEventListener("beforeunload", () => this.destroy());
  }

  async startCamera() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      this.statusText.textContent = "Recording is not supported in this browser. Try a current version of Chrome, Edge, or Firefox over HTTPS or localhost.";
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
      this.statusText.textContent = "Camera and microphone are ready. Select Start recording when you are ready.";
    } catch (error) {
      this.stopCamera();
      this.statusText.textContent = error.name === "NotAllowedError"
        ? "Camera or microphone access was denied. Allow access in your browser settings and try again."
        : `Could not start the camera: ${error.message}`;
    } finally {
      this.cameraButton.disabled = Boolean(this.mediaStream);
    }
  }

  startRecording() {
    if (!this.mediaStream) return;

    this.startButton.disabled = true;
    this.cameraButton.disabled = true;
    try {
      this.recordingChunks = [];
      this.recordingBlob = undefined;
      this.recordingActions.hidden = true;
      this.recordedVideo.hidden = true;
      if (this.recordingUrl) URL.revokeObjectURL(this.recordingUrl);

      this.mediaRecorder = this.createMediaRecorder(this.mediaStream);
      this.mediaRecorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) this.recordingChunks.push(event.data);
      });
      this.mediaRecorder.addEventListener("stop", () => this.finishRecording(), { once: true });
      this.mediaRecorder.start(1000);

      this.startedAt = Date.now();
      this.recordedDurationSeconds = 0;
      this.timer.textContent = "00:00";
      this.timerLabel.textContent = "Recording";
      this.timerBar.classList.add("is-recording");
      this.timerInterval = window.setInterval(() => this.updateTimer(), 250);
      this.stopButton.disabled = false;
      this.statusText.textContent = "Recording video and audio. Select Stop when you are done.";
    } catch (error) {
      this.startButton.disabled = false;
      this.cameraButton.disabled = false;
      this.statusText.textContent = `Could not start recording: ${error.message}`;
    }
  }

  stopRecording() {
    if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") return;

    this.mediaRecorder.stop();
    this.stopButton.disabled = true;
    window.clearInterval(this.timerInterval);
    this.updateTimer();
    this.recordedDurationSeconds = Math.round((Date.now() - this.startedAt) / 1000);
  }

  finishRecording() {
    this.recordingBlob = new Blob(this.recordingChunks, { type: this.mediaRecorder.mimeType || "video/webm" });
    this.recordingUrl = URL.createObjectURL(this.recordingBlob);
    this.recordedVideo.src = this.recordingUrl;
    this.recordedVideo.hidden = false;
    this.downloadLink.href = this.recordingUrl;
    this.recordingActions.hidden = false;
    this.stopCamera();
    this.statusText.textContent = `Recording ready (${(this.recordingBlob.size / (1024 * 1024)).toFixed(1)} MB). Preview or download it, or try the TiDB upload placeholder.`;
    this.timerBar.classList.remove("is-recording");
    this.timerLabel.textContent = "Recording complete";
    this.cameraButton.disabled = false;
  }

  async uploadRecording() {
    if (!this.recordingBlob) return;

    this.saveButton.disabled = true;
    this.statusText.textContent = "Sending recording to the Flask TiDB placeholder…";
    const formData = new FormData();
    formData.append("recording", this.recordingBlob, "webcam-recording.webm");
    formData.append("duration_seconds", String(this.recordedDurationSeconds));

    try {
      const response = await fetch("/api/recordings", { method: "POST", body: formData });
      const result = await response.json();
      this.statusText.textContent = result.message || (response.ok ? "Upload complete." : "Upload failed.");
    } catch (error) {
      this.statusText.textContent = `Could not reach the Flask server: ${error.message}`;
    } finally {
      this.saveButton.disabled = false;
    }
  }

  createMediaRecorder(stream) {
    const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type));
    return mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  }

  updateTimer() {
    const seconds = Math.floor((Date.now() - this.startedAt) / 1000);
    this.timer.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }

  stopCamera() {
    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.mediaStream = undefined;
    this.preview.srcObject = null;
    this.placeholder.hidden = false;
    this.cameraButton.textContent = "Turn on camera";
    this.startButton.disabled = true;
  }

  destroy() {
    this.stopCamera();
    if (this.recordingUrl) URL.revokeObjectURL(this.recordingUrl);
  }
}

// Saved browser permissions permit the preview to open immediately. First-time
// visitors receive the browser's standard camera and microphone permission prompt.
window.addEventListener("DOMContentLoaded", () => {
  const recorderApp = new RecorderApp();
  recorderApp.startCamera();
}, { once: true });
