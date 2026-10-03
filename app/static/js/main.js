const preview = document.querySelector("#camera-preview");
const placeholder = document.querySelector("#preview-placeholder");
const cameraButton = document.querySelector("#camera-button");
const startButton = document.querySelector("#start-button");
const stopButton = document.querySelector("#stop-button");
const statusText = document.querySelector("#recording-status");
const timer = document.querySelector("#recording-timer");
const timerLabel = document.querySelector("#timer-label");
const timerBar = document.querySelector(".timer-bar");
const recordedVideo = document.querySelector("#recorded-video");
const recordingActions = document.querySelector("#recording-actions");
const downloadLink = document.querySelector("#download-link");
const saveButton = document.querySelector("#save-button");

let mediaStream;
let mediaRecorder;
let recordingChunks = [];
let recordingBlob;
let recordingUrl;
let startedAt;
let recordedDurationSeconds = 0;
let timerInterval;

function formatTime(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function updateTimer() {
  timer.textContent = formatTime(Date.now() - startedAt);
}

function stopCamera() {
  mediaStream?.getTracks().forEach((track) => track.stop());
  mediaStream = undefined;
  preview.srcObject = null;
  placeholder.hidden = false;
  cameraButton.textContent = "Turn on camera";
  startButton.disabled = true;
}

function makeRecorder(stream) {
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type));
  return mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    statusText.textContent = "Recording is not supported in this browser. Try a current version of Chrome, Edge, or Firefox over HTTPS or localhost.";
    return;
  }

  cameraButton.disabled = true;
  statusText.textContent = "Requesting camera and microphone access…";
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
    });
    preview.srcObject = mediaStream;
    placeholder.hidden = true;
    cameraButton.textContent = "Camera ready";
    startButton.disabled = false;
    statusText.textContent = "Camera and microphone are ready. Select Start recording when you are ready.";
  } catch (error) {
    stopCamera();
    statusText.textContent = error.name === "NotAllowedError"
      ? "Camera or microphone access was denied. Allow access in your browser settings and try again."
      : `Could not start the camera: ${error.message}`;
  } finally {
    cameraButton.disabled = Boolean(mediaStream);
  }
}

cameraButton.addEventListener("click", startCamera);

// Ask for the preview as soon as the page opens. Browsers reuse saved site
// permissions; otherwise they show their standard camera/microphone prompt.
window.addEventListener("DOMContentLoaded", () => {
  startCamera();
}, { once: true });

startButton.addEventListener("click", () => {
  if (!mediaStream) return;
  startButton.disabled = true;
  cameraButton.disabled = true;
  try {

    recordingChunks = [];
    recordingBlob = undefined;
    recordingActions.hidden = true;
    recordedVideo.hidden = true;
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    mediaRecorder = makeRecorder(mediaStream);
    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) recordingChunks.push(event.data);
    });
    mediaRecorder.addEventListener("stop", () => {
      recordingBlob = new Blob(recordingChunks, { type: mediaRecorder.mimeType || "video/webm" });
      recordingUrl = URL.createObjectURL(recordingBlob);
      recordedVideo.src = recordingUrl;
      recordedVideo.hidden = false;
      downloadLink.href = recordingUrl;
      recordingActions.hidden = false;
      stopCamera();
      statusText.textContent = `Recording ready (${(recordingBlob.size / (1024 * 1024)).toFixed(1)} MB). Preview or download it, or try the TiDB upload placeholder.`;
      timerBar.classList.remove("is-recording");
      timerLabel.textContent = "Recording complete";
      cameraButton.disabled = false;
      cameraButton.textContent = "Turn on camera";
    }, { once: true });

    mediaRecorder.start(1000);
    startedAt = Date.now();
    recordedDurationSeconds = 0;
    timer.textContent = "00:00";
    timerLabel.textContent = "Recording";
    timerBar.classList.add("is-recording");
    timerInterval = window.setInterval(updateTimer, 250);
    stopButton.disabled = false;
    statusText.textContent = "Recording video and audio. Select Stop when you are done.";
  } catch (error) {
    startButton.disabled = false;
    cameraButton.disabled = false;
    statusText.textContent = `Could not start recording: ${error.message}`;
  }
});

stopButton.addEventListener("click", () => {
  if (!mediaRecorder || mediaRecorder.state === "inactive") return;
  mediaRecorder.stop();
  stopButton.disabled = true;
  window.clearInterval(timerInterval);
  updateTimer();
  recordedDurationSeconds = Math.round((Date.now() - startedAt) / 1000);
});

saveButton.addEventListener("click", async () => {
  if (!recordingBlob) return;
  saveButton.disabled = true;
  statusText.textContent = "Sending recording to the Flask TiDB placeholder…";
  const formData = new FormData();
  formData.append("recording", recordingBlob, "webcam-recording.webm");
  formData.append("duration_seconds", String(recordedDurationSeconds));

  try {
    const response = await fetch("/api/recordings", { method: "POST", body: formData });
    const result = await response.json();
    statusText.textContent = result.message || (response.ok ? "Upload complete." : "Upload failed.");
  } catch (error) {
    statusText.textContent = `Could not reach the Flask server: ${error.message}`;
  } finally {
    saveButton.disabled = false;
  }
});

window.addEventListener("beforeunload", () => {
  stopCamera();
  if (recordingUrl) URL.revokeObjectURL(recordingUrl);
});
