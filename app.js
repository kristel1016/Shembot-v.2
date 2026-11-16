const elements = {
  camera: document.querySelector("#camera"),
  overlay: document.querySelector("#overlay"),
  cameraStage: document.querySelector("#cameraStage"),
  cameraCard: document.querySelector("#cameraCard"),
  emptyState: document.querySelector("#emptyState"),
  hud: document.querySelector("#hud"),
  modelLoading: document.querySelector("#modelLoading"),
  modelStatus: document.querySelector("#modelStatus"),
  startButton: document.querySelector("#startButton"),
  flipButton: document.querySelector("#flipButton"),
  countValue: document.querySelector("#countValue"),
  capacityStatus: document.querySelector("#capacityStatus"),
  fpsValue: document.querySelector("#fpsValue"),
  capacityInput: document.querySelector("#capacityInput"),
  capacityOutput: document.querySelector("#capacityOutput"),
  confidenceInput: document.querySelector("#confidenceInput"),
  confidenceOutput: document.querySelector("#confidenceOutput"),
  errorMessage: document.querySelector("#errorMessage"),
};

const state = {
  model: null,
  stream: null,
  running: false,
  facingMode: "environment",
  loopToken: 0,
  countHistory: [],
  lastInferenceAt: performance.now(),
  wakeLock: null,
};

function showError(message) {
  elements.errorMessage.textContent = message;
  elements.errorMessage.hidden = false;
}

function clearError() {
  elements.errorMessage.hidden = true;
  elements.errorMessage.textContent = "";
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function updateCapacity(count) {
  const limit = Number(elements.capacityInput.value);
  const isAlert = count > limit;
  elements.countValue.textContent = String(count);
  elements.capacityStatus.textContent = isAlert ? "OVER CAPACITY" : "CAPACITY OK";
  elements.cameraCard.classList.toggle("is-alert", isAlert);
}

function syncCanvas() {
  const width = elements.camera.videoWidth;
  const height = elements.camera.videoHeight;
  if (!width || !height) return;
  elements.overlay.width = width;
  elements.overlay.height = height;
  elements.cameraStage.style.aspectRatio = `${width} / ${height}`;
}

function drawDetections(predictions) {
  const context = elements.overlay.getContext("2d");
  context.clearRect(0, 0, elements.overlay.width, elements.overlay.height);
  const alertColor = getComputedStyle(document.documentElement).getPropertyValue("--red").trim();
  const normalColor = getComputedStyle(document.documentElement).getPropertyValue("--green").trim();
  const color = elements.cameraCard.classList.contains("is-alert") ? alertColor : normalColor;

  context.lineWidth = Math.max(3, elements.overlay.width / 210);
  context.font = `700 ${Math.max(14, elements.overlay.width / 35)}px system-ui`;
  context.textBaseline = "top";

  for (const prediction of predictions) {
    const [x, y, width, height] = prediction.bbox;
    const label = `${Math.round(prediction.score * 100)}%`;
    context.strokeStyle = color;
    context.strokeRect(x, y, width, height);
    const textWidth = context.measureText(label).width;
    const textHeight = Math.max(21, elements.overlay.width / 27);
    context.fillStyle = color;
    context.fillRect(x, Math.max(0, y - textHeight), textWidth + 12, textHeight);
    context.fillStyle = "#031009";
    context.fillText(label, x + 6, Math.max(1, y - textHeight + 2));
  }
}

async function detectLoop(token) {
  if (!state.running || token !== state.loopToken) return;

  try {
    const minimumScore = Number(elements.confidenceInput.value) / 100;
    const predictions = await state.model.detect(elements.camera, 30, minimumScore);
    if (!state.running || token !== state.loopToken) return;

    const people = predictions.filter((prediction) => prediction.class === "person");
    state.countHistory.push(people.length);
    if (state.countHistory.length > 5) state.countHistory.shift();
    const stableCount = median(state.countHistory);
    updateCapacity(stableCount);
    drawDetections(people);

    const now = performance.now();
    const fps = 1000 / Math.max(1, now - state.lastInferenceAt);
    state.lastInferenceAt = now;
    elements.fpsValue.textContent = fps.toFixed(1);
  } catch (error) {
    console.error(error);
    showError("Detection paused unexpectedly. Stop the camera, then start it again.");
    return;
  }

  requestAnimationFrame(() => detectLoop(token));
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator)) return;
  try {
    state.wakeLock = await navigator.wakeLock.request("screen");
  } catch {
    state.wakeLock = null;
  }
}

