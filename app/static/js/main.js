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

    // Web Speech API
    this.recognition = undefined;
    this.fullTranscript = "";
    this.interimTranscript = "";
    this.isRecording = false;

    // Stores latest backend response
    this.latestResult = null;

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
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = "en-US";

    this.recognition.onresult = (event) => {
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
    if (this.recordingUrl) URL.revokeObjectURL(this.recordingUrl);

    try {
      this.recordingChunks = [];
      this.recordingBlob = undefined;
      this.fullTranscript = "";
      this.interimTranscript = "";

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

    "slash for delimiters, s for whitespace and tabs/new lines, g for global so it makes the changes for all instances."
    const sanitizedTranscript = rawTranscript.replace(/\s+/g, " ").trim();


    const formData = new FormData();
    formData.append("recording", this.recordingBlob, `entry_${Date.now()}.webm`);
    formData.append("user_id", "demo_user");
    formData.append("duration_seconds", String(this.recordedDurationSeconds));
    if (sanitizedTranscript) {
      formData.append("transcript", sanitizedTranscript);
    }

    try {
      const response = await fetch("/api/recordings", { method: "POST", body: formData });
      const result = await response.json();

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
    console.log("Follow-up Questions:", analysis.follow_up_questions);
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