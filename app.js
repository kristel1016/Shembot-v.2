import {
  FilesetResolver,
  ObjectDetector,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/vision_bundle.mjs";

const MEDIAPIPE_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm";
const MODEL_PATH = "./efficientdet_lite0.tflite";
const MAX_INFERENCE_DIMENSION = 416;

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
  rotateButton: document.querySelector("#rotateButton"),
  countValue: document.querySelector("#countValue"),
  capacityStatus: document.querySelector("#capacityStatus"),
  fpsValue: document.querySelector("#fpsValue"),
  capacityInput: document.querySelector("#capacityInput"),
  capacityOutput: document.querySelector("#capacityOutput"),
  confidenceInput: document.querySelector("#confidenceInput"),
  confidenceOutput: document.querySelector("#confidenceOutput"),
  errorMessage: document.querySelector("#errorMessage"),
};

const inferenceCanvas = document.createElement("canvas");
const inferenceContext = inferenceCanvas.getContext("2d", {
  alpha: false,
  desynchronized: true,
});

const state = {
  detector: null,
  stream: null,
  running: false,
  facingMode: "environment",
  loopToken: 0,
  countHistory: [],
  fpsHistory: [],
  lastVideoTime: -1,
  rotation: Number(localStorage.getItem("detectionRotation")) || 0,
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
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function average(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
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

  if (elements.overlay.width !== width) elements.overlay.width = width;
  if (elements.overlay.height !== height) elements.overlay.height = height;
  elements.cameraStage.style.aspectRatio = \`\${width} / \${height}\`;
}

function prepareInferenceFrame() {
  const sourceWidth = elements.camera.videoWidth;
  const sourceHeight = elements.camera.videoHeight;
  const turnsSideways = state.rotation === 90 || state.rotation === 270;
  const rotatedWidth = turnsSideways ? sourceHeight : sourceWidth;
  const rotatedHeight = turnsSideways ? sourceWidth : sourceHeight;
  const scale = Math.min(1, MAX_INFERENCE_DIMENSION / Math.max(rotatedWidth, rotatedHeight));
  const width = Math.max(1, Math.round(rotatedWidth * scale));
  const height = Math.max(1, Math.round(rotatedHeight * scale));

  if (inferenceCanvas.width !== width) inferenceCanvas.width = width;
  if (inferenceCanvas.height !== height) inferenceCanvas.height = height;

  inferenceContext.save();
  inferenceContext.setTransform(1, 0, 0, 1, 0, 0);
  inferenceContext.fillStyle = "#000";
  inferenceContext.fillRect(0, 0, width, height);

  if (state.rotation === 90) {
    inferenceContext.translate(width, 0);
    inferenceContext.rotate(Math.PI / 2);
    inferenceContext.drawImage(elements.camera, 0, 0, height, width);
  } else if (state.rotation === 180) {
    inferenceContext.translate(width, height);
    inferenceContext.rotate(Math.PI);
    inferenceContext.drawImage(elements.camera, 0, 0, width, height);
  } else if (state.rotation === 270) {
    inferenceContext.translate(0, height);
    inferenceContext.rotate(-Math.PI / 2);
    inferenceContext.drawImage(elements.camera, 0, 0, height, width);
  } else {
    inferenceContext.drawImage(elements.camera, 0, 0, width, height);
  }

  inferenceContext.restore();
  return { sourceWidth, sourceHeight, rotatedWidth, rotatedHeight, width, height };
}

function mapBoxToVideo(box, frame) {
  const rotatedX = box.originX * (frame.rotatedWidth / frame.width);
  const rotatedY = box.originY * (frame.rotatedHeight / frame.height);
  const rotatedBoxWidth = box.width * (frame.rotatedWidth / frame.width);
  const rotatedBoxHeight = box.height * (frame.rotatedHeight / frame.height);

  if (state.rotation === 90) {
    return [
      rotatedY,
      frame.sourceHeight - (rotatedX + rotatedBoxWidth),
      rotatedBoxHeight,
      rotatedBoxWidth,
    ];
  }

  if (state.rotation === 180) {
    return [
      frame.sourceWidth - (rotatedX + rotatedBoxWidth),
      frame.sourceHeight - (rotatedY + rotatedBoxHeight),
      rotatedBoxWidth,
      rotatedBoxHeight,
    ];
  }

  if (state.rotation === 270) {
    return [
      frame.sourceWidth - (rotatedY + rotatedBoxHeight),
      rotatedX,
      rotatedBoxHeight,
      rotatedBoxWidth,
    ];
  }

  return [rotatedX, rotatedY, rotatedBoxWidth, rotatedBoxHeight];
}

function drawDetections(people, frame) {
  const context = elements.overlay.getContext("2d");
  context.clearRect(0, 0, elements.overlay.width, elements.overlay.height);
  const styles = getComputedStyle(document.documentElement);
  const color = elements.cameraCard.classList.contains("is-alert")
    ? styles.getPropertyValue("--red").trim()
    : styles.getPropertyValue("--green").trim();

  context.lineWidth = Math.max(3, elements.overlay.width / 210);
  context.font = \`700 \${Math.max(14, elements.overlay.width / 35)}px system-ui\`;
  context.textBaseline = "top";

  for (const person of people) {
    const [x, y, width, height] = mapBoxToVideo(person.boundingBox, frame);
    const label = \`\${Math.round(person.score * 100)}%\`;
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

function scheduleDetection(token) {
  requestAnimationFrame(() => detectLoop(token));
}

function detectLoop(token) {
  if (!state.running || token !== state.loopToken) return;

  if (
    elements.camera.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
    elements.camera.currentTime === state.lastVideoTime
  ) {
    scheduleDetection(token);
    return;
  }

  state.lastVideoTime = elements.camera.currentTime;
  const startedAt = performance.now();

  try {
    syncCanvas();
    const frame = prepareInferenceFrame();
    const result = state.detector.detectForVideo(inferenceCanvas, startedAt);
    if (!state.running || token !== state.loopToken) return;

    const minimumScore = Number(elements.confidenceInput.value) / 100;
    const people = (result.detections || [])
      .map((detection) => {
        const category = detection.categories?.[0];
        return {
          boundingBox: detection.boundingBox,
          score: category?.score || 0,
          categoryName: category?.categoryName || "",
        };
      })
      .filter(
        (detection) =>
          detection.categoryName === "person" && detection.score >= minimumScore,
      );

    state.countHistory.push(people.length);
    if (state.countHistory.length > 4) state.countHistory.shift();
    updateCapacity(median(state.countHistory));
    drawDetections(people, frame);

    const inferenceFps = 1000 / Math.max(1, performance.now() - startedAt);
    state.fpsHistory.push(inferenceFps);
    if (state.fpsHistory.length > 8) state.fpsHistory.shift();
    elements.fpsValue.textContent = average(state.fpsHistory).toFixed(1);
  } catch (error) {
    console.error(error);
    showError("Detection paused unexpectedly. Stop the camera, then start it again.");
    return;
  }

  scheduleDetection(token);
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
    showError("Camera access is unavailable. Open this site in a current browser over HTTPS.");
    return;
  }

  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: state.facingMode },
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 24, max: 30 },
      },
      audio: false,
    });
    elements.camera.srcObject = state.stream;
    await elements.camera.play();
    syncCanvas();
    state.running = true;
    state.loopToken += 1;
    state.countHistory = [];
    state.fpsHistory = [];
    state.lastVideoTime = -1;
    elements.emptyState.hidden = true;
    elements.hud.hidden = false;
    elements.flipButton.disabled = false;
    elements.rotateButton.disabled = false;
    elements.startButton.classList.add("is-running");
    elements.startButton.innerHTML = '<span class="button-icon">■</span> Stop camera';
    await requestWakeLock();
    detectLoop(state.loopToken);
  } catch (error) {
    console.error(error);
    const guidance =
      error?.name === "NotAllowedError"
        ? "Camera permission was denied. Allow camera access in the browser's site settings and try again."
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
  elements.overlay.getContext("2d").clearRect(
    0,
    0,
    elements.overlay.width,
    elements.overlay.height,
  );
  elements.hud.hidden = true;
  elements.emptyState.hidden = false;
  elements.flipButton.disabled = true;
  elements.rotateButton.disabled = !state.detector;
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

function rotateDetection() {
  state.rotation = (state.rotation + 90) % 360;
  localStorage.setItem("detectionRotation", String(state.rotation));
  elements.rotateButton.textContent = \`\${state.rotation}°\`;
  state.countHistory = [];
  state.lastVideoTime = -1;
}

async function createDetector(vision, delegate) {
  return ObjectDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_PATH,
      delegate,
    },
    runningMode: "VIDEO",
    scoreThreshold: 0.2,
    maxResults: 50,
    categoryAllowlist: ["person"],
  });
}

async function loadModel() {
  try {
    elements.modelStatus.textContent = "Loading fast mobile person detector...";
    const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);

    try {
      state.detector = await createDetector(vision, "GPU");
      elements.modelStatus.textContent = "GPU detector ready";
    } catch (gpuError) {
      console.warn("GPU detector unavailable; using CPU.", gpuError);
      elements.modelStatus.textContent = "Loading compatible detector...";
      state.detector = await createDetector(vision, "CPU");
    }

    elements.modelLoading.hidden = true;
    elements.startButton.disabled = false;
    elements.rotateButton.disabled = false;
  } catch (error) {
    console.error(error);
    elements.modelStatus.textContent = "Detector could not load";
    showError("The detection model could not download. Check the internet connection and reload the page.");
  }
}

elements.rotateButton.textContent = \`\${state.rotation}°\`;
elements.startButton.addEventListener("click", () => {
  if (state.running) stopCamera();
  else startCamera();
});
elements.flipButton.addEventListener("click", flipCamera);
elements.rotateButton.addEventListener("click", rotateDetection);
elements.camera.addEventListener("loadedmetadata", syncCanvas);
elements.camera.addEventListener("resize", syncCanvas);
elements.capacityInput.addEventListener("input", () => {
  elements.capacityOutput.textContent = \`\${elements.capacityInput.value} people\`;
  updateCapacity(Number(elements.countValue.textContent));
});
elements.confidenceInput.addEventListener("input", () => {
  elements.confidenceOutput.textContent = \`\${elements.confidenceInput.value}%\`;
});

window.addEventListener("resize", syncCanvas);
window.addEventListener("orientationchange", () => window.setTimeout(syncCanvas, 150));
screen.orientation?.addEventListener("change", () => window.setTimeout(syncCanvas, 150));

document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && state.running && !state.wakeLock) {
    await requestWakeLock();
  }
});

window.addEventListener("beforeunload", stopCamera);
loadModel();