async function startCamera() {
  clearError();
  if (!navigator.mediaDevices?.getUserMedia) {
    showError("Camera access is unavailable. Open this site directly in a current browser over HTTPS.");
    return;
  }

  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: state.facingMode },
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      audio: false,
    });
    elements.camera.srcObject = state.stream;
    await elements.camera.play();
    syncCanvas();
    state.running = true;
    state.loopToken += 1;
    state.countHistory = [];
    state.lastInferenceAt = performance.now();
    elements.emptyState.hidden = true;
    elements.hud.hidden = false;
    elements.flipButton.disabled = false;
    elements.startButton.classList.add("is-running");
    elements.startButton.innerHTML = '<span class="button-icon">■</span> Stop camera';
    await requestWakeLock();
    detectLoop(state.loopToken);
  } catch (error) {
    console.error(error);
    const guidance = error?.name === "NotAllowedError"
      ? "Camera permission was denied. Allow camera access in the browser’s site settings and try again."
      : "The camera could not start. Close other apps using the camera, then try again.";
    showError(guidance);
  }
}

function stopCamera() {
  state.running = false;
  state.loopToken += 1;
  state.stream?.getTracks().forEach((track) => track.stop());
  state.stream = null;
  elements.camera.srcObject = null;
  const context = elements.overlay.getContext("2d");
  context.clearRect(0, 0, elements.overlay.width, elements.overlay.height);
  elements.hud.hidden = true;
  elements.emptyState.hidden = false;
  elements.flipButton.disabled = true;
  elements.startButton.classList.remove("is-running");
  elements.startButton.innerHTML = '<span class="button-icon">●</span> Start camera';
  elements.cameraCard.classList.remove("is-alert");
  state.wakeLock?.release().catch(() => {});
  state.wakeLock = null;
}

async function flipCamera() {
  const wasRunning = state.running;
  if (wasRunning) stopCamera();
  state.facingMode = state.facingMode === "environment" ? "user" : "environment";
  await startCamera();
}

async function loadModel() {
  try {
    elements.modelStatus.textContent = "Loading mobile person detector…";
    await tf.setBackend("webgl");
    await tf.ready();
    state.model = await cocoSsd.load({ base: "lite_mobilenet_v2" });
    elements.modelLoading.hidden = true;
    elements.startButton.disabled = false;
  } catch (error) {
    console.error(error);
    elements.modelStatus.textContent = "Detector could not load";
    showError("The detection model could not download. Check the internet connection and reload the page.");
  }
}

elements.startButton.addEventListener("click", () => {
  if (state.running) stopCamera();
  else startCamera();
});

elements.flipButton.addEventListener("click", flipCamera);
elements.camera.addEventListener("loadedmetadata", syncCanvas);
elements.capacityInput.addEventListener("input", () => {
  elements.capacityOutput.textContent = `${elements.capacityInput.value} people`;
  updateCapacity(Number(elements.countValue.textContent));
});
elements.confidenceInput.addEventListener("input", () => {
  elements.confidenceOutput.textContent = `${elements.confidenceInput.value}%`;
});

document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && state.running && !state.wakeLock) {
    await requestWakeLock();
  }
});

window.addEventListener("beforeunload", stopCamera);
window.addEventListener("load", loadModel);
