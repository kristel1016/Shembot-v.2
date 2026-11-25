import {
  FilesetResolver,
  ObjectDetector,
  PoseLandmarker,
} from "../../lib/mediapipe/vision_bundle.js";
import {
  areAlignedBodyPartDetections,
  areOppositeSplitPairMembers,
  haveDistinctPoseIdentities,
  isWideEnoughForSplit,
  looksLikeSamePersonAcrossScales,
  matchesCropFragment,
  selectDistinctSplitPair,
  touchesInteriorCropEdge,
} from "./detection_geometry.js?v=20261125-ops8";

const MEDIAPIPE_WASM = new URL(
  "../../lib/mediapipe/wasm",
  import.meta.url,
).href;
const MODEL_PATH = new URL(
  "../../lib/mediapipe/models/efficientdet_lite0.tflite",
  import.meta.url,
).href;
const FALLBACK_MODEL_PATH = new URL(
  "../../lib/mediapipe/models/efficientdet_lite0_generic.tflite",
  import.meta.url,
).href;
const POSE_MODEL_PATH = new URL(
  "../../lib/mediapipe/models/pose_landmarker_lite.task",
  import.meta.url,
).href;
const MAX_INFERENCE_DIMENSION = 768;
const TRACK_HOLD_MS = 3200;
const DISPLAY_TRACK_HOLD_MS = 850;
const STABLE_DISPLAY_TRACK_HOLD_MS = 2800;
const RECALIBRATE_AFTER_MS = 30000;
const MAX_CONFIRMED_MISSED_CYCLES = 28;
const MAX_VISIBLE_MISSED_CYCLES = 1;
const STABLE_MAX_VISIBLE_MISSED_CYCLES = 24;
const POSE_ASSISTED_SCORE_FLOOR = 0.18;
const DETECTOR_ONLY_SCORE_FLOOR = 0.50;
const DETECTOR_ONLY_FAST_SCORE = 0.64;
const DETECTOR_ONLY_INSTANT_SCORE = 0.78;
const MOTION_REACQUIRE_SCORE_FLOOR = 0.28;
const IMAGE_PROPOSAL_SCORE_FLOOR = 0.15;
const IMAGE_DETECTOR_SCORE_FLOOR = 0.34;
const IMAGE_DETAIL_SCORE_FLOOR = 0.28;
const IMAGE_UNSUPPORTED_SCORE_FLOOR = 0.42;
const FULL_FRAME_SCORE_FLOOR = 0.3;
const POSE_VERIFICATION_INTERVAL_MS = 420;
const POSE_CACHE_MS = 650;
const MAX_POSES = 30;
const ORIENTATION_SAMPLES = 2;
const QUALITY_CHECK_INTERVAL_MS = 1200;
const HISTORY_LIMIT = 1200;
const SESSION_SAMPLE_INTERVAL_MS = 1000;
const SESSION_POINT_LIMIT = 600;
const MIN_POSE_LANDMARK_CONFIDENCE = 0.4;
const MIN_CAMERA_DIMENSION = 16;

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
  recordButton: document.querySelector("#recordButton"),
  recordingIndicator: document.querySelector("#recordingIndicator"),
  recordingElapsed: document.querySelector("#recordingElapsed"),
  flipButton: document.querySelector("#flipButton"),
  sidebarFlipButton: document.querySelector("#sidebarFlipButton"),
  setAreaButton: document.querySelector("#setAreaButton"),
  clearAreaButton: document.querySelector("#clearAreaButton"),
  openImageAnalysisButton: document.querySelector("#openImageAnalysisButton"),
  imageAnalysisDialog: document.querySelector("#imageAnalysisDialog"),
  closeImageAnalysisButton: document.querySelector("#closeImageAnalysisButton"),
  imageFileInput: document.querySelector("#imageFileInput"),
  chooseImageButton: document.querySelector("#chooseImageButton"),
  chooseAnotherImageButton: document.querySelector("#chooseAnotherImageButton"),
  downloadImageResultButton: document.querySelector("#downloadImageResultButton"),
  imageUploadPanel: document.querySelector("#imageUploadPanel"),
  imageAnalysisProgress: document.querySelector("#imageAnalysisProgress"),
  imageAnalysisError: document.querySelector("#imageAnalysisError"),
  imageAnalysisResult: document.querySelector("#imageAnalysisResult"),
  imageResultCanvas: document.querySelector("#imageResultCanvas"),
  imagePeopleCount: document.querySelector("#imagePeopleCount"),
  imageCapacityStatus: document.querySelector("#imageCapacityStatus"),
  imageProcessingTime: document.querySelector("#imageProcessingTime"),
  imageDetectionDetails: document.querySelector("#imageDetectionDetails"),
  imageResultGuidance: document.querySelector("#imageResultGuidance"),
  imageRecommendationTitle: document.querySelector("#imageRecommendationTitle"),
  imageRecommendationMessage: document.querySelector("#imageRecommendationMessage"),
  areaStatus: document.querySelector("#areaStatus"),
  zoneSelection: document.querySelector("#zoneSelection"),
  zoneDraft: document.querySelector("#zoneDraft"),
  countValue: document.querySelector("#countValue"),
  capacityMetric: document.querySelector("#capacityMetric"),
  capacityStatus: document.querySelector("#capacityStatus"),
  capacityAlert: document.querySelector("#capacityAlert"),
  capacityAlertMessage: document.querySelector("#capacityAlertMessage"),
  fpsValue: document.querySelector("#fpsValue"),
  capacityInput: document.querySelector("#capacityInput"),
  capacityOutput: document.querySelector("#capacityOutput"),
  alertSoundToggle: document.querySelector("#alertSoundToggle"),
  detectionOverlayToggle: document.querySelector("#detectionOverlayToggle"),
  qualityAssistant: document.querySelector("#qualityAssistant"),
  qualityStatus: document.querySelector("#qualityStatus"),
  qualityMessage: document.querySelector("#qualityMessage"),
  poseStatusTag: document.querySelector("#poseStatusTag"),
  pipelineRaw: document.querySelector("#pipelineRaw"),
  pipelinePlausible: document.querySelector("#pipelinePlausible"),
  pipelinePose: document.querySelector("#pipelinePose"),
  pipelineCandidates: document.querySelector("#pipelineCandidates"),
  pipelineTracked: document.querySelector("#pipelineTracked"),
  actualCountInput: document.querySelector("#actualCountInput"),
  correctFeedbackButton: document.querySelector("#correctFeedbackButton"),
  issueFeedbackButton: document.querySelector("#issueFeedbackButton"),
  feedbackStatus: document.querySelector("#feedbackStatus"),
  flowToggle: document.querySelector("#flowToggle"),
  flowLineInput: document.querySelector("#flowLineInput"),
  flowLineOutput: document.querySelector("#flowLineOutput"),
  flowDirectionButton: document.querySelector("#flowDirectionButton"),
  resetFlowButton: document.querySelector("#resetFlowButton"),
  enteredValue: document.querySelector("#enteredValue"),
  exitedValue: document.querySelector("#exitedValue"),
  historyCount: document.querySelector("#historyCount"),
  downloadHistoryButton: document.querySelector("#downloadHistoryButton"),
  clearHistoryButton: document.querySelector("#clearHistoryButton"),
  occupancyChart: document.querySelector("#occupancyChart"),
  chartEmptyState: document.querySelector("#chartEmptyState"),
  sessionStateLabel: document.querySelector("#sessionStateLabel"),
  sessionCurrentStatus: document.querySelector("#sessionCurrentStatus"),
  sessionElapsed: document.querySelector("#sessionElapsed"),
  sessionMax: document.querySelector("#sessionMax"),
  sessionAverage: document.querySelector("#sessionAverage"),
  sessionAlerts: document.querySelector("#sessionAlerts"),
  downloadSessionButton: document.querySelector("#downloadSessionButton"),
  errorMessage: document.querySelector("#errorMessage"),
  appStatus: document.querySelector("#appStatus"),
  appStatusLabel: document.querySelector("#appStatusLabel"),
};

const inferenceCanvas = document.createElement("canvas");
const inferenceContext = inferenceCanvas.getContext("2d", {
  alpha: false,
  desynchronized: true,
});
const qualityCanvas = document.createElement("canvas");
const qualityContext = qualityCanvas.getContext("2d", {
  alpha: false,
  willReadFrequently: true,
});
const recordingCanvas = document.createElement("canvas");
const recordingContext = recordingCanvas.getContext("2d", { alpha: false });
const imageSourceCanvas = document.createElement("canvas");
const imageSourceContext = imageSourceCanvas.getContext("2d", { alpha: false });
const imageScanCanvas = document.createElement("canvas");
const imageScanContext = imageScanCanvas.getContext("2d", { alpha: false });

function loadSavedArea() {
  try {
    const value = JSON.parse(localStorage.getItem("detectionArea"));
    if (
      value &&
      value.x >= 0 &&
      value.y >= 0 &&
      value.width > 0.08 &&
      value.height > 0.08 &&
      value.x + value.width <= 1.001 &&
      value.y + value.height <= 1.001
    ) {
      return value;
    }
  } catch {
    // Ignore an invalid saved area.
  }
  return null;
}

function loadStoredJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function compactStoredHistory(records) {
  if (!Array.isArray(records)) return [];
  const compacted = [];
  let lastOccupancyCount = null;
  for (const record of records) {
    if (!record || typeof record !== "object") continue;
    if (record.event === "occupancy") {
      const count = Number(record.count) || 0;
      if (count === lastOccupancyCount) continue;
      lastOccupancyCount = count;
    }
    compacted.push(record);
  }
  return compacted.slice(-HISTORY_LIMIT);
}

const savedFlowCounts = loadStoredJson("flowCounts", {
  entered: 0,
  exited: 0,
});
const savedHistory = compactStoredHistory(
  loadStoredJson("crowdCountHistory", []),
);
const lastSavedOccupancy = [...savedHistory]
  .reverse()
  .find((record) => record.event === "occupancy");

function createEmptySession() {
  return {
    startedAt: null,
    endedAt: null,
    samples: [],
    maxCount: 0,
    totalCount: 0,
    sampleCount: 0,
    alertEvents: 0,
    overcapacityStartedAt: null,
    overcapacityDurationMs: 0,
    lastSampleAt: 0,
    lastSampleCount: null,
    lastSampleStatus: null,
  };
}

const state = {
  detector: null,
  imageDetector: null,
  imageDetectorPromise: null,
  imageAnalysisFilename: "shembot-image-result",
  imageAnalysisDetections: [],
  vision: null,
  detectorModelName: "custom",
  detectorRecoveryPromise: null,
  poseLandmarker: null,
  stream: null,
  running: false,
  consecutiveDetectionErrors: 0,
  detectionRecovering: false,
  facingMode: "environment",
  mirrored: false,
  loopToken: 0,
  fpsHistory: [],
  countHistory: [],
  lastVideoTime: -1,
  rotation: Number(localStorage.getItem("automaticDetectionRotation")) || 0,
  calibration: null,
  lastCalibrationAt: 0,
  scanIndex: 0,
  tileIndex: 0,
  scanDetections: [],
  lastPoseVerificationAt: -Infinity,
  lastPoseDetections: [],
  tracks: [],
  lastConfirmedTracks: [],
  area: loadSavedArea(),
  selectingArea: false,
  dragStart: null,
  draftArea: null,
  wakeLock: null,
  alertSoundEnabled: localStorage.getItem("alertSoundEnabled") !== "false",
  alertAudioContext: null,
  recording: null,
  recordingSupported:
    typeof window.MediaRecorder !== "undefined" &&
    typeof recordingCanvas.captureStream === "function",
  currentCapacityStatus: "safe",
  session: createEmptySession(),
  lastQualityAt: -Infinity,
  quality: { code: "waiting", label: "Waiting for camera" },
  flowEnabled: localStorage.getItem("flowEnabled") === "true",
  flowLinePosition: clampStoredNumber(
    localStorage.getItem("verticalFlowLinePosition"),
    0.05,
    0.95,
    0.15,
  ),
  rightIsEntry: localStorage.getItem("rightIsEntry") !== "false",
  entered: Number(savedFlowCounts.entered) || 0,
  exited: Number(savedFlowCounts.exited) || 0,
  flowTracks: new Map(),
  history: savedHistory,
  lastLoggedCount: lastSavedOccupancy
    ? Number(lastSavedOccupancy.count) || 0
    : null,
  pipelineStats: {
    raw: 0,
    plausible: 0,
    poseMatched: 0,
    candidates: 0,
    tracked: 0,
  },
};

function clampStoredNumber(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(maximum, Math.max(minimum, number))
    : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function showError(message) {
  elements.errorMessage.textContent = message;
  elements.errorMessage.hidden = false;
}

function clearError() {
  elements.errorMessage.hidden = true;
  elements.errorMessage.textContent = "";
}

function updatePipelineDiagnostics(next = {}) {
  Object.assign(state.pipelineStats, next);
  elements.pipelineRaw.textContent = String(state.pipelineStats.raw);
  elements.pipelinePlausible.textContent = String(state.pipelineStats.plausible);
  elements.pipelinePose.textContent = String(state.pipelineStats.poseMatched);
  elements.pipelineCandidates.textContent = String(state.pipelineStats.candidates);
  elements.pipelineTracked.textContent = String(state.pipelineStats.tracked);
}

function updateAppStatus(label, tone) {
  elements.appStatusLabel.textContent = label;
  elements.appStatus.dataset.tone = tone;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function average(values) {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : 0;
}

function getCapacityStatus(count, limit) {
  if (count >= limit) return "over";
  if (count / Math.max(1, limit) >= 0.8) return "near";
  return "safe";
}

function prepareAlertAudio() {
  if (!state.alertSoundEnabled) return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!state.alertAudioContext) {
    state.alertAudioContext = new AudioContextClass();
  }
  if (state.alertAudioContext.state === "suspended") {
    state.alertAudioContext.resume().catch(() => {});
  }
  return state.alertAudioContext;
}

function playCapacityAlarm() {
  const audioContext = prepareAlertAudio();
  if (!audioContext || audioContext.state === "closed") return;
  const start = audioContext.currentTime + 0.02;
  [0, 0.22, 0.44].forEach((offset) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, start + offset);
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(0.16, start + offset + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.13);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(start + offset);
    oscillator.stop(start + offset + 0.15);
  });
}

function formatDuration(durationMs) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":")
    : [minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function sessionEndTime() {
  return state.session.endedAt || Date.now();
}

function sessionDurationMs() {
  return state.session.startedAt
    ? sessionEndTime() - state.session.startedAt
    : 0;
}

function overcapacityDurationMs() {
  const activeDuration = state.session.overcapacityStartedAt
    ? sessionEndTime() - state.session.overcapacityStartedAt
    : 0;
  return state.session.overcapacityDurationMs + activeDuration;
}

function drawOccupancyChart() {
  const canvas = elements.occupancyChart;
  const samples = state.session.samples;
  const width = Math.max(280, canvas.clientWidth || 320);
  const height = Math.max(120, canvas.clientHeight || 132);
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  const context = canvas.getContext("2d");
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);

  elements.chartEmptyState.hidden = samples.length > 0;
  if (samples.length === 0) {
    canvas.setAttribute("aria-label", "No occupancy data yet");
    return;
  }

  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue("--accent").trim();
  const danger = styles.getPropertyValue("--danger").trim();
  const muted = styles.getPropertyValue("--muted").trim();
  const latestCapacity = samples.at(-1).capacity;
  const maximum = Math.max(1, latestCapacity, ...samples.map((sample) => sample.count));
  const chartMaximum = Math.max(2, Math.ceil(maximum * 1.15));
  const padding = { top: 14, right: 12, bottom: 24, left: 28 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const firstTime = samples[0].timestamp;
  const lastTime = samples.at(-1).timestamp;
  const timeSpan = Math.max(1, lastTime - firstTime);
  const xFor = (sample, index) => samples.length === 1
    ? padding.left + plotWidth
    : padding.left + ((sample.timestamp - firstTime) / timeSpan) * plotWidth;
  const yFor = (count) => padding.top + plotHeight - (count / chartMaximum) * plotHeight;

  context.strokeStyle = "rgba(64, 87, 132, 0.12)";
  context.lineWidth = 1;
  for (let line = 0; line <= 2; line += 1) {
    const y = padding.top + (plotHeight * line) / 2;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
  }

  const capacityY = yFor(latestCapacity);
  context.save();
  context.setLineDash([5, 4]);
  context.strokeStyle = danger;
  context.beginPath();
  context.moveTo(padding.left, capacityY);
  context.lineTo(width - padding.right, capacityY);
  context.stroke();
  context.restore();

  const gradient = context.createLinearGradient(0, padding.top, 0, height - padding.bottom);
  gradient.addColorStop(0, "rgba(91, 127, 212, 0.32)");
  gradient.addColorStop(1, "rgba(91, 127, 212, 0.03)");
  context.beginPath();
  samples.forEach((sample, index) => {
    const x = xFor(sample, index);
    const y = yFor(sample.count);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.lineTo(xFor(samples.at(-1), samples.length - 1), height - padding.bottom);
  context.lineTo(xFor(samples[0], 0), height - padding.bottom);
  context.closePath();
  context.fillStyle = gradient;
  context.fill();

  context.beginPath();
  samples.forEach((sample, index) => {
    const x = xFor(sample, index);
    const y = yFor(sample.count);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.strokeStyle = accent;
  context.lineWidth = 2.5;
  context.lineJoin = "round";
  context.stroke();

  context.fillStyle = muted;
  context.font = "600 10px Inter, system-ui, sans-serif";
  context.textAlign = "right";
  context.fillText(String(chartMaximum), padding.left - 5, padding.top + 4);
  context.fillText("0", padding.left - 5, height - padding.bottom + 4);
  context.textAlign = "left";
  context.fillStyle = danger;
  context.fillText(`Limit ${latestCapacity}`, padding.left + 5, Math.max(11, capacityY - 4));
  context.fillStyle = muted;
  context.fillText("Start", padding.left, height - 7);
  context.textAlign = "right";
  context.fillText(formatDuration(lastTime - firstTime), width - padding.right, height - 7);

  canvas.setAttribute(
    "aria-label",
    `Occupancy graph with ${samples.length} samples. Maximum ${state.session.maxCount}; current ${samples.at(-1).count}.`,
  );
}

function updateSessionUi() {
  const session = state.session;
  const averageCount = session.sampleCount
    ? session.totalCount / session.sampleCount
    : 0;
  elements.sessionStateLabel.textContent = !session.startedAt
    ? "Start the camera to begin a session"
    : session.endedAt
      ? "Session ended — report ready"
      : "Recording on this device";
  elements.sessionElapsed.textContent = formatDuration(sessionDurationMs());
  elements.sessionMax.textContent = String(session.maxCount);
  elements.sessionAverage.textContent = averageCount.toFixed(1);
  elements.sessionAlerts.textContent = String(session.alertEvents);
  elements.downloadSessionButton.disabled = session.samples.length === 0;
  drawOccupancyChart();
}

function startSession() {
  state.session = createEmptySession();
  state.session.startedAt = Date.now();
  state.currentCapacityStatus = "safe";
  updateSessionUi();
}

function finishSession() {
  const session = state.session;
  if (!session.startedAt || session.endedAt) return;
  session.endedAt = Date.now();
  if (session.overcapacityStartedAt) {
    session.overcapacityDurationMs += session.endedAt - session.overcapacityStartedAt;
    session.overcapacityStartedAt = null;
  }
  recordHistory("session-end", {
    capacity: Number(elements.capacityInput.value),
    status: state.currentCapacityStatus,
  });
  updateSessionUi();
}

function recordSessionSample(count, status, force = false) {
  const session = state.session;
  if (!state.running || !session.startedAt || session.endedAt) return;
  const now = Date.now();
  const hasChanged = count !== session.lastSampleCount || status !== session.lastSampleStatus;
  if (!force && !hasChanged && now - session.lastSampleAt < SESSION_SAMPLE_INTERVAL_MS) return;
  const sample = {
    timestamp: now,
    count,
    capacity: Number(elements.capacityInput.value),
    status,
    entered: state.entered,
    exited: state.exited,
    fps: Number(elements.fpsValue.textContent) || 0,
  };
  session.samples.push(sample);
  if (session.samples.length > SESSION_POINT_LIMIT) session.samples.shift();
  session.maxCount = Math.max(session.maxCount, count);
  session.totalCount += count;
  session.sampleCount += 1;
  session.lastSampleAt = now;
  session.lastSampleCount = count;
  session.lastSampleStatus = status;
  updateSessionUi();
}

function updateCapacity(count) {
  const limit = Number(elements.capacityInput.value);
  const previousStatus = state.currentCapacityStatus;
  const status = getCapacityStatus(count, limit);
  const isAlert = status === "over";
  elements.countValue.textContent = String(count);
  elements.capacityStatus.textContent = status === "over"
    ? "OVER CAPACITY"
    : status === "near"
      ? "NEAR CAPACITY"
      : "SAFE";
  elements.sessionCurrentStatus.textContent = elements.capacityStatus.textContent;
  elements.sessionCurrentStatus.dataset.status = status;
  elements.capacityMetric.dataset.status = status;
  elements.cameraCard.classList.toggle("is-alert", isAlert);
  elements.cameraCard.classList.toggle("is-near-capacity", status === "near");
  elements.capacityAlert.hidden = !isAlert;
  elements.capacityAlertMessage.textContent = count > limit
    ? `Room capacity exceeded by ${count - limit} ${count - limit === 1 ? "person" : "people"}.`
    : `Room has reached its limit of ${limit} ${limit === 1 ? "person" : "people"}.`;

  state.currentCapacityStatus = status;
  if (state.running && state.session.startedAt && !state.session.endedAt) {
    const now = Date.now();
    if (status === "over" && previousStatus !== "over") {
      state.session.alertEvents += 1;
      state.session.overcapacityStartedAt = now;
      recordHistory("overcapacity-start", { capacity: limit, status });
      playCapacityAlarm();
    } else if (status !== "over" && previousStatus === "over") {
      if (state.session.overcapacityStartedAt) {
        state.session.overcapacityDurationMs +=
          now - state.session.overcapacityStartedAt;
        state.session.overcapacityStartedAt = null;
      }
      recordHistory("overcapacity-end", { capacity: limit, status });
    }
    recordSessionSample(count, status, status !== previousStatus);
  }
}

function updateAreaControls() {
  elements.areaStatus.textContent = state.area
    ? "Focused area active"
    : "Full frame — set an area for best accuracy";
  elements.clearAreaButton.disabled = !state.running || !state.area;
}

function updateQualityUi(code, label, message) {
  state.quality = { code, label, message };
  elements.qualityAssistant.classList.toggle("is-warning", code === "warning");
  elements.qualityAssistant.classList.toggle("is-waiting", code === "waiting");
  elements.qualityStatus.textContent = label;
  elements.qualityMessage.textContent = message;
}

function saveFlowCounts() {
  localStorage.setItem("flowCounts", JSON.stringify({
    entered: state.entered,
    exited: state.exited,
  }));
}

function updateFlowUi() {
  const flowPercent = Math.round(state.flowLinePosition * 100);
  const rangeMinimum = Number(elements.flowLineInput.min);
  const rangeMaximum = Number(elements.flowLineInput.max);
  const progress = ((flowPercent - rangeMinimum) / (rangeMaximum - rangeMinimum)) * 100;
  elements.flowToggle.checked = state.flowEnabled;
  elements.flowLineInput.value = String(flowPercent);
  elements.flowLineInput.style.setProperty("--range-progress", `${progress}%`);
  elements.flowLineOutput.value = `${flowPercent}%`;
  elements.flowDirectionButton.dataset.direction = state.rightIsEntry
    ? "right"
    : "left";
  elements.flowDirectionButton.textContent = state.rightIsEntry
    ? "Right = entry"
    : "Left = entry";
  elements.enteredValue.textContent = String(state.entered);
  elements.exitedValue.textContent = String(state.exited);
}

function updateHistoryUi() {
  const count = state.history.length;
  elements.historyCount.textContent = `${count} saved ${count === 1 ? "event" : "events"}`;
  elements.downloadHistoryButton.disabled = count === 0;
  elements.clearHistoryButton.disabled = count === 0;
}

function recordHistory(event, details = {}) {
  const record = {
    timestamp: new Date().toISOString(),
    event,
    count: Number(elements.countValue.textContent) || 0,
    entered: state.entered,
    exited: state.exited,
    quality: state.quality.code,
    ...details,
  };
  state.history.push(record);
  if (state.history.length > HISTORY_LIMIT) {
    state.history.splice(0, state.history.length - HISTORY_LIMIT);
  }
  localStorage.setItem("crowdCountHistory", JSON.stringify(state.history));
  updateHistoryUi();
}

function recordCountHistory(count) {
  if (count === state.lastLoggedCount) return;
  state.lastLoggedCount = count;
  recordHistory("occupancy", { count });
}

function csvValue(value) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadBlob(blob, filename) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Mobile browsers may continue reading the object URL after the synthetic
  // click returns. Revoking it immediately can truncate or corrupt the file.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function formatRecordingTimestamp(timestamp) {
  const date = new Date(timestamp);
  const pad = (value) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function recordingFileTimestamp(timestamp) {
  return formatRecordingTimestamp(timestamp)
    .replace(" ", "_")
    .replaceAll(":", "-");
}

function getRecordingFormat() {
  const formats = [
    { mimeType: "video/mp4;codecs=avc1.42E01E", extension: "mp4" },
    { mimeType: "video/mp4;codecs=h264", extension: "mp4" },
    { mimeType: "video/mp4", extension: "mp4" },
    { mimeType: "video/webm;codecs=vp8", extension: "webm" },
    { mimeType: "video/webm;codecs=vp9", extension: "webm" },
    { mimeType: "video/webm", extension: "webm" },
  ];
  return formats.find((format) => MediaRecorder.isTypeSupported(format.mimeType)) || null;
}

function updateRecordingUi() {
  const recording = state.recording;
  const isRecording = Boolean(recording && !recording.stopping);
  elements.recordingIndicator.hidden = !isRecording;
  elements.recordButton.classList.toggle("is-recording", isRecording);
  elements.recordButton.classList.toggle("is-saving", Boolean(recording?.stopping));

  if (!state.recordingSupported) {
    elements.recordButton.disabled = true;
    elements.recordButton.title = "Video recording is not supported by this browser";
    elements.recordButton.innerHTML = "<span aria-hidden=\"true\"></span> Recording unavailable";
    return;
  }
  if (recording?.stopping) {
    elements.recordButton.disabled = true;
    elements.recordButton.innerHTML = "<span aria-hidden=\"true\"></span> Saving video...";
    return;
  }
  if (isRecording) {
    elements.recordButton.disabled = false;
    elements.recordButton.title = "Stop and download the current recording";
    elements.recordButton.innerHTML = "<span aria-hidden=\"true\"></span> Stop recording";
    return;
  }
  elements.recordButton.disabled = !state.running;
  elements.recordButton.title = "Record an annotated video locally";
  elements.recordButton.innerHTML = "<span aria-hidden=\"true\"></span> Record video";
  elements.recordingElapsed.textContent = "00:00";
}

function drawRecordingFrame() {
  const recording = state.recording;
  if (!recording || recording.stopping) return;
  const width = elements.camera.videoWidth;
  const height = elements.camera.videoHeight;
  if (width >= MIN_CAMERA_DIMENSION && height >= MIN_CAMERA_DIMENSION) {
    if (recordingCanvas.width !== width) recordingCanvas.width = width;
    if (recordingCanvas.height !== height) recordingCanvas.height = height;
    const context = recordingContext;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = "#111722";
    context.fillRect(0, 0, width, height);
    context.save();
    if (state.mirrored) {
      context.translate(width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(elements.camera, 0, 0, width, height);
    context.restore();

    if (elements.detectionOverlayToggle.checked && elements.overlay.width) {
      context.drawImage(elements.overlay, 0, 0, width, height);
    }

    const now = Date.now();
    const elapsed = now - recording.startedAt;
    const footerHeight = Math.max(58, Math.round(height * 0.085));
    const horizontalPadding = Math.max(16, Math.round(width * 0.018));
    const mainFontSize = Math.max(17, Math.round(height * 0.029));
    const smallFontSize = Math.max(14, Math.round(height * 0.022));
    context.fillStyle = "rgba(13, 18, 28, 0.82)";
    context.fillRect(0, height - footerHeight, width, footerHeight);
    context.textBaseline = "middle";
    context.font = `700 ${mainFontSize}px Inter, system-ui, sans-serif`;
    context.fillStyle = "#ffffff";
    context.textAlign = "left";
    context.fillText(
      formatRecordingTimestamp(now),
      horizontalPadding,
      height - footerHeight / 2,
    );
    context.textAlign = "right";
    const statusText = elements.capacityStatus.textContent;
    const peopleCount = Number(elements.countValue.textContent) || 0;
    context.fillStyle = state.currentCapacityStatus === "over"
      ? "#ff7187"
      : state.currentCapacityStatus === "near"
        ? "#ffd166"
        : "#64d693";
    context.fillText(
      `People: ${peopleCount}  |  ${statusText}`,
      width - horizontalPadding,
      height - footerHeight / 2,
    );

    context.textAlign = "left";
    context.font = `800 ${smallFontSize}px Inter, system-ui, sans-serif`;
    context.fillStyle = "#ff526d";
    context.fillRect(horizontalPadding, horizontalPadding, smallFontSize * 0.65, smallFontSize * 0.65);
    context.fillText(
      `REC  ${formatDuration(elapsed)}`,
      horizontalPadding + smallFontSize,
      horizontalPadding + smallFontSize * 0.35,
    );
    elements.recordingElapsed.textContent = formatDuration(elapsed);
  }
  recording.animationFrame = requestAnimationFrame(drawRecordingFrame);
}

function finalizeRecording(recording) {
  if (recording.finalized) return;
  recording.finalized = true;
  cancelAnimationFrame(recording.animationFrame);
  recording.canvasStream.getTracks().forEach((track) => track.stop());
  const mimeType = recording.recorder.mimeType ||
    recording.format?.mimeType || "video/webm";
  const extension = recording.format?.extension ||
    (mimeType.includes("mp4") ? "mp4" : "webm");
  const blob = new Blob(recording.chunks, { type: mimeType });
  if (blob.size > 0) {
    downloadBlob(
      blob,
      `shembot-recording-${recordingFileTimestamp(recording.startedAt)}.${extension}`,
    );
  } else {
    showError("The browser did not produce video data. Try recording again in current Chrome, Edge, or Safari.");
  }
  if (state.recording === recording) state.recording = null;
  updateRecordingUi();
}

function startRecording() {
  if (!state.running || state.recording) return;
  if (!state.recordingSupported) {
    showError("Video recording is not supported by this browser. Use current Chrome, Edge, or Safari.");
    return;
  }
  const width = elements.camera.videoWidth;
  const height = elements.camera.videoHeight;
  if (width < MIN_CAMERA_DIMENSION || height < MIN_CAMERA_DIMENSION) {
    showError("Wait for the camera preview before starting a recording.");
    return;
  }

  clearError();
  recordingCanvas.width = width;
  recordingCanvas.height = height;
  const canvasStream = recordingCanvas.captureStream(20);
  const format = getRecordingFormat();
  let recorder;
  try {
    recorder = new MediaRecorder(
      canvasStream,
      format
        ? { mimeType: format.mimeType, videoBitsPerSecond: 3_000_000 }
        : { videoBitsPerSecond: 3_000_000 },
    );
  } catch (error) {
    canvasStream.getTracks().forEach((track) => track.stop());
    showError(`Recording could not start: ${error?.message || "unsupported video format"}.`);
    return;
  }

  const recording = {
    recorder,
    canvasStream,
    format,
    chunks: [],
    startedAt: Date.now(),
    animationFrame: 0,
    stopping: false,
    finalized: false,
  };
  state.recording = recording;
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data?.size) recording.chunks.push(event.data);
  });
  recorder.addEventListener("error", (event) => {
    showError(`Recording error: ${event.error?.message || "the browser stopped recording"}.`);
    if (!recording.stopping) stopRecording();
  });
  recorder.addEventListener("stop", () => finalizeRecording(recording), { once: true });
  try {
    // Safari/iOS produces a properly indexed MP4 when it receives one final
    // data chunk at stop. Timesliced MP4 chunks are not reliably playable in
    // the Photos app, while WebM benefits from periodic chunks.
    if (format?.extension === "mp4") recorder.start();
    else recorder.start(1000);
  } catch (error) {
    state.recording = null;
    canvasStream.getTracks().forEach((track) => track.stop());
    showError(`Recording could not start: ${error?.message || "browser recording error"}.`);
    updateRecordingUi();
    return;
  }
  recordHistory("video-recording-start", {
    recordingStartedAt: new Date(recording.startedAt).toISOString(),
  });
  updateRecordingUi();
  drawRecordingFrame();
}

function stopRecording() {
  const recording = state.recording;
  if (!recording || recording.stopping) return;
  recording.stopping = true;
  cancelAnimationFrame(recording.animationFrame);
  recordHistory("video-recording-end", {
    recordingDurationSeconds: Math.round((Date.now() - recording.startedAt) / 1000),
  });
  updateRecordingUi();
  if (recording.recorder.state === "inactive") finalizeRecording(recording);
  else recording.recorder.stop();
}

function downloadHistoryCsv() {
  if (state.history.length === 0) return;
  const columns = [
    "timestamp",
    "event",
    "count",
    "entered",
    "exited",
    "quality",
    "actualCount",
    "trackId",
    "direction",
  ];
  const rows = state.history.map((record) =>
    columns.map((column) => csvValue(record[column])).join(",")
  );
  const csv = [columns.join(","), ...rows].join("\n");
  downloadBlob(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
    `crowd-history-${new Date().toISOString().slice(0, 10)}.csv`,
  );
}

function downloadSessionReport() {
  const session = state.session;
  if (!session.startedAt || session.samples.length === 0) return;
  const endedAt = sessionEndTime();
  const averageCount = session.sampleCount
    ? session.totalCount / session.sampleCount
    : 0;
  const sessionEvents = state.history.filter((record) => {
    const timestamp = Date.parse(record.timestamp);
    return timestamp >= session.startedAt && timestamp <= endedAt;
  });
  const lines = [
    ["SHEMBOT SESSION REPORT"],
    ["Generated", new Date().toISOString()],
    ["Session start", new Date(session.startedAt).toISOString()],
    ["Session end", new Date(endedAt).toISOString()],
    ["Duration", formatDuration(endedAt - session.startedAt)],
    ["Room capacity", Number(elements.capacityInput.value)],
    ["Maximum occupancy", session.maxCount],
    ["Average occupancy", averageCount.toFixed(2)],
    ["Overcapacity events", session.alertEvents],
    ["Overcapacity duration", formatDuration(overcapacityDurationMs())],
    ["Total entries", state.entered],
    ["Total exits", state.exited],
    ["Detector model", state.detectorModelName],
    ["Privacy", "Camera frames were processed locally and were not included in this report."],
    ["Note", "Box percentages are detection confidence, not system accuracy."],
    [],
    ["OCCUPANCY SAMPLES"],
    ["timestamp", "count", "capacity", "status", "entered", "exited", "fps"],
    ...session.samples.map((sample) => [
      new Date(sample.timestamp).toISOString(),
      sample.count,
      sample.capacity,
      sample.status,
      sample.entered,
      sample.exited,
      sample.fps.toFixed(1),
    ]),
    [],
    ["SESSION EVENTS"],
    ["timestamp", "event", "count", "capacity", "status", "entered", "exited", "quality"],
    ...sessionEvents.map((record) => [
      record.timestamp,
      record.event,
      record.count,
      record.capacity,
      record.status,
      record.entered,
      record.exited,
      record.quality,
    ]),
  ];
  const csv = lines
    .map((row) => row.map((value) => csvValue(value)).join(","))
    .join("\n");
  const fileTimestamp = new Date(session.startedAt)
    .toISOString()
    .replaceAll(":", "-")
    .replace(".000Z", "Z");
  downloadBlob(
    new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
    `shembot-session-${fileTimestamp}.csv`,
  );
}

function setImageAnalysisView(view) {
  elements.imageUploadPanel.hidden = view !== "upload";
  elements.imageAnalysisProgress.hidden = view !== "progress";
  elements.imageAnalysisResult.hidden = view !== "result";
}

function showImageAnalysisError(message) {
  elements.imageAnalysisError.textContent = message;
  elements.imageAnalysisError.hidden = false;
  setImageAnalysisView("upload");
}

function clearImageAnalysisError() {
  elements.imageAnalysisError.textContent = "";
  elements.imageAnalysisError.hidden = true;
}

function openImageAnalysis() {
  clearImageAnalysisError();
  if (!elements.imageAnalysisDialog.open) {
    elements.imageAnalysisDialog.showModal();
  }
}

function chooseImageFile() {
  elements.imageFileInput.value = "";
  elements.imageFileInput.click();
}

async function decodeImageFile(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      return createImageBitmap(file);
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise((resolve, reject) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", () => reject(new Error("The image could not be decoded.")), { once: true });
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function imageScanAreas(width, height) {
  const tileFraction = 0.52;
  const tileWidth = Math.max(1, Math.round(width * tileFraction));
  const tileHeight = Math.max(1, Math.round(height * tileFraction));
  const right = Math.max(0, width - tileWidth);
  const bottom = Math.max(0, height - tileHeight);
  const xPositions = [0, Math.round(right / 2), right];
  const yPositions = [0, Math.round(bottom / 2), bottom];
  const tiles = [];
  yPositions.forEach((y, row) => {
    xPositions.forEach((x, column) => {
      tiles.push({
        x,
        y,
        width: tileWidth,
        height: tileHeight,
        kind: "tile",
        scanId: `tile-${row}-${column}`,
      });
    });
  });
  return [
    { x: 0, y: 0, width, height, kind: "full", scanId: "full" },
    ...tiles,
  ];
}

function detailedCrowdScanAreas(width, height) {
  const tileWidth = Math.max(1, Math.round(width * 0.34));
  const tileHeight = Math.max(1, Math.round(height * 0.42));
  const right = Math.max(0, width - tileWidth);
  const bottom = Math.max(0, height - tileHeight);
  const xPositions = [0, 1 / 3, 2 / 3, 1].map((step) =>
    Math.round(right * step)
  );
  const yPositions = [0, 0.5, 1].map((step) => Math.round(bottom * step));
  return yPositions.flatMap((y, row) =>
    xPositions.map((x, column) => ({
      x,
      y,
      width: tileWidth,
      height: tileHeight,
      kind: "detail",
      scanId: `detail-${row}-${column}`,
    }))
  );
}

function appendImageScanDetections(
  detector,
  areas,
  imageWidth,
  imageHeight,
  candidates,
) {
  for (const area of areas) {
    imageScanCanvas.width = area.width;
    imageScanCanvas.height = area.height;
    imageScanContext.drawImage(
      imageSourceCanvas,
      area.x,
      area.y,
      area.width,
      area.height,
      0,
      0,
      area.width,
      area.height,
    );
    const frame = imageFrame(area.width, area.height);
    const result = detector.detect(imageScanCanvas);
    for (const detection of result.detections || []) {
      if (!isPlausiblePerson(detection, frame, IMAGE_PROPOSAL_SCORE_FLOOR)) continue;
      const category = getCategory(detection);
      const box = detection.boundingBox;
      const localBox = [box.originX, box.originY, box.width, box.height];
      candidates.push({
        bbox: [
          area.x + box.originX,
          area.y + box.originY,
          box.width,
          box.height,
        ],
        score: category.score,
        fromFullScan: area.kind === "full",
        fromDetailedScan: area.kind === "detail",
        scanId: area.scanId,
        clippedByImageTile: touchesInteriorCropEdge(localBox, area, imageWidth, imageHeight),
        relativeScanArea: (box.width * box.height) /
          Math.max(1, imageWidth * imageHeight),
        edgeCropped: false,
      });
    }
  }
}

function needsDetailedCrowdScan(candidates, width, height) {
  const accepted = candidates.filter((candidate) =>
    candidate.score >= IMAGE_DETAIL_SCORE_FLOOR
  );
  const frameArea = Math.max(1, width * height);
  const smallPeople = accepted.filter((candidate) =>
    boxArea(candidate.bbox) / frameArea <= 0.018
  ).length;
  return accepted.length >= 10 || smallPeople >= 5;
}

function mergedPairScanParents(candidates, width, height) {
  const frameArea = Math.max(1, width * height);
  const plausible = candidates
    .filter((candidate) => {
      const [x, y, boxWidth, boxHeight] = candidate.bbox;
      const aspectWidth = boxWidth / Math.max(1, boxHeight);
      const areaRatio = boxArea(candidate.bbox) / frameArea;
      return (
        candidate.score >= IMAGE_DETECTOR_SCORE_FLOOR &&
        !candidate.clippedByImageTile &&
        isWideEnoughForSplit(candidate.bbox) &&
        aspectWidth <= 1.3 &&
        areaRatio >= 0.012 &&
        areaRatio <= 0.34 &&
        boxHeight >= height * 0.16 &&
        x + boxWidth > 0 &&
        y + boxHeight > 0
      );
    })
    .sort((first, second) => boxArea(second.bbox) - boxArea(first.bbox));
  const unique = [];
  for (const candidate of plausible) {
    if (!unique.some((kept) => boxesAreDuplicate(kept.bbox, candidate.bbox))) {
      unique.push(candidate);
    }
    if (unique.length >= 5) break;
  }
  return unique;
}

function refineMergedImageCandidates(detector, candidates, width, height) {
  const additions = [];
  const recoveredPairs = [];
  const parents = mergedPairScanParents(candidates, width, height);

  parents.forEach((parent, parentIndex) => {
    const [parentX, parentY, parentWidth, parentHeight] = parent.bbox;
    const paddingX = parentWidth * 0.08;
    const paddingY = parentHeight * 0.06;
    const cropLeft = clamp(parentX - paddingX, 0, width);
    const cropTop = clamp(parentY - paddingY, 0, height);
    const cropRight = clamp(parentX + parentWidth + paddingX, 0, width);
    const cropBottom = clamp(parentY + parentHeight + paddingY, 0, height);
    const cropWidth = Math.max(1, cropRight - cropLeft);
    const cropHeight = Math.max(1, cropBottom - cropTop);
    const outputHeight = Math.max(1, Math.round(cropHeight));
    // The wider pass preserves context. The strict half-width pass prevents
    // two touching people from being presented to the model as one person.
    // Keeping both passes is important: a strict crop can cut an arm, while a
    // wide crop alone can repeatedly return the original merged pair.
    const scans = [0.62, 0.5].flatMap((widthFraction) => {
      const scanWidth = Math.max(1, Math.round(cropWidth * widthFraction));
      return [
        { side: "left", x: cropLeft, width: scanWidth },
        { side: "right", x: cropRight - scanWidth, width: scanWidth },
      ];
    });
    const recovered = [];

    scans.forEach((scan) => {
      imageScanCanvas.width = scan.width;
      imageScanCanvas.height = outputHeight;
      imageScanContext.drawImage(
        imageSourceCanvas,
        scan.x,
        cropTop,
        scan.width,
        cropHeight,
        0,
        0,
        scan.width,
        outputHeight,
      );
      const scanFrame = imageFrame(scan.width, outputHeight);
      const result = detector.detect(imageScanCanvas);
      for (const detection of result.detections || []) {
        if (!isPlausiblePerson(detection, scanFrame, 0.20)) continue;
        const category = getCategory(detection);
        const box = detection.boundingBox;
        recovered.push({
          bbox: [
            scan.x + box.originX,
            cropTop + box.originY,
            box.width,
            box.height,
          ],
          score: category.score,
          splitSide: scan.side,
          scanWidth: scan.width,
        });
      }
    });

    // Require evidence from two different scan windows for each person.
    // The wide parent is too broad to corroborate an individual member.
    const independentlySeen = new Set(recovered.filter((member) =>
      candidates.some((candidate) =>
        !candidate.clippedByImageTile &&
        candidate.bbox[2] <= parentWidth * 0.72 &&
        candidate.bbox[3] >= member.bbox[3] * 0.42 &&
        matchesCropFragment(candidate, member)
      )
    ));
    const supported = recovered.filter((member) =>
      independentlySeen.has(member) || recovered.some((other) =>
        other.splitSide === member.splitSide &&
        other.scanWidth !== member.scanWidth &&
        other.bbox[3] >= member.bbox[3] * 0.75 &&
        matchesCropFragment(other, member)
      )
    );
    const pair = selectDistinctSplitPair(parent, supported);
    if (pair.length !== 2 || !pair.some((member) => independentlySeen.has(member))) return;
    recoveredPairs.push(pair);
    const splitPairId = `merged-pair-${parentIndex}`;
    pair.forEach((person) => additions.push({
      ...person,
      splitPairId,
      fromFullScan: false,
      scanId: `${splitPairId}-${person.splitSide}`,
      relativeScanArea: boxArea(person.bbox) / Math.max(1, width * height),
      edgeCropped: false,
      recoveredFromMergedBox: true,
    }));
  });

  const unmergedCandidates = candidates.filter((candidate) =>
    !recoveredPairs.some((pair) => {
      const containsBothCenters = pair.every((member) =>
        centerIsInside(member.bbox, candidate.bbox)
      );
      const widestPerson = Math.max(
        ...pair.map((member) => member.bbox[2]),
      );
      return (
        containsBothCenters &&
        candidate.bbox[2] >= widestPerson * 1.35
      );
    })
  );
  return [...unmergedCandidates, ...additions];
}

async function getImageDetector() {
  if (state.imageDetector) return state.imageDetector;
  if (state.imageDetectorPromise) return state.imageDetectorPromise;
  if (!state.vision) throw new Error("The person detector is still loading.");

  state.imageDetectorPromise = (async () => {
    // Uploaded photos can contain distant, public-scene people unlike the
    // close phone-camera domain. Use the broader COCO model for this mode.
    return createImageDetector(state.vision, "CPU", FALLBACK_MODEL_PATH);
  })();

  try {
    state.imageDetector = await state.imageDetectorPromise;
    return state.imageDetector;
  } finally {
    state.imageDetectorPromise = null;
  }
}

function imageFrame(width, height) {
  return {
    sourceWidth: width,
    sourceHeight: height,
    crop: { x: 0, y: 0, width, height },
    rotatedWidth: width,
    rotatedHeight: height,
    width,
    height,
    rotation: 0,
  };
}

function renderAnalyzedImage(detections, processingMs) {
  const width = imageSourceCanvas.width;
  const height = imageSourceCanvas.height;
  const canvas = elements.imageResultCanvas;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(imageSourceCanvas, 0, 0);
  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue("--accent").trim() || "#5b7fd4";
  const capacity = Number(elements.capacityInput.value);
  const status = getCapacityStatus(detections.length, capacity);
  const statusLabel = status === "over"
    ? "OVER CAPACITY"
    : status === "near"
      ? "NEAR CAPACITY"
      : "SAFE";
  const lineWidth = Math.max(3, Math.round(Math.min(width, height) / 260));
  const denseImage = detections.length >= 8;
  const fontSize = Math.max(
    denseImage ? 13 : 16,
    Math.round(Math.min(width, height) / (denseImage ? 40 : 30)),
  );
  context.lineWidth = lineWidth;
  context.font = `800 ${fontSize}px Inter, system-ui, sans-serif`;
  context.textBaseline = "top";

  detections.forEach((detection, index) => {
    const [x, y, boxWidth, boxHeight] = detection.bbox;
    const label = denseImage
      ? `P${index + 1}`
      : `P${index + 1} ${Math.round(detection.score * 100)}%`;
    context.strokeStyle = accent;
    context.strokeRect(x, y, boxWidth, boxHeight);
    const textWidth = context.measureText(label).width;
    const labelHeight = fontSize + 10;
    const labelY = denseImage
      ? Math.max(0, y + lineWidth)
      : Math.max(0, y - labelHeight);
    context.fillStyle = accent;
    context.fillRect(x, labelY, textWidth + 14, labelHeight);
    context.fillStyle = "#07111f";
    context.fillText(label, x + 7, labelY + 4);
  });

  const bannerHeight = Math.max(50, Math.round(height * 0.075));
  const bannerFont = Math.max(18, Math.round(bannerHeight * 0.42));
  context.fillStyle = "rgba(13, 18, 28, 0.86)";
  context.fillRect(0, 0, width, bannerHeight);
  context.font = `800 ${bannerFont}px Inter, system-ui, sans-serif`;
  context.textBaseline = "middle";
  context.textAlign = "left";
  context.fillStyle = "#ffffff";
  context.fillText(
    `Estimated people: ${detections.length}`,
    Math.max(14, width * 0.018),
    bannerHeight / 2,
  );
  context.textAlign = "right";
  context.fillStyle = status === "over"
    ? "#ff7187"
    : status === "near"
      ? "#ffd166"
      : "#64d693";
  context.fillText(
    statusLabel,
    width - Math.max(14, width * 0.018),
    bannerHeight / 2,
  );

  elements.imagePeopleCount.textContent = String(detections.length);
  elements.imageCapacityStatus.textContent = statusLabel;
  elements.imageCapacityStatus.dataset.status = status;
  elements.imageProcessingTime.textContent = `${Math.round(processingMs)} ms`;
  elements.imageResultGuidance.dataset.status = status;
  if (detections.length === 0) {
    elements.imageRecommendationTitle.textContent =
      "Check the room yourself";
    elements.imageRecommendationMessage.textContent =
      "The photo shows no people. Look for anyone the camera may have missed.";
  } else if (detections.length > capacity) {
    const excess = detections.length - capacity;
    elements.imageRecommendationTitle.textContent =
      "Stop letting people in and check the count";
    elements.imageRecommendationMessage.textContent =
      `If the count is right, ask at least ${excess} ${excess === 1 ? "person" : "people"} to wait in a safe place outside the room. ` +
      "Keep exits clear and count again before letting anyone in.";
  } else if (status === "over") {
    elements.imageRecommendationTitle.textContent = "The room is full";
    elements.imageRecommendationMessage.textContent =
      "Ask people to wait. Count again after someone leaves before letting anyone in.";
  } else {
    const remaining = capacity - detections.length;
    elements.imageRecommendationTitle.textContent = status === "near"
      ? "The room is almost full"
      : "There is still room";
    elements.imageRecommendationMessage.textContent =
      `There is room for about ${remaining} more ${remaining === 1 ? "person" : "people"}. ` +
      (status === "near"
        ? "Check the count before letting more people in."
        : "Count again when more people come in.");
  }

  if (detections.length) {
    const confidenceValues = detections.map((detection) =>
      Math.round(detection.score * 100)
    );
    const averageConfidence = Math.round(average(confidenceValues));
    const minimumConfidence = Math.min(...confidenceValues);
    const maximumConfidence = Math.max(...confidenceValues);
    elements.imageDetectionDetails.textContent =
      `${detections.length} automatic detections accepted \u2022 ` +
      `average confidence ${averageConfidence}% \u2022 ` +
      `range ${minimumConfidence}\u2013${maximumConfidence}%. ` +
      "Confidence is not system accuracy; visually confirm the estimated count.";
  } else {
    elements.imageDetectionDetails.textContent =
      "No confidence summary is available because no person detections were accepted.";
  }
}

async function analyzeImageFile(file) {
  clearImageAnalysisError();
  if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    showImageAnalysisError("Choose a JPG, PNG, or WebP image.");
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    showImageAnalysisError("Choose an image smaller than 20 MB.");
    return;
  }

  state.imageAnalysisDetections = [];
  setImageAnalysisView("progress");
  await new Promise((resolve) => requestAnimationFrame(resolve));
  let image;
  try {
    image = await decodeImageFile(file);
    const sourceWidth = image.width || image.naturalWidth;
    const sourceHeight = image.height || image.naturalHeight;
    if (!sourceWidth || !sourceHeight) throw new Error("The selected image is empty.");
    const scale = Math.min(1, 1600 / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    imageSourceCanvas.width = width;
    imageSourceCanvas.height = height;
    imageSourceContext.fillStyle = "#111722";
    imageSourceContext.fillRect(0, 0, width, height);
    imageSourceContext.drawImage(image, 0, 0, width, height);
    image.close?.();
    image = null;

    const detector = await getImageDetector();
    const startedAt = performance.now();
    const candidates = [];
    appendImageScanDetections(
      detector,
      imageScanAreas(width, height),
      width,
      height,
      candidates,
    );
    if (needsDetailedCrowdScan(candidates, width, height)) {
      appendImageScanDetections(
        detector,
        detailedCrowdScanAreas(width, height),
        width,
        height,
        candidates,
      );
    }

    const refinedCandidates = refineMergedImageCandidates(
      detector,
      candidates,
      width,
      height,
    );
    const fullFrame = imageFrame(width, height);
    let poseDetections = [];
    if (state.poseLandmarker) {
      try {
        const poseResult = state.poseLandmarker.detect(imageSourceCanvas);
        poseDetections = poseResultToDetections(
          poseResult,
          fullFrame,
          { kind: "full" },
        );
      } catch (poseError) {
        console.warn("Pose assistance was skipped for the uploaded image.", poseError);
      }
    }
    const withPoseEvidence = state.poseLandmarker
      ? attachPoseEvidence(refinedCandidates, poseDetections, fullFrame, {
        allowStandalonePoses: true,
        allowRecoverablePoses: true,
      })
      : refinedCandidates.map((candidate) => ({
        ...candidate,
        verifiedByPose: false,
        poseScore: null,
      }));
    const eligible = withPoseEvidence.filter((candidate) => {
      if (candidate.verifiedByPose || candidate.recoveredFromMergedBox) return true;
      if (candidate.score >= IMAGE_UNSUPPORTED_SCORE_FLOOR) return true;
      const scoreFloor = candidate.fromDetailedScan
        ? IMAGE_DETAIL_SCORE_FLOOR
        : IMAGE_DETECTOR_SCORE_FLOOR;
      return candidate.score >= scoreFloor &&
        hasIndependentImageSupport(candidate, withPoseEvidence);
    });
    const complete = eligible.filter((candidate) =>
      !candidate.clippedByImageTile || candidate.verifiedByPose
    );
    const detections = suppressImageBodyPartDuplicates(consolidateDetections(
      eligible.filter((candidate) =>
        !candidate.clippedByImageTile || candidate.verifiedByPose ||
        !complete.some((other) => matchesCropFragment(candidate, other))
      ),
      { uploadedImage: true },
    ));
    const processingMs = performance.now() - startedAt;
    state.imageAnalysisFilename = (file.name.replace(/\.[^.]+$/, "") || "image")
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "image";
    state.imageAnalysisDetections = detections.map((detection) => ({
      ...detection,
      bbox: [...detection.bbox],
    }));
    renderAnalyzedImage(state.imageAnalysisDetections, processingMs);
    recordHistory("image-analysis", {
      count: detections.length,
      imageName: file.name,
      processingMs: Math.round(processingMs),
      status: getCapacityStatus(detections.length, Number(elements.capacityInput.value)),
    });
    setImageAnalysisView("result");
  } catch (error) {
    console.error("Image analysis failed", error);
    showImageAnalysisError(
      `The image could not be analyzed: ${error?.message || "unexpected detector error"}`,
    );
  } finally {
    image?.close?.();
  }
}

function downloadAnalyzedImage() {
  elements.imageResultCanvas.toBlob((blob) => {
    if (!blob) {
      showImageAnalysisError("The annotated result could not be created.");
      return;
    }
    downloadBlob(blob, `${state.imageAnalysisFilename}-shembot-result.png`);
  }, "image/png");
}

function saveFeedback(isCorrect) {
  if (!state.running) return;
  const detectedCount = Number(elements.countValue.textContent) || 0;
  const enteredActualCount = Number(elements.actualCountInput.value);
  const actualCount = isCorrect ? detectedCount : enteredActualCount;

  if (
    !isCorrect &&
    (elements.actualCountInput.value.trim() === "" ||
      !Number.isFinite(actualCount) ||
      actualCount < 0)
  ) {
    elements.feedbackStatus.textContent =
      "Enter the actual number of people before saving an incorrect sample.";
    elements.actualCountInput.focus();
    return;
  }

  elements.actualCountInput.value = String(actualCount);
  recordHistory(isCorrect ? "feedback-correct" : "feedback-incorrect", {
    count: detectedCount,
    actualCount,
  });

  if (isCorrect) {
    elements.feedbackStatus.textContent =
      "Correct count recorded locally. Thank you.";
    return;
  }

  const width = elements.camera.videoWidth;
  const height = elements.camera.videoHeight;
  if (!width || !height) return;
  const captureCanvas = document.createElement("canvas");
  captureCanvas.width = width;
  captureCanvas.height = height;
  const captureContext = captureCanvas.getContext("2d");

  captureContext.save();
  if (state.mirrored) {
    captureContext.translate(width, 0);
    captureContext.scale(-1, 1);
  }
  captureContext.drawImage(elements.camera, 0, 0, width, height);
  captureContext.restore();
  const timestamp = new Date().toISOString();
  const fileTimestamp = timestamp.replaceAll(":", "-");
  const fileStem =
    `crowd-sample-actual-${actualCount}-detected-${detectedCount}-${fileTimestamp}`;
  captureCanvas.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(blob, `${fileStem}.jpg`);
  }, "image/jpeg", 0.92);
  const metadata = {
    schemaVersion: 2,
    timestamp,
    image: `${fileStem}.jpg`,
    width,
    height,
    detectedCount,
    actualCount,
    mirrored: state.mirrored,
    rotation: state.rotation,
    detectionArea: state.area,
    detectorModel: state.detectorModelName,
    pipeline: { ...state.pipelineStats },
    thresholds: {
      poseAssisted: POSE_ASSISTED_SCORE_FLOOR,
      detectorOnly: DETECTOR_ONLY_SCORE_FLOOR,
    },
    detections: state.lastConfirmedTracks.map((track) => ({
      id: track.id,
      bbox: track.bbox.map((value) => Math.round(value * 100) / 100),
      score: Math.round(track.score * 10000) / 10000,
      maxScore: Math.round(track.maxScore * 10000) / 10000,
      hits: track.hits,
      poseHits: track.poseHits,
    })),
  };
  downloadBlob(
    new Blob([JSON.stringify(metadata, null, 2)], {
      type: "application/json;charset=utf-8",
    }),
    `${fileStem}.json`,
  );
  elements.feedbackStatus.textContent =
    "Clean frame and detection metadata downloaded locally.";
}

function resetTracking() {
  state.tracks = [];
  state.lastConfirmedTracks = [];
  state.flowTracks.clear();
  state.countHistory = [];
  state.scanIndex = 0;
  state.tileIndex = 0;
  state.scanDetections = [];
  state.lastPoseVerificationAt = -Infinity;
  state.lastPoseDetections = [];
  updatePipelineDiagnostics({
    raw: 0,
    plausible: 0,
    poseMatched: 0,
    candidates: 0,
    tracked: 0,
  });
  updateCapacity(0);
}

function syncCanvas() {
  const width = elements.camera.videoWidth;
  const height = elements.camera.videoHeight;
  if (!width || !height) return;

  if (elements.overlay.width !== width) elements.overlay.width = width;
  if (elements.overlay.height !== height) elements.overlay.height = height;
  elements.cameraStage.style.aspectRatio = width + " / " + height;
}

function syncCameraMirroring() {
  const track = state.stream?.getVideoTracks?.()[0];
  const settings = track?.getSettings?.() || {};
  const label = (track?.label || "").toLowerCase();
  const looksLikeFrontCamera =
    /front|user|facetime|integrated|webcam/.test(label);
  state.mirrored =
    settings.facingMode === "user" ||
    (!settings.facingMode &&
      (state.facingMode === "user" || looksLikeFrontCamera));
  elements.cameraStage.classList.toggle("is-mirrored", state.mirrored);
}

function getCrop(areaOverride) {
  const sourceWidth = elements.camera.videoWidth;
  const sourceHeight = elements.camera.videoHeight;
  if (
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight) ||
    sourceWidth < MIN_CAMERA_DIMENSION ||
    sourceHeight < MIN_CAMERA_DIMENSION
  ) {
    return null;
  }

  const area = areaOverride || state.area || { x: 0, y: 0, width: 1, height: 1 };
  const normalizedX = clamp(Number(area.x) || 0, 0, 1);
  const normalizedY = clamp(Number(area.y) || 0, 0, 1);
  const normalizedWidth = clamp(Number(area.width) || 1, 0.01, 1);
  const normalizedHeight = clamp(Number(area.height) || 1, 0.01, 1);
  const x = clamp(Math.round(normalizedX * sourceWidth), 0, sourceWidth - 2);
  const y = clamp(Math.round(normalizedY * sourceHeight), 0, sourceHeight - 2);
  const availableWidth = sourceWidth - x;
  const availableHeight = sourceHeight - y;
  const width = clamp(
    Math.round(normalizedWidth * sourceWidth),
    2,
    availableWidth,
  );
  const height = clamp(
    Math.round(normalizedHeight * sourceHeight),
    2,
    availableHeight,
  );
  return {
    x,
    y,
    width,
    height,
  };
}

function getScanAreas() {
  const base = state.area || { x: 0, y: 0, width: 1, height: 1 };
  const tileSize = 0.58;
  const tileOffset = 1 - tileSize;
  const tiles = [
    { x: 0, y: 0 },
    { x: tileOffset, y: 0 },
    { x: 0, y: tileOffset },
    { x: tileOffset, y: tileOffset },
  ].map((tile) => ({
    x: base.x + tile.x * base.width,
    y: base.y + tile.y * base.height,
    width: tileSize * base.width,
    height: tileSize * base.height,
    kind: "tile",
  }));
  // Run the full frame every cycle, then rotate through one zoomed tile.
  // This updates tracks after two inferences instead of waiting for all five.
  const tile = tiles[state.tileIndex % tiles.length];
  return [{ ...base, kind: "full" }, tile];
}

function prepareInferenceFrame(rotation, areaOverride) {
  const sourceWidth = elements.camera.videoWidth;
  const sourceHeight = elements.camera.videoHeight;
  const crop = getCrop(areaOverride);
  if (!crop) return null;
  const turnsSideways = rotation === 90 || rotation === 270;
  const rotatedWidth = turnsSideways ? crop.height : crop.width;
  const rotatedHeight = turnsSideways ? crop.width : crop.height;
  if (rotatedWidth < 2 || rotatedHeight < 2) return null;
  const scale = Math.min(
    1,
    MAX_INFERENCE_DIMENSION / Math.max(rotatedWidth, rotatedHeight),
  );
  const width = Math.max(2, Math.round(rotatedWidth * scale));
  const height = Math.max(2, Math.round(rotatedHeight * scale));

  if (inferenceCanvas.width !== width) inferenceCanvas.width = width;
  if (inferenceCanvas.height !== height) inferenceCanvas.height = height;

  inferenceContext.save();
  inferenceContext.setTransform(1, 0, 0, 1, 0, 0);
  inferenceContext.fillStyle = "#000";
  inferenceContext.fillRect(0, 0, width, height);

  if (rotation === 90) {
    inferenceContext.translate(width, 0);
    inferenceContext.rotate(Math.PI / 2);
    inferenceContext.drawImage(
      elements.camera,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      height,
      width,
    );
  } else if (rotation === 180) {
    inferenceContext.translate(width, height);
    inferenceContext.rotate(Math.PI);
    inferenceContext.drawImage(
      elements.camera,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      width,
      height,
    );
  } else if (rotation === 270) {
    inferenceContext.translate(0, height);
    inferenceContext.rotate(-Math.PI / 2);
    inferenceContext.drawImage(
      elements.camera,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      height,
      width,
    );
  } else {
    inferenceContext.drawImage(
      elements.camera,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      width,
      height,
    );
  }

  inferenceContext.restore();
  return {
    sourceWidth,
    sourceHeight,
    crop,
    rotatedWidth,
    rotatedHeight,
    width,
    height,
    rotation,
  };
}

function analyzeFrameQuality(now) {
  if (now - state.lastQualityAt < QUALITY_CHECK_INTERVAL_MS) return;
  state.lastQualityAt = now;

  try {
    const sourceWidth = inferenceCanvas.width;
    const sourceHeight = inferenceCanvas.height;
    if (!sourceWidth || !sourceHeight) return;
    const width = 96;
    const height = Math.max(48, Math.round(width * sourceHeight / sourceWidth));
    if (qualityCanvas.width !== width) qualityCanvas.width = width;
    if (qualityCanvas.height !== height) qualityCanvas.height = height;
    qualityContext.drawImage(inferenceCanvas, 0, 0, width, height);
    const pixels = qualityContext.getImageData(0, 0, width, height).data;
    const step = Math.max(4, Math.floor(Math.min(width, height) / 48));
    let total = 0;
    let totalSquared = 0;
    let gradient = 0;
    let samples = 0;
    let gradientSamples = 0;

    for (let y = 0; y < height; y += step) {
      let previousLuminance = null;
      for (let x = 0; x < width; x += step) {
        const index = (y * width + x) * 4;
        const luminance =
          pixels[index] * 0.2126 +
          pixels[index + 1] * 0.7152 +
          pixels[index + 2] * 0.0722;
        total += luminance;
        totalSquared += luminance * luminance;
        samples += 1;
        if (previousLuminance != null) {
          gradient += Math.abs(luminance - previousLuminance);
          gradientSamples += 1;
        }
        previousLuminance = luminance;
      }
    }

    const brightness = total / Math.max(1, samples);
    const contrast = Math.sqrt(
      Math.max(0, totalSquared / Math.max(1, samples) - brightness * brightness),
    );
    const sharpness = gradient / Math.max(1, gradientSamples);

    if (brightness < 52) {
      updateQualityUi(
        "warning",
        "Scene is too dark",
        "Add light in front of people or move the camera away from backlighting.",
      );
    } else if (brightness > 218) {
      updateQualityUi(
        "warning",
        "Scene is overexposed",
        "Reduce direct light or point the camera away from bright windows.",
      );
    } else if (contrast < 24) {
      updateQualityUi(
        "warning",
        "Low image contrast",
        "Improve lighting so people stand out from the background.",
      );
    } else if (sharpness < 8) {
      updateQualityUi(
        "warning",
        "Image may be blurry",
        "Clean the lens and keep the phone steady for more reliable boxes.",
      );
    } else {
      updateQualityUi(
        "good",
        "Camera quality looks good",
        "Lighting and detail are suitable for live person detection.",
      );
    }
  } catch (error) {
    console.warn("Camera quality check was skipped.", error);
  }
}

function mapBoxToVideo(box, frame) {
  const rotatedX = box.originX * (frame.rotatedWidth / frame.width);
  const rotatedY = box.originY * (frame.rotatedHeight / frame.height);
  const rotatedBoxWidth = box.width * (frame.rotatedWidth / frame.width);
  const rotatedBoxHeight = box.height * (frame.rotatedHeight / frame.height);
  let x;
  let y;
  let width;
  let height;

  if (frame.rotation === 90) {
    x = rotatedY;
    y = frame.crop.height - (rotatedX + rotatedBoxWidth);
    width = rotatedBoxHeight;
    height = rotatedBoxWidth;
  } else if (frame.rotation === 180) {
    x = frame.crop.width - (rotatedX + rotatedBoxWidth);
    y = frame.crop.height - (rotatedY + rotatedBoxHeight);
    width = rotatedBoxWidth;
    height = rotatedBoxHeight;
  } else if (frame.rotation === 270) {
    x = frame.crop.width - (rotatedY + rotatedBoxHeight);
    y = rotatedX;
    width = rotatedBoxHeight;
    height = rotatedBoxWidth;
  } else {
    x = rotatedX;
    y = rotatedY;
    width = rotatedBoxWidth;
    height = rotatedBoxHeight;
  }

  return [
    x + frame.crop.x,
    y + frame.crop.y,
    width,
    height,
  ];
}

function mapPointToVideo(normalizedX, normalizedY, frame) {
  const rotatedX = normalizedX * frame.rotatedWidth;
  const rotatedY = normalizedY * frame.rotatedHeight;
  let x;
  let y;

  if (frame.rotation === 90) {
    x = rotatedY;
    y = frame.crop.height - rotatedX;
  } else if (frame.rotation === 180) {
    x = frame.crop.width - rotatedX;
    y = frame.crop.height - rotatedY;
  } else if (frame.rotation === 270) {
    x = frame.crop.width - rotatedY;
    y = rotatedX;
  } else {
    x = rotatedX;
    y = rotatedY;
  }

  return [
    clamp(x + frame.crop.x, 0, frame.sourceWidth),
    clamp(y + frame.crop.y, 0, frame.sourceHeight),
  ];
}

function poseResultToDetections(result, frame, scanArea) {
  const poses = result?.landmarks || [];

  return poses.flatMap((landmarks) => {
    const visible = landmarks
      .map((landmark, index) => ({ landmark, index }))
      .filter(({ landmark }) =>
        Number.isFinite(landmark.x) &&
        Number.isFinite(landmark.y) &&
        (landmark.visibility ?? 1) >= MIN_POSE_LANDMARK_CONFIDENCE &&
        (landmark.presence ?? 1) >= MIN_POSE_LANDMARK_CONFIDENCE
      );
    const visibleByIndex = new Map(
      visible.map(({ landmark, index }) => [index, landmark]),
    );
    const shoulders = [visibleByIndex.get(11), visibleByIndex.get(12)]
      .filter(Boolean);
    const hips = [visibleByIndex.get(23), visibleByIndex.get(24)].filter(Boolean);
    const visibleHeadPoints = [0, 1, 2, 3, 4, 5, 6, 7, 8]
      .filter((index) => visibleByIndex.has(index)).length;
    const visibleArmPoints = [13, 14, 15, 16]
      .filter((index) => visibleByIndex.has(index)).length;
    const visibleLegPoints = [25, 26, 27, 28, 29, 30, 31, 32]
      .filter((index) => visibleByIndex.has(index)).length;
    const anatomicalRegions = [
      visibleHeadPoints >= 1,
      shoulders.length >= 1,
      hips.length >= 1,
      visibleArmPoints >= 2,
      visibleLegPoints >= 2,
    ].filter(Boolean).length;
    if (
      visible.length < 7 ||
      shoulders.length === 0 ||
      anatomicalRegions < 3 ||
      (hips.length === 0 && visibleHeadPoints === 0 && visibleArmPoints < 2)
    ) {
      return [];
    }

    if (hips.length > 0) {
      const shoulderY = average(shoulders.map((shoulder) => shoulder.y));
      const hipY = average(hips.map((hip) => hip.y));
      if (hipY - shoulderY < 0.01) return [];
    }

    const points = visible.map(({ landmark }) =>
      mapPointToVideo(landmark.x, landmark.y, frame)
    );
    let left = Math.min(...points.map(([x]) => x));
    let top = Math.min(...points.map(([, y]) => y));
    let right = Math.max(...points.map(([x]) => x));
    let bottom = Math.max(...points.map(([, y]) => y));
    const width = Math.max(4, right - left);
    const height = Math.max(4, bottom - top);
    if (height / width < 0.5) return [];
    left = clamp(left - width * 0.18, 0, frame.sourceWidth);
    right = clamp(right + width * 0.18, 0, frame.sourceWidth);
    top = clamp(top - height * 0.12, 0, frame.sourceHeight);
    bottom = clamp(bottom + height * 0.12, 0, frame.sourceHeight);
    const landmarkConfidence = average(
      visible.map(({ landmark }) => Math.min(
        landmark.visibility ?? 1,
        landmark.presence ?? 1,
      )),
    );
    const strongStandalonePose =
      visible.length >= 12 &&
      shoulders.length === 2 &&
      hips.length === 2 &&
      visibleHeadPoints >= 2 &&
      landmarkConfidence >= 0.6;
    const recoverableImagePose =
      visible.length >= 9 &&
      shoulders.length === 2 &&
      hips.length >= 1 &&
      visibleHeadPoints >= 1 &&
      anatomicalRegions >= 3 &&
      landmarkConfidence >= 0.52;

    return [{
      bbox: [left, top, right - left, bottom - top],
      score: clamp(landmarkConfidence, 0.45, 0.95),
      fromFullScan: scanArea?.kind === "full",
      relativeScanArea: ((right - left) * (bottom - top)) /
        Math.max(1, frame.sourceWidth * frame.sourceHeight),
      edgeCropped: false,
      strongStandalonePose,
      recoverableImagePose,
    }];
  });
}

function safelyDetectPoses(frame, scanArea) {
  if (!state.poseLandmarker) return [];

  try {
    const result = state.poseLandmarker.detect(inferenceCanvas);
    return poseResultToDetections(result, frame, scanArea);
  } catch (error) {
    console.warn(
      "Automatic pose verification stopped; continuing with detector tracking.",
      error,
    );
    try {
      state.poseLandmarker.close();
    } catch {
      // The failed task may already be closed.
    }
    state.poseLandmarker = null;
    state.lastPoseDetections = [];
    elements.poseStatusTag.textContent = "TRACK";
    showError(
      "Pose assistance stopped. Counting continues with persistent detector tracks; open this page directly in current Chrome or Safari for best results.",
    );
    return [];
  }
}

function getCategory(detection) {
  return detection.categories?.[0] || {
    categoryName: "",
    score: 0,
  };
}

function isPlausiblePerson(detection, frame, minimumScore) {
  const category = getCategory(detection);
  if (category.categoryName !== "person" || category.score < minimumScore) {
    return false;
  }

  const box = detection.boundingBox;
  if (!box || box.width < 4 || box.height < 4) return false;
  const aspectRatio = box.height / Math.max(1, box.width);
  const areaRatio = (box.width * box.height) / (frame.width * frame.height);

  // A close selfie can occupy most of the frame. It is allowed through here,
  // then must pass pose verification before an edge-cropped box is counted.
  if (aspectRatio < 0.7 || areaRatio < 0.001 || areaRatio > 0.88) {
    return false;
  }

  // Low-confidence horizontal boxes are commonly animals, furniture, or shadows.
  if (category.score < 0.38 && aspectRatio < 0.9) {
    return false;
  }

  return true;
}

function orientationScore(detections, frame) {
  let score = 0;
  for (const detection of detections) {
    const category = getCategory(detection);
    if (
      category.categoryName !== "person" ||
      category.score < FULL_FRAME_SCORE_FLOOR
    ) continue;
    const box = detection.boundingBox;
    const aspectRatio = box.height / Math.max(1, box.width);
    const areaRatio = (box.width * box.height) / (frame.width * frame.height);
    if (aspectRatio >= 0.65 && areaRatio >= 0.001 && areaRatio <= 0.88) {
      score += category.score * clamp(aspectRatio, 0.8, 2.2);
    }
  }
  return score;
}

function beginOrientationCalibration() {
  if (!state.running) return;
  const rotations = [state.rotation, 0, 90, 180, 270]
    .filter((value, index, values) => values.indexOf(value) === index);
  state.calibration = {
    rotations,
    index: 0,
    sampleCount: 0,
    scores: new Map(),
  };
  state.lastCalibrationAt = performance.now();
}

function handleCalibrationResult(result, frame) {
  const calibration = state.calibration;
  const previousScore = calibration.scores.get(frame.rotation) || 0;
  calibration.scores.set(
    frame.rotation,
    previousScore + orientationScore(result.detections || [], frame),
  );
  calibration.sampleCount += 1;
  if (calibration.sampleCount < ORIENTATION_SAMPLES) return false;

  calibration.sampleCount = 0;
  calibration.index += 1;

  if (calibration.index < calibration.rotations.length) return false;

  let bestRotation = state.rotation;
  let bestScore = -1;
  for (const [rotation, score] of calibration.scores.entries()) {
    if (score > bestScore) {
      bestScore = score;
      bestRotation = rotation;
    }
  }

  const rotationChanged = state.rotation !== bestRotation;
  state.rotation = bestRotation;
  localStorage.setItem("automaticDetectionRotation", String(bestRotation));
  state.calibration = null;
  if (rotationChanged) resetTracking();
  return true;
}

function intersectionOverUnion(first, second) {
  const left = Math.max(first[0], second[0]);
  const top = Math.max(first[1], second[1]);
  const right = Math.min(first[0] + first[2], second[0] + second[2]);
  const bottom = Math.min(first[1] + first[3], second[1] + second[3]);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union =
    first[2] * first[3] + second[2] * second[3] - intersection;
  return union > 0 ? intersection / union : 0;
}

function intersectionOverSmaller(first, second) {
  const left = Math.max(first[0], second[0]);
  const top = Math.max(first[1], second[1]);
  const right = Math.min(first[0] + first[2], second[0] + second[2]);
  const bottom = Math.min(first[1] + first[3], second[1] + second[3]);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const smallerArea = Math.min(boxArea(first), boxArea(second));
  return smallerArea > 0 ? intersection / smallerArea : 0;
}

function boxArea(box) {
  return Math.max(0, box[2]) * Math.max(0, box[3]);
}

function boxCenter(box) {
  return [box[0] + box[2] / 2, box[1] + box[3] / 2];
}

function centerIsInside(innerBox, outerBox) {
  const [x, y] = boxCenter(innerBox);
  return (
    x >= outerBox[0] &&
    x <= outerBox[0] + outerBox[2] &&
    y >= outerBox[1] &&
    y <= outerBox[1] + outerBox[3]
  );
}

function boxMatchScore(first, second) {
  const overlap = intersectionOverUnion(first, second);
  const firstCenter = boxCenter(first);
  const secondCenter = boxCenter(second);
  const distance = Math.hypot(
    firstCenter[0] - secondCenter[0],
    firstCenter[1] - secondCenter[1],
  );
  const smallerDiagonal = Math.max(
    1,
    Math.min(
      Math.hypot(first[2], first[3]),
      Math.hypot(second[2], second[3]),
    ),
  );
  const proximity = clamp(1 - distance / (smallerDiagonal * 0.65), 0, 1);
  if (overlap < 0.12 && proximity < 0.55) return 0;
  return Math.max(overlap, proximity * 0.7);
}

function boxesAreDuplicate(first, second) {
  const overlap = intersectionOverUnion(first, second);
  const firstArea = boxArea(first);
  const secondArea = boxArea(second);
  const areaRatio = Math.max(firstArea, secondArea) /
    Math.max(1, Math.min(firstArea, secondArea));
  const containment = intersectionOverSmaller(first, second);
  if (
    overlap >= 0.55 ||
    (areaRatio <= 2.2 && containment >= 0.72)
  ) {
    return true;
  }

  // A close person often produces one full-body box and another head/torso
  // box. Treat a nearly contained box as the same person even when their
  // areas differ substantially.
  if (
    containment >= 0.92 &&
    (centerIsInside(first, second) || centerIsInside(second, first))
  ) {
    return true;
  }

  if (areaRatio > 5) return false;

  const firstCenter = boxCenter(first);
  const secondCenter = boxCenter(second);
  const distance = Math.hypot(
    firstCenter[0] - secondCenter[0],
    firstCenter[1] - secondCenter[1],
  );
  const smallerDiagonal = Math.max(
    1,
    Math.min(
      Math.hypot(first[2], first[3]),
      Math.hypot(second[2], second[3]),
    ),
  );
  if (containment >= 0.9 && distance < smallerDiagonal * 0.4) {
    return true;
  }
  return distance < smallerDiagonal * 0.16;
}

function detectionsCorrespond(first, second) {
  const overlap = intersectionOverUnion(first.bbox, second.bbox);
  const containment = intersectionOverSmaller(first.bbox, second.bbox);
  const firstCenter = boxCenter(first.bbox);
  const secondCenter = boxCenter(second.bbox);
  const distance = Math.hypot(
    firstCenter[0] - secondCenter[0],
    firstCenter[1] - secondCenter[1],
  );
  const firstDiagonal = Math.max(1, Math.hypot(first.bbox[2], first.bbox[3]));
  const secondDiagonal = Math.max(1, Math.hypot(second.bbox[2], second.bbox[3]));
  const closeEnough = distance <= Math.max(
    firstDiagonal * 0.45,
    secondDiagonal * 0.55,
  );
  return overlap >= 0.16 || (containment >= 0.65 && closeEnough);
}

function hasIndependentImageSupport(candidate, candidates) {
  if (candidate.verifiedByPose) return true;
  return candidates.some((other) => {
    if (other === candidate || other.score < IMAGE_DETAIL_SCORE_FLOOR) {
      return false;
    }
    const separateScan =
      typeof candidate.scanId === "string" &&
      typeof other.scanId === "string" &&
      candidate.scanId !== other.scanId;
    return separateScan && detectionsCorrespond(candidate, other);
  });
}

function suppressImageBodyPartDuplicates(detections) {
  const accepted = [];
  for (const candidate of detections) {
    const duplicateIndex = accepted.findIndex((kept) => {
      const samePoseIdentity =
        Number.isInteger(kept.poseId) &&
        kept.poseId === candidate.poseId;
      return samePoseIdentity || areAlignedBodyPartDetections(kept, candidate);
    });
    if (duplicateIndex < 0) {
      accepted.push(candidate);
      continue;
    }

    const kept = accepted[duplicateIndex];
    const candidateArea = boxArea(candidate.bbox);
    const keptArea = boxArea(kept.bbox);
    const candidateIsMoreComplete =
      candidateArea > keptArea * 1.18 &&
      candidate.score >= kept.score - 0.18;
    const keptIsMoreComplete =
      keptArea > candidateArea * 1.18 &&
      kept.score >= candidate.score - 0.18;
    const candidateQuality = candidate.score +
      (candidate.verifiedByPose ? 0.08 : 0) +
      (candidate.fromFullScan ? 0.03 : 0);
    const keptQuality = kept.score +
      (kept.verifiedByPose ? 0.08 : 0) +
      (kept.fromFullScan ? 0.03 : 0);
    if (
      candidateIsMoreComplete ||
      (!keptIsMoreComplete && candidateQuality > keptQuality)
    ) {
      accepted[duplicateIndex] = candidate;
    }
  }
  return accepted;
}

function poseMatchQuality(detection, pose) {
  if (!detectionsCorrespond(detection, pose)) return 0;
  const overlap = intersectionOverUnion(detection.bbox, pose.bbox);
  const containment = intersectionOverSmaller(detection.bbox, pose.bbox);
  const detectionCenter = boxCenter(detection.bbox);
  const poseCenter = boxCenter(pose.bbox);
  const distance = Math.hypot(
    detectionCenter[0] - poseCenter[0],
    detectionCenter[1] - poseCenter[1],
  );
  const detectionDiagonal = Math.max(
    1,
    Math.hypot(detection.bbox[2], detection.bbox[3]),
  );
  const proximity = clamp(1 - distance / detectionDiagonal, 0, 1);
  return overlap * 2 + containment + proximity * 0.5;
}

function posesAreDuplicate(first, second) {
  const overlap = intersectionOverUnion(first.bbox, second.bbox);
  const containment = intersectionOverSmaller(first.bbox, second.bbox);
  const firstCenter = boxCenter(first.bbox);
  const secondCenter = boxCenter(second.bbox);
  const distance = Math.hypot(
    firstCenter[0] - secondCenter[0],
    firstCenter[1] - secondCenter[1],
  );
  const smallerDiagonal = Math.max(
    1,
    Math.min(
      Math.hypot(first.bbox[2], first.bbox[3]),
      Math.hypot(second.bbox[2], second.bbox[3]),
    ),
  );
  return (
    overlap >= 0.78 ||
    (containment >= 0.92 && distance <= smallerDiagonal * 0.2)
  );
}

function mergeDetectionWithPoseBox(detection, pose, frame) {
  if (!detectionsCorrespond(detection, pose)) return [...detection.bbox];
  const left = Math.min(detection.bbox[0], pose.bbox[0]);
  const top = Math.min(detection.bbox[1], pose.bbox[1]);
  const right = Math.max(
    detection.bbox[0] + detection.bbox[2],
    pose.bbox[0] + pose.bbox[2],
  );
  const bottom = Math.max(
    detection.bbox[1] + detection.bbox[3],
    pose.bbox[1] + pose.bbox[3],
  );
  const merged = [
    clamp(left, 0, frame.sourceWidth),
    clamp(top, 0, frame.sourceHeight),
    clamp(right, 0, frame.sourceWidth) - clamp(left, 0, frame.sourceWidth),
    clamp(bottom, 0, frame.sourceHeight) - clamp(top, 0, frame.sourceHeight),
  ];
  const mergedAreaRatio = boxArea(merged) /
    Math.max(1, frame.sourceWidth * frame.sourceHeight);
  return mergedAreaRatio <= 0.65 ? merged : [...detection.bbox];
}

function attachPoseEvidence(
  people,
  poses,
  frame,
  {
    allowStandalonePoses = true,
    allowRecoverablePoses = false,
  } = {},
) {
  // Pose is supporting evidence, not a hard gate. Each detector candidate is
  // retained, while a one-to-one pose match can confirm it immediately. When
  // one broad detector box spans multiple strong poses, replace it with the
  // individual pose boxes so two close people are not counted as one.
  const candidates = people.map((detection) => ({
    ...detection,
    verifiedByPose: false,
    poseScore: null,
    poseId: null,
  }));
  const uniquePoses = [];

  for (const pose of [...poses].sort((first, second) => second.score - first.score)) {
    if (!uniquePoses.some((kept) => posesAreDuplicate(kept, pose))) {
      uniquePoses.push({ ...pose, poseId: uniquePoses.length + 1 });
    }
  }

  const multiPersonDetections = new Set();
  people.forEach((person, index) => {
    const strongPoseMatches = uniquePoses.filter((pose) =>
      pose.strongStandalonePose && poseMatchQuality(person, pose) > 0.8
    );
    if (strongPoseMatches.length >= 2) multiPersonDetections.add(index);
  });
  const availableDetections = new Set(
    people
      .map((_, index) => index)
      .filter((index) => !multiPersonDetections.has(index)),
  );

  const splitPairGroups = new Map();
  people.forEach((person) => {
    if (typeof person.splitPairId !== "string") return;
    const group = splitPairGroups.get(person.splitPairId) || [];
    group.push(person);
    splitPairGroups.set(person.splitPairId, group);
  });
  const recoveredSplitPairs = [...splitPairGroups.values()].filter((group) =>
    group.some((person) => person.splitSide === "left") &&
    group.some((person) => person.splitSide === "right")
  );

  for (const pose of uniquePoses) {
    const poseSpansRecoveredPair = recoveredSplitPairs.some((pair) => {
      const containsBothCenters = pair.every((person) =>
        centerIsInside(person.bbox, pose.bbox)
      );
      const largestPersonArea = Math.max(
        ...pair.map((person) => boxArea(person.bbox)),
      );
      return (
        containsBothCenters &&
        boxArea(pose.bbox) >= largestPersonArea * 1.45
      );
    });
    if (poseSpansRecoveredPair) continue;

    let bestIndex = -1;
    let bestQuality = 0.8;
    for (const index of availableDetections) {
      const quality = poseMatchQuality(people[index], pose);
      if (quality > bestQuality) {
        bestIndex = index;
        bestQuality = quality;
      }
    }
    if (bestIndex < 0) {
      const canRecoverMissingPerson =
        pose.strongStandalonePose ||
        (allowRecoverablePoses && pose.recoverableImagePose);
      if (allowStandalonePoses && canRecoverMissingPerson) {
        candidates.push({
          bbox: [...pose.bbox],
          score: pose.score,
          poseScore: pose.score,
          poseId: pose.poseId,
          verifiedByPose: true,
          standalonePose: true,
          strongPoseEvidence: pose.strongStandalonePose,
          fromFullScan: true,
          scanId: `pose-${pose.poseId}`,
          relativeScanArea: boxArea(pose.bbox) /
            Math.max(1, frame.sourceWidth * frame.sourceHeight),
          edgeCropped: false,
        });
      }
      continue;
    }

    const bestDetection = people[bestIndex];
    const matchingIndexes = [...availableDetections].filter((index) => {
      if (index === bestIndex) return true;
      const detection = people[index];
      if (areOppositeSplitPairMembers(bestDetection, detection)) return false;
      if (allowRecoverablePoses) {
        const aligned =
          matchesCropFragment(detection, bestDetection) ||
          matchesCropFragment(bestDetection, detection);
        return aligned && poseMatchQuality(detection, pose) > 0.8;
      }
      const samePersonGeometry =
        boxesAreDuplicate(bestDetection.bbox, detection.bbox) ||
        looksLikeSamePersonAcrossScales(bestDetection, detection) ||
        areAlignedBodyPartDetections(bestDetection, detection);
      return samePersonGeometry && poseMatchQuality(detection, pose) > 0.8;
    });
    matchingIndexes.forEach((index) => {
      const detection = candidates[index];
      const poseBox = mergeDetectionWithPoseBox(detection, pose, frame);
      // A pose can span neighboring people in a crowded photo. Keep an
      // individual box when a pose would widen it considerably.
      const mergedBox = allowRecoverablePoses && poseBox[2] > detection.bbox[2] * 1.2
        ? detection.bbox
        : poseBox;
      availableDetections.delete(index);
      candidates[index] = {
        ...detection,
        bbox: mergedBox,
        poseScore: pose.score,
        poseId: pose.poseId,
        strongPoseEvidence: pose.strongStandalonePose,
        relativeScanArea: boxArea(mergedBox) /
          Math.max(1, frame.sourceWidth * frame.sourceHeight),
        edgeCropped: false,
        verifiedByPose: true,
      };
    });
  }

  return candidates.filter((_, index) =>
    index >= people.length || !multiPersonDetections.has(index)
  );
}

function consolidateDetections(detections, { uploadedImage = false } = {}) {
  // Keep smaller individual detections until after duplicate removal. A broad
  // full-frame box can cover several overlapping people, so discarding the
  // boxes inside it turns a crowd into one person.
  const countable = detections.filter((detection) => !detection.edgeCropped);
  const sorted = [...countable].sort((first, second) => {
    const firstHasPose = Boolean(first.verifiedByPose || first.poseHits > 0);
    const secondHasPose = Boolean(second.verifiedByPose || second.poseHits > 0);
    if (firstHasPose !== secondHasPose) return secondHasPose ? 1 : -1;
    if (uploadedImage) {
      const firstRecovered = Boolean(first.recoveredFromMergedBox);
      const secondRecovered = Boolean(second.recoveredFromMergedBox);
      if (firstRecovered !== secondRecovered) return secondRecovered ? 1 : -1;
      const firstClipped = Boolean(first.clippedByImageTile);
      const secondClipped = Boolean(second.clippedByImageTile);
      if (firstClipped !== secondClipped) return firstClipped ? 1 : -1;
    }
    return second.score - first.score;
  });
  const unique = [];
  const groupedScanIds = new Map();

  for (const detection of sorted) {
    const detectionScanId = typeof detection.scanId === "string"
      ? detection.scanId
      : null;
    let duplicateTarget = null;
    let duplicateScore = -Infinity;

    for (const kept of unique) {
      if (
        haveDistinctPoseIdentities(kept, detection) ||
        areOppositeSplitPairMembers(kept, detection)
      ) continue;

      // Keep ordinary same-scan boxes separate, but still remove an obvious
      // contained torso/full-body duplicate returned for the same person.
      const keptScanIds = groupedScanIds.get(kept) || new Set();
      const sameScan = detectionScanId && keptScanIds.has(detectionScanId);
      if (
        sameScan &&
        intersectionOverSmaller(kept.bbox, detection.bbox) < 0.82
      ) continue;
      if (
        !boxesAreDuplicate(kept.bbox, detection.bbox) &&
        !looksLikeSamePersonAcrossScales(kept, detection)
      ) continue;

      const quality =
        intersectionOverUnion(kept.bbox, detection.bbox) * 2 +
        intersectionOverSmaller(kept.bbox, detection.bbox) +
        boxMatchScore(kept.bbox, detection.bbox);
      if (quality > duplicateScore) {
        duplicateTarget = kept;
        duplicateScore = quality;
      }
    }

    if (duplicateTarget) {
      if (detectionScanId) groupedScanIds.get(duplicateTarget)?.add(detectionScanId);
    } else {
      unique.push(detection);
      groupedScanIds.set(
        detection,
        new Set(detectionScanId ? [detectionScanId] : []),
      );
    }
  }

  return unique.filter((candidate) => {
    if (uploadedImage && candidate.recoveredFromMergedBox) return true;
    const candidateArea = boxArea(candidate.bbox);
    const containedPeople = unique.filter((other) => {
      if (other === candidate) return false;
      if (uploadedImage && (
        other.clippedByImageTile || other.bbox[3] < candidate.bbox[3] * 0.6
      )) return false;
      return (
        boxArea(other.bbox) < candidateArea * 0.65 &&
        centerIsInside(other.bbox, candidate.bbox)
      );
    });
    if (uploadedImage) {
      // Distant people and body fragments may fall inside a foreground
      // rectangle. Only peer-sized detections can replace a group box.
      return !containedPeople.some((first, i) =>
        containedPeople.slice(i + 1).some((second) =>
          Math.abs(boxCenter(first.bbox)[0] - boxCenter(second.bbox)[0]) >=
            candidate.bbox[2] * 0.25
        )
      );
    }
    return containedPeople.length < 2;
  });
}

function smoothBox(previous, next) {
  const newWeight = 0.68;
  return previous.map(
    (value, index) => value * (1 - newWeight) + next[index] * newWeight,
  );
}

function stabilizeTrackedBox(track, detection) {
  const previous = track.bbox;
  const next = detection.bbox;
  const previousArea = boxArea(previous);
  const nextArea = boxArea(next);
  const partialBodyReplacement =
    track.confirmed &&
    nextArea < previousArea * 0.58 &&
    intersectionOverSmaller(previous, next) >= 0.72;
  if (!partialBodyReplacement) return smoothBox(previous, next);

  // Keep the established person-sized rectangle when a later scan sees only
  // a face, arm, or torso. Follow the center gently without shrinking.
  const previousCenter = boxCenter(previous);
  const nextCenter = boxCenter(next);
  const centerWeight = 0.22;
  return [
    previous[0] + (nextCenter[0] - previousCenter[0]) * centerWeight,
    previous[1] + (nextCenter[1] - previousCenter[1]) * centerWeight,
    previous[2],
    previous[3],
  ];
}

function duplicatesAlreadyMatchedTrack(track, detection, now) {
  if (!track.confirmed) return false;
  const overlap = intersectionOverUnion(track.bbox, detection.bbox);
  const containment = intersectionOverSmaller(track.bbox, detection.bbox);
  if (overlap < 0.42 && containment < 0.68) return false;

  const trackCenter = boxCenter(track.bbox);
  const detectionCenter = boxCenter(detection.bbox);
  const centerDistance = Math.hypot(
    trackCenter[0] - detectionCenter[0],
    trackCenter[1] - detectionCenter[1],
  );
  const smallerDiagonal = Math.max(
    1,
    Math.min(
      Math.hypot(track.bbox[2], track.bbox[3]),
      Math.hypot(detection.bbox[2], detection.bbox[3]),
    ),
  );
  const smallerWidth = Math.max(1, Math.min(track.bbox[2], detection.bbox[2]));
  const horizontalDistance = Math.abs(trackCenter[0] - detectionCenter[0]);
  return (
    centerDistance <= smallerDiagonal * 0.45 &&
    horizontalDistance <= smallerWidth * 0.55 &&
    motionAwareTrackMatchScore(track, detection, now) >= 0.35
  );
}

function motionAwareTrackMatchScore(track, detection, now) {
  const elapsed = clamp(now - track.lastSeen, 0, TRACK_HOLD_MS);
  const predictedBox = [
    track.bbox[0] + (track.velocityX || 0) * elapsed,
    track.bbox[1] + (track.velocityY || 0) * elapsed,
    track.bbox[2],
    track.bbox[3],
  ];
  const ordinaryScore = boxMatchScore(track.bbox, detection.bbox);
  const predictedScore = boxMatchScore(predictedBox, detection.bbox);
  const sameRecentPose =
    Number.isInteger(detection.poseId) &&
    detection.poseId === track.lastPoseId &&
    now - (track.lastPoseSeenAt || -Infinity) <= POSE_CACHE_MS + 250;
  const directScore = Math.max(
    ordinaryScore,
    predictedScore,
    sameRecentPose ? 0.92 : 0,
  );
  if (directScore > 0) return directScore;

  const trackArea = boxArea(track.bbox);
  const detectionArea = boxArea(detection.bbox);
  const areaRatio = Math.max(trackArea, detectionArea) /
    Math.max(1, Math.min(trackArea, detectionArea));
  if (areaRatio > 2.5) return 0;

  const predictedCenter = boxCenter(predictedBox);
  const detectionCenter = boxCenter(detection.bbox);
  const distance = Math.hypot(
    predictedCenter[0] - detectionCenter[0],
    predictedCenter[1] - detectionCenter[1],
  );
  const smallerDiagonal = Math.max(
    1,
    Math.min(
      Math.hypot(track.bbox[2], track.bbox[3]),
      Math.hypot(detection.bbox[2], detection.bbox[3]),
    ),
  );
  const maximumMotion = smallerDiagonal * 0.9;
  if (distance > maximumMotion) return 0;
  return 0.18 + (1 - distance / maximumMotion) * 0.24;
}

function canReacquireMovingTrack(detection, now) {
  if (detection.score < MOTION_REACQUIRE_SCORE_FLOOR) return false;
  return state.tracks.some((track) =>
    track.confirmed &&
    now - track.lastSeen <= TRACK_HOLD_MS &&
    motionAwareTrackMatchScore(track, detection, now) > 0.17
  );
}

function isTrackVisible(track, now) {
  const speed = Math.hypot(track.velocityX || 0, track.velocityY || 0);
  const sourceWidth = Math.max(1, elements.overlay.width);
  const sourceHeight = Math.max(1, elements.overlay.height);
  const centerX = (track.bbox[0] + track.bbox[2] / 2) / sourceWidth;
  const centerY = (track.bbox[1] + track.bbox[3] / 2) / sourceHeight;
  const nearFrameEdge =
    centerX < 0.07 || centerX > 0.93 || centerY < 0.07 || centerY > 0.93;
  const reliableTrack =
    track.hits >= 3 && (track.poseHits >= 1 || track.maxScore >= DETECTOR_ONLY_FAST_SCORE);
  const rapidlyMoving = speed > 0.65;
  const stableTrack = reliableTrack && !rapidlyMoving && !nearFrameEdge;
  const holdMs = stableTrack
    ? STABLE_DISPLAY_TRACK_HOLD_MS
    : nearFrameEdge
      ? 650
      : DISPLAY_TRACK_HOLD_MS;
  const missedCycleLimit = stableTrack
    ? STABLE_MAX_VISIBLE_MISSED_CYCLES
    : nearFrameEdge
      ? 1
      : MAX_VISIBLE_MISSED_CYCLES;
  return (
    track.confirmed &&
    now - track.lastSeen <= holdMs &&
    track.missedCycles <= missedCycleLimit
  );
}

function nextAvailableTrackId() {
  const usedIds = new Set(state.tracks.map((track) => track.id));
  let id = 1;
  while (usedIds.has(id)) id += 1;
  return id;
}

function updateTracks(detections, now) {
  const unmatchedTracks = new Set(state.tracks.map((track) => track.id));

  for (const detection of detections) {
    let bestTrack = null;
    let bestScore = 0.17;

    for (const track of state.tracks) {
      if (!unmatchedTracks.has(track.id)) continue;
      const score = motionAwareTrackMatchScore(track, detection, now);
      if (score > bestScore) {
        bestTrack = track;
        bestScore = score;
      }
    }

    if (bestTrack) {
      const previousCenter = boxCenter(bestTrack.bbox);
      const nextCenter = boxCenter(detection.bbox);
      const elapsed = Math.max(1, now - bestTrack.lastSeen);
      const measuredVelocityX = (nextCenter[0] - previousCenter[0]) / elapsed;
      const measuredVelocityY = (nextCenter[1] - previousCenter[1]) / elapsed;
      bestTrack.velocityX = (bestTrack.velocityX || 0) * 0.55 +
        measuredVelocityX * 0.45;
      bestTrack.velocityY = (bestTrack.velocityY || 0) * 0.55 +
        measuredVelocityY * 0.45;
      bestTrack.bbox = stabilizeTrackedBox(bestTrack, detection);
      bestTrack.score = detection.score;
      bestTrack.maxScore = Math.max(bestTrack.maxScore, detection.score);
      bestTrack.hits += 1;
      if (detection.verifiedByPose) {
        bestTrack.poseHits += 1;
        if (Number.isInteger(detection.poseId)) {
          bestTrack.lastPoseId = detection.poseId;
          bestTrack.lastPoseSeenAt = now;
        }
      }
      bestTrack.missedCycles = 0;
      bestTrack.lastSeen = now;
      bestTrack.fromFullScan = detection.fromFullScan;
      if (detection.verifiedByPose) bestTrack.confirmed = true;
      const requiredHits = bestTrack.maxScore >= DETECTOR_ONLY_FAST_SCORE ? 2 : 3;
      if (bestTrack.hits >= requiredHits) bestTrack.confirmed = true;
      unmatchedTracks.delete(bestTrack.id);
    } else {
      const duplicateOfMatchedTrack = state.tracks.some((track) =>
        !unmatchedTracks.has(track.id) &&
        duplicatesAlreadyMatchedTrack(track, detection, now)
      );
      if (duplicateOfMatchedTrack) continue;
      const instantlyConfirmed = Boolean(
        detection.verifiedByPose ||
        detection.score >= DETECTOR_ONLY_INSTANT_SCORE
      );
      state.tracks.push({
        id: nextAvailableTrackId(),
        bbox: detection.bbox,
        score: detection.score,
        maxScore: detection.score,
        hits: 1,
        poseHits: detection.verifiedByPose ? 1 : 0,
        fromFullScan: detection.fromFullScan,
        missedCycles: 0,
        lastSeen: now,
        velocityX: 0,
        velocityY: 0,
        lastPoseId: Number.isInteger(detection.poseId)
          ? detection.poseId
          : null,
        lastPoseSeenAt: detection.verifiedByPose ? now : -Infinity,
        confirmed: instantlyConfirmed,
      });
    }
  }

  const activeTracks = [];
  for (const track of state.tracks) {
    if (unmatchedTracks.has(track.id)) track.missedCycles += 1;
    const age = now - track.lastSeen;
    const missedCycleLimit = track.confirmed
      ? MAX_CONFIRMED_MISSED_CYCLES
      : 1;
    if (age <= TRACK_HOLD_MS && track.missedCycles <= missedCycleLimit) {
      activeTracks.push(track);
    }
    else state.flowTracks.delete(track.id);
  }
  const consolidatedConfirmedTracks = consolidateDetections(
    activeTracks.filter((track) => track.confirmed),
  );
  const retainedConfirmedIds = new Set(
    consolidatedConfirmedTracks.map((track) => track.id),
  );
  state.tracks = activeTracks.filter((track) => {
    const retain = !track.confirmed || retainedConfirmedIds.has(track.id);
    if (!retain) state.flowTracks.delete(track.id);
    return retain;
  });

  return consolidatedConfirmedTracks.filter((track) =>
    isTrackVisible(track, now)
  );
}

function updateFlowTracking(tracks, now) {
  if (!state.flowEnabled) {
    state.flowTracks.clear();
    return;
  }

  const sourceWidth = Math.max(1, elements.overlay.width);
  const visibleTrackIds = new Set();
  for (const track of tracks) {
    visibleTrackIds.add(track.id);
    const rawCenterX = (track.bbox[0] + track.bbox[2] / 2) / sourceWidth;
    const centerX = state.mirrored ? 1 - rawCenterX : rawCenterX;
    const distanceFromLine = centerX - state.flowLinePosition;
    if (Math.abs(distanceFromLine) < 0.035) continue;
    const side = distanceFromLine < 0 ? "left" : "right";
    const flowTrack = state.flowTracks.get(track.id);

    if (!flowTrack) {
      state.flowTracks.set(track.id, {
        stableSide: side,
        pendingSide: null,
        pendingHits: 0,
        lastSeen: now,
      });
      continue;
    }

    flowTrack.lastSeen = now;
    if (side === flowTrack.stableSide) {
      flowTrack.pendingSide = null;
      flowTrack.pendingHits = 0;
      continue;
    }

    if (flowTrack.pendingSide === side) flowTrack.pendingHits += 1;
    else {
      flowTrack.pendingSide = side;
      flowTrack.pendingHits = 1;
    }

    if (flowTrack.pendingHits < 2) continue;
    const movedRight = flowTrack.stableSide === "left" && side === "right";
    const isEntry = state.rightIsEntry ? movedRight : !movedRight;
    if (isEntry) state.entered += 1;
    else state.exited += 1;
    saveFlowCounts();
    updateFlowUi();
    recordHistory(isEntry ? "entry" : "exit", {
      trackId: track.id,
      direction: movedRight ? "right" : "left",
    });
    flowTrack.stableSide = side;
    flowTrack.pendingSide = null;
    flowTrack.pendingHits = 0;
  }

  for (const [trackId, flowTrack] of state.flowTracks.entries()) {
    if (
      !visibleTrackIds.has(trackId) &&
      now - flowTrack.lastSeen > TRACK_HOLD_MS * 1.5
    ) {
      state.flowTracks.delete(trackId);
    }
  }
}

function drawArea(context) {
  if (!state.area) return;
  const rawX = state.area.x * elements.overlay.width;
  const y = state.area.y * elements.overlay.height;
  const width = state.area.width * elements.overlay.width;
  const height = state.area.height * elements.overlay.height;
  const x = state.mirrored
    ? elements.overlay.width - rawX - width
    : rawX;

  context.save();
  context.beginPath();
  context.rect(0, 0, elements.overlay.width, elements.overlay.height);
  context.rect(x, y, width, height);
  context.fillStyle = "rgba(0, 0, 0, 0.22)";
  context.fill("evenodd");
  context.setLineDash([12, 8]);
  context.lineWidth = Math.max(2, elements.overlay.width / 300);
  context.strokeStyle = "rgba(255, 255, 255, 0.72)";
  context.strokeRect(x, y, width, height);
  context.restore();
}

function drawFlowLine(context) {
  if (!state.flowEnabled) return;
  const x = state.flowLinePosition * elements.overlay.width;
  const direction = state.rightIsEntry ? "ENTRY →" : "ENTRY ←";
  context.save();
  context.setLineDash([18, 10]);
  context.lineWidth = Math.max(3, elements.overlay.width / 220);
  context.strokeStyle = "#ffc857";
  context.beginPath();
  context.moveTo(x, 0);
  context.lineTo(x, elements.overlay.height);
  context.stroke();
  context.setLineDash([]);
  context.font =
    "800 " + Math.max(13, elements.overlay.width / 45) + "px system-ui";
  context.textBaseline = "middle";
  context.textAlign = "left";
  const textWidth = context.measureText(direction).width;
  const labelHeight = Math.max(22, elements.overlay.width / 30);
  const labelWidth = textWidth + 14;
  const labelX = state.rightIsEntry
    ? clamp(x + 6, 8, elements.overlay.width - labelWidth - 8)
    : clamp(x - labelWidth - 6, 8, elements.overlay.width - labelWidth - 8);
  const labelY = clamp(
    elements.overlay.height * 0.1,
    24,
    elements.overlay.height - labelHeight - 24,
  );
  context.fillStyle = "#ffc857";
  context.fillRect(labelX, labelY, labelWidth, labelHeight);
  context.fillStyle = "#17191d";
  context.fillText(direction, labelX + 7, labelY + labelHeight / 2);
  context.restore();
}

function drawDetections(tracks) {
  const context = elements.overlay.getContext("2d");
  context.clearRect(0, 0, elements.overlay.width, elements.overlay.height);
  const styles = getComputedStyle(document.documentElement);
  const color = elements.cameraCard.classList.contains("is-alert")
    ? styles.getPropertyValue("--danger").trim()
    : styles.getPropertyValue("--accent").trim();

  context.lineWidth = Math.max(3, elements.overlay.width / 210);
  context.font =
    "700 " + Math.max(14, elements.overlay.width / 35) + "px system-ui";
  context.textBaseline = "top";

  for (const track of tracks) {
    const [rawX, y, width, height] = track.bbox;
    const x = state.mirrored
      ? elements.overlay.width - rawX - width
      : rawX;
    const label = `P${track.id} ${Math.round(track.score * 100)}%`;
    context.strokeStyle = color;
    context.strokeRect(x, y, width, height);
    const textWidth = context.measureText(label).width;
    const textHeight = Math.max(21, elements.overlay.width / 27);
    context.fillStyle = color;
    context.fillRect(x, Math.max(0, y - textHeight), textWidth + 12, textHeight);
    context.fillStyle = "#031009";
    context.fillText(label, x + 6, Math.max(1, y - textHeight + 2));
  }

  drawArea(context);
  drawFlowLine(context);
}

function scheduleDetection(token, delayMs = 0) {
  const requestNextFrame = () => requestAnimationFrame(() => detectLoop(token));
  if (delayMs > 0) window.setTimeout(requestNextFrame, delayMs);
  else requestNextFrame();
}

function recoverDetectorAfterRuntimeError(error, token) {
  if (state.detectorRecoveryPromise) return state.detectorRecoveryPromise;

  const failedModelName = state.detectorModelName;
  state.detectorRecoveryPromise = (async () => {
    if (!state.vision || failedModelName === "generic") throw error;

    showError(
      "The optimized detector is not supported by this browser. Switching to compatible detection...",
    );
    updateAppStatus("Switching detector", "loading");
    try {
      state.detector?.close();
    } catch {
      // The failed task may already be closed.
    }
    state.detector = await createDetector(
      state.vision,
      "CPU",
      FALLBACK_MODEL_PATH,
    );
    state.detectorModelName = "generic";
    state.consecutiveDetectionErrors = 0;
    state.detectionRecovering = false;
    state.lastVideoTime = -1;
    resetTracking();
    clearError();
    updateAppStatus("Camera live (compatible mode)", "live");
    if (state.running && token === state.loopToken) scheduleDetection(token);
  })().catch((recoveryError) => {
    console.error("Compatible detector recovery failed.", recoveryError);
    stopCamera();
    showError(
      "Detection could not recover in this browser. Reload the page, then start the camera again.",
    );
    updateAppStatus("Detector error", "error");
  }).finally(() => {
    state.detectorRecoveryPromise = null;
  });

  return state.detectorRecoveryPromise;
}

function detectLoop(token) {
  if (!state.running || token !== state.loopToken) return;

  if (
    elements.camera.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
    elements.camera.videoWidth < MIN_CAMERA_DIMENSION ||
    elements.camera.videoHeight < MIN_CAMERA_DIMENSION ||
    elements.camera.currentTime === state.lastVideoTime
  ) {
    scheduleDetection(token);
    return;
  }

  state.lastVideoTime = elements.camera.currentTime;
  const startedAt = performance.now();

  try {
    syncCanvas();
    const rotation = state.calibration
      ? state.calibration.rotations[state.calibration.index]
      : state.rotation;
    const scanAreas = getScanAreas();
    const scanArea = state.calibration
      ? state.area
      : scanAreas[state.scanIndex % scanAreas.length];
    const frame = prepareInferenceFrame(rotation, scanArea);
    if (!frame) {
      scheduleDetection(token);
      return;
    }
    if (state.calibration || scanArea?.kind === "full") {
      analyzeFrameQuality(startedAt);
    }
    const result = state.detector.detectForVideo(inferenceCanvas, startedAt);
    if (!state.running || token !== state.loopToken) return;
    state.consecutiveDetectionErrors = 0;
    if (state.detectionRecovering) {
      state.detectionRecovering = false;
      clearError();
      updateAppStatus("Camera live", "live");
    }

    if (state.calibration) {
      handleCalibrationResult(result, frame);
      drawDetections(state.tracks.filter((track) => track.confirmed));
      scheduleDetection(token);
      return;
    }

    state.scanIndex = (state.scanIndex + 1) % scanAreas.length;

    const rawDetections = result.detections || [];
    const people = rawDetections
      .filter((detection) =>
        isPlausiblePerson(detection, frame, POSE_ASSISTED_SCORE_FLOOR)
      )
      .map((detection) => {
        const category = getCategory(detection);
        const bbox = mapBoxToVideo(detection.boundingBox, frame);
        const relativeScanArea =
          (detection.boundingBox.width * detection.boundingBox.height) /
          Math.max(1, frame.width * frame.height);
        const edgeMargin = Math.max(3, Math.min(frame.sourceWidth, frame.sourceHeight) * 0.015);
        const touchesSourceEdge =
          bbox[0] <= edgeMargin ||
          bbox[1] <= edgeMargin ||
          bbox[0] + bbox[2] >= frame.sourceWidth - edgeMargin ||
          bbox[1] + bbox[3] >= frame.sourceHeight - edgeMargin;
        return {
          bbox,
          score: category.score,
          fromFullScan: scanArea?.kind === "full",
          relativeScanArea,
          edgeCropped:
            scanArea?.kind === "full" &&
            relativeScanArea >= 0.18 &&
            touchesSourceEdge,
        };
      });

    const poseWasAvailable = Boolean(state.poseLandmarker);
    const needsPoseVerification =
      poseWasAvailable &&
      performance.now() - state.lastPoseVerificationAt >=
        POSE_VERIFICATION_INTERVAL_MS;
    const now = performance.now();
    const poseDetections = needsPoseVerification
      ? safelyDetectPoses(frame, scanArea)
      : now - state.lastPoseVerificationAt <= POSE_CACHE_MS
        ? state.lastPoseDetections
        : [];
    if (needsPoseVerification) {
      state.lastPoseVerificationAt = now;
      state.lastPoseDetections = poseDetections;
    }
    const candidatesWithPose = poseWasAvailable && state.poseLandmarker
      ? attachPoseEvidence(people, poseDetections, frame, {
        // Cached landmarks may verify a current detector box, but only fresh
        // pose inference may create a standalone person. This prevents a pose
        // box from remaining after someone has left the frame.
        allowStandalonePoses: needsPoseVerification,
      })
      : people.map((detection) => ({
        ...detection,
        verifiedByPose: false,
        poseScore: null,
      }));
    const countCandidates = candidatesWithPose.filter((detection) =>
      detection.verifiedByPose ||
      detection.score >= DETECTOR_ONLY_SCORE_FLOOR ||
      canReacquireMovingTrack(detection, now)
    );
    state.scanDetections.push(...countCandidates);
    updatePipelineDiagnostics({
      raw: rawDetections.length,
      plausible: people.length,
      poseMatched: candidatesWithPose.filter(
        (detection) => detection.verifiedByPose,
      ).length,
      candidates: countCandidates.length,
    });
    const scanCycleComplete = state.scanIndex === 0;
    let confirmedTracks = consolidateDetections(
      state.tracks.filter((track) => isTrackVisible(track, startedAt)),
    );

    if (scanCycleComplete) {
      const fusedDetections = consolidateDetections(state.scanDetections);
      state.scanDetections = [];
      state.tileIndex = (state.tileIndex + 1) % 4;
      confirmedTracks = updateTracks(fusedDetections, startedAt);
      // Track confirmation already supplies temporal persistence. Display the
      // current confirmed count so people who leave are not kept by an older
      // three-cycle median.
      state.countHistory = [confirmedTracks.length];
      const displayedCount = confirmedTracks.length;
      updateCapacity(displayedCount);
      updatePipelineDiagnostics({ tracked: displayedCount });
      recordCountHistory(displayedCount);
      updateFlowTracking(confirmedTracks, startedAt);
    }

    state.lastConfirmedTracks = confirmedTracks;
    drawDetections(confirmedTracks);

    const inferenceFps = 1000 / Math.max(1, performance.now() - startedAt);
    state.fpsHistory.push(inferenceFps);
    if (state.fpsHistory.length > 8) state.fpsHistory.shift();
    elements.fpsValue.textContent = average(state.fpsHistory).toFixed(1);

    if (
      confirmedTracks.length === 0 &&
      performance.now() - state.lastCalibrationAt > RECALIBRATE_AFTER_MS
    ) {
      beginOrientationCalibration();
    }
  } catch (error) {
    console.error(error);
    state.consecutiveDetectionErrors += 1;
    state.detectionRecovering = true;
    state.scanIndex = 0;
    state.scanDetections = [];
    showError(
      `Detector error: ${error?.message || "unexpected browser vision error"}. ` +
      "Switching to compatible detection...",
    );
    void recoverDetectorAfterRuntimeError(error, token);
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
  prepareAlertAudio();
  if (!navigator.mediaDevices?.getUserMedia) {
    showError("Camera access is unavailable. Open this site in a current browser over HTTPS.");
    return;
  }

  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: state.facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 24, max: 30 },
      },
      audio: false,
    });
    elements.camera.srcObject = state.stream;
    await elements.camera.play();
    syncCameraMirroring();
    syncCanvas();
    state.running = true;
    state.loopToken += 1;
    state.fpsHistory = [];
    state.consecutiveDetectionErrors = 0;
    state.detectionRecovering = false;
    state.lastVideoTime = -1;
    state.lastCalibrationAt = performance.now();
    startSession();
    resetTracking();
    recordHistory("session-start", {
      capacity: Number(elements.capacityInput.value),
      status: state.currentCapacityStatus,
    });
    elements.emptyState.hidden = true;
    elements.hud.hidden = false;
    elements.flipButton.disabled = false;
    elements.sidebarFlipButton.disabled = false;
    elements.setAreaButton.disabled = false;
    elements.correctFeedbackButton.disabled = false;
    elements.issueFeedbackButton.disabled = false;
    elements.feedbackStatus.textContent = "Samples stay on this device.";
    elements.startButton.classList.add("is-running");
    elements.startButton.innerHTML =
      '<span class="button-icon">&#9632;</span> Stop camera';
    updateRecordingUi();
    updateAppStatus("Camera live", "live");
    updateAreaControls();
    await requestWakeLock();
    beginOrientationCalibration();
    detectLoop(state.loopToken);
  } catch (error) {
    console.error(error);
    const guidance =
      error?.name === "NotAllowedError"
        ? "Camera permission was denied. Allow camera access in the browser's site settings and try again."
        : "The camera could not start. Close other apps using the camera, then try again.";
    showError(guidance);
    updateAppStatus("Camera error", "error");
  }
}

function stopAreaSelection() {
  state.selectingArea = false;
  state.dragStart = null;
  state.draftArea = null;
  elements.zoneSelection.hidden = true;
  elements.zoneSelection.classList.remove("is-dragging");
  elements.zoneDraft.hidden = true;
}

function stopCamera() {
  if (state.recording) stopRecording();
  if (state.running) finishSession();
  state.running = false;
  state.consecutiveDetectionErrors = 0;
  state.detectionRecovering = false;
  state.loopToken += 1;
  state.stream?.getTracks().forEach((track) => track.stop());
  state.stream = null;
  elements.camera.srcObject = null;
  stopAreaSelection();
  elements.overlay.getContext("2d").clearRect(
    0,
    0,
    elements.overlay.width,
    elements.overlay.height,
  );
  resetTracking();
  elements.hud.hidden = true;
  elements.emptyState.hidden = false;
  elements.flipButton.disabled = true;
  elements.sidebarFlipButton.disabled = true;
  elements.setAreaButton.disabled = true;
  elements.clearAreaButton.disabled = true;
  elements.correctFeedbackButton.disabled = true;
  elements.issueFeedbackButton.disabled = true;
  elements.startButton.classList.remove("is-running");
  elements.startButton.innerHTML =
    '<span class="button-icon">&#9679;</span> Start camera';
  updateRecordingUi();
  updateAppStatus("Ready", "ready");
  elements.cameraCard.classList.remove("is-alert");
  updateQualityUi(
    "waiting",
    "Waiting for camera",
    "Start detection to check lighting and image clarity.",
  );
  state.wakeLock?.release().catch(() => {});
  state.wakeLock = null;
}

async function flipCamera() {
  const wasRunning = state.running;
  if (wasRunning) stopCamera();
  state.facingMode =
    state.facingMode === "environment" ? "user" : "environment";
  state.area = null;
  localStorage.removeItem("detectionArea");
  updateAreaControls();
  await startCamera();
}

function startAreaSelection() {
  if (!state.running) return;
  state.selectingArea = true;
  elements.zoneSelection.hidden = false;
  elements.zoneDraft.hidden = true;
}

function getCoverProjection() {
  const rect = elements.zoneSelection.getBoundingClientRect();
  const sourceWidth = elements.overlay.width || elements.camera.videoWidth || rect.width;
  const sourceHeight = elements.overlay.height || elements.camera.videoHeight || rect.height;
  const scale = Math.max(rect.width / sourceWidth, rect.height / sourceHeight);
  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;

  return {
    rect,
    renderedWidth,
    renderedHeight,
    offsetX: (rect.width - renderedWidth) / 2,
    offsetY: (rect.height - renderedHeight) / 2,
  };
}

function pointerPosition(event) {
  const projection = getCoverProjection();
  const displayX = clamp(
    (event.clientX - projection.rect.left - projection.offsetX) /
      projection.renderedWidth,
    0,
    1,
  );
  return {
    x: state.mirrored ? 1 - displayX : displayX,
    y: clamp(
      (event.clientY - projection.rect.top - projection.offsetY) /
        projection.renderedHeight,
      0,
      1,
    ),
  };
}

function updateZoneDraft(area) {
  const projection = getCoverProjection();
  const displayX = state.mirrored ? 1 - area.x - area.width : area.x;
  const rawLeft = projection.offsetX + displayX * projection.renderedWidth;
  const rawTop = projection.offsetY + area.y * projection.renderedHeight;
  const left = clamp(rawLeft, 0, projection.rect.width);
  const top = clamp(rawTop, 0, projection.rect.height);
  const right = clamp(
    rawLeft + area.width * projection.renderedWidth,
    0,
    projection.rect.width,
  );
  const bottom = clamp(
    rawTop + area.height * projection.renderedHeight,
    0,
    projection.rect.height,
  );

  elements.zoneDraft.hidden = false;
  elements.zoneDraft.style.left = left + "px";
  elements.zoneDraft.style.top = top + "px";
  elements.zoneDraft.style.width = Math.max(0, right - left) + "px";
  elements.zoneDraft.style.height = Math.max(0, bottom - top) + "px";
}

function finishAreaSelection(event) {
  if (!state.dragStart) return;
  const end = pointerPosition(event);
  const area = {
    x: Math.min(state.dragStart.x, end.x),
    y: Math.min(state.dragStart.y, end.y),
    width: Math.abs(end.x - state.dragStart.x),
    height: Math.abs(end.y - state.dragStart.y),
  };

  if (area.width >= 0.08 && area.height >= 0.08) {
    state.area = area;
    localStorage.setItem("detectionArea", JSON.stringify(area));
    resetTracking();
    beginOrientationCalibration();
  }

  stopAreaSelection();
  updateAreaControls();
}

function clearArea() {
  state.area = null;
  localStorage.removeItem("detectionArea");
  resetTracking();
  updateAreaControls();
  beginOrientationCalibration();
}

function handleOrientationChange() {
  window.setTimeout(() => {
    syncCanvas();
    resetTracking();
    beginOrientationCalibration();
  }, 200);
}

elements.startButton.addEventListener("click", () => {
  if (state.running) stopCamera();
  else startCamera();
});
elements.openImageAnalysisButton.addEventListener("click", openImageAnalysis);
elements.closeImageAnalysisButton.addEventListener("click", () => {
  elements.imageAnalysisDialog.close();
});
elements.chooseImageButton.addEventListener("click", chooseImageFile);
elements.chooseAnotherImageButton.addEventListener("click", chooseImageFile);
elements.downloadImageResultButton.addEventListener("click", downloadAnalyzedImage);
elements.imageFileInput.addEventListener("change", () => {
  const [file] = elements.imageFileInput.files || [];
  if (file) void analyzeImageFile(file);
});
elements.imageAnalysisDialog.addEventListener("click", (event) => {
  if (event.target === elements.imageAnalysisDialog) {
    elements.imageAnalysisDialog.close();
  }
});
elements.recordButton.addEventListener("click", () => {
  if (state.recording) stopRecording();
  else startRecording();
});
elements.flipButton.addEventListener("click", flipCamera);
elements.sidebarFlipButton.addEventListener("click", flipCamera);
elements.setAreaButton.addEventListener("click", startAreaSelection);
elements.clearAreaButton.addEventListener("click", clearArea);
elements.camera.addEventListener("loadedmetadata", syncCanvas);
elements.camera.addEventListener("resize", handleOrientationChange);
elements.capacityInput.addEventListener("input", () => {
  elements.capacityOutput.textContent =
    elements.capacityInput.value + " people";
  updateCapacity(Number(elements.countValue.textContent));
});
elements.alertSoundToggle.addEventListener("change", () => {
  state.alertSoundEnabled = elements.alertSoundToggle.checked;
  localStorage.setItem("alertSoundEnabled", String(state.alertSoundEnabled));
  if (state.alertSoundEnabled) prepareAlertAudio();
});
elements.correctFeedbackButton.addEventListener("click", () => saveFeedback(true));
elements.issueFeedbackButton.addEventListener("click", () => saveFeedback(false));
elements.flowToggle.addEventListener("change", () => {
  state.flowEnabled = elements.flowToggle.checked;
  state.flowTracks.clear();
  localStorage.setItem("flowEnabled", String(state.flowEnabled));
  drawDetections(state.lastConfirmedTracks);
});
elements.flowLineInput.addEventListener("input", () => {
  state.flowLinePosition = Number(elements.flowLineInput.value) / 100;
  state.flowTracks.clear();
  updateFlowUi();
  localStorage.setItem(
    "verticalFlowLinePosition",
    String(state.flowLinePosition),
  );
  drawDetections(state.lastConfirmedTracks);
});
elements.flowDirectionButton.addEventListener("click", () => {
  state.rightIsEntry = !state.rightIsEntry;
  state.flowTracks.clear();
  localStorage.setItem("rightIsEntry", String(state.rightIsEntry));
  updateFlowUi();
  drawDetections(state.lastConfirmedTracks);
});
elements.resetFlowButton.addEventListener("click", () => {
  state.entered = 0;
  state.exited = 0;
  state.flowTracks.clear();
  saveFlowCounts();
  updateFlowUi();
  recordHistory("flow-reset");
});
elements.downloadHistoryButton.addEventListener("click", downloadHistoryCsv);
elements.downloadSessionButton.addEventListener("click", downloadSessionReport);
elements.clearHistoryButton.addEventListener("click", () => {
  state.history = [];
  state.lastLoggedCount = null;
  localStorage.removeItem("crowdCountHistory");
  updateHistoryUi();
});

const overlayToggle = document.querySelector("#detectionOverlayToggle");
const qualityToggle = document.querySelector("#qualityAssistantToggle");
const sidebarSearch = document.querySelector("#sidebarSearch");
const noControlResults = document.querySelector("#noControlResults");
const privacyNote = document.querySelector("#privacy");

overlayToggle.addEventListener("change", () => {
  elements.overlay.classList.toggle("overlay-disabled", !overlayToggle.checked);
});

qualityToggle.addEventListener("change", () => {
  elements.qualityAssistant.classList.toggle(
    "is-collapsed",
    !qualityToggle.checked,
  );
});

function filterSidebarControls() {
  const query = sidebarSearch.value.trim().toLowerCase();
  let visibleItems = 0;

  document.querySelectorAll("[data-control-section]").forEach((section) => {
    let sectionMatches = 0;
    section.querySelectorAll(":scope > [data-control-item]").forEach((item) => {
      const matches = !query || item.dataset.search.includes(query);
      item.hidden = !matches;
      if (matches) sectionMatches += 1;
    });
    section.hidden = sectionMatches === 0;
    visibleItems += sectionMatches;
  });

  privacyNote.hidden = Boolean(query);
  noControlResults.hidden = visibleItems !== 0;
}

sidebarSearch.addEventListener("input", filterSidebarControls);
document.addEventListener("keydown", (event) => {
  const isTyping = /input|textarea|select/i.test(event.target.tagName);
  if (
    !isTyping &&
    !event.metaKey &&
    !event.ctrlKey &&
    event.key.toLowerCase() === "f"
  ) {
    event.preventDefault();
    sidebarSearch.focus();
  }
  if (event.key === "Escape" && document.activeElement === sidebarSearch) {
    sidebarSearch.value = "";
    filterSidebarControls();
    sidebarSearch.blur();
  }
});

elements.zoneSelection.addEventListener("pointerdown", (event) => {
  state.dragStart = pointerPosition(event);
  state.draftArea = {
    x: state.dragStart.x,
    y: state.dragStart.y,
    width: 0,
    height: 0,
  };
  elements.zoneSelection.classList.add("is-dragging");
  elements.zoneSelection.setPointerCapture(event.pointerId);
  updateZoneDraft(state.draftArea);
});
elements.zoneSelection.addEventListener("pointermove", (event) => {
  if (!state.dragStart) return;
  const current = pointerPosition(event);
  state.draftArea = {
    x: Math.min(state.dragStart.x, current.x),
    y: Math.min(state.dragStart.y, current.y),
    width: Math.abs(current.x - state.dragStart.x),
    height: Math.abs(current.y - state.dragStart.y),
  };
  updateZoneDraft(state.draftArea);
});
elements.zoneSelection.addEventListener("pointerup", finishAreaSelection);
elements.zoneSelection.addEventListener("pointercancel", stopAreaSelection);

window.addEventListener("resize", () => {
  syncCanvas();
  drawOccupancyChart();
});
window.addEventListener("orientationchange", handleOrientationChange);
screen.orientation?.addEventListener("change", handleOrientationChange);

document.addEventListener("visibilitychange", async () => {
  if (
    document.visibilityState === "visible" &&
    state.running &&
    !state.wakeLock
  ) {
    await requestWakeLock();
    handleOrientationChange();
  }
});

window.addEventListener("beforeunload", stopCamera);
if (!Array.isArray(state.history)) state.history = [];
localStorage.setItem("crowdCountHistory", JSON.stringify(state.history));
elements.alertSoundToggle.checked = state.alertSoundEnabled;
updateAreaControls();
updateFlowUi();
updateHistoryUi();
updateSessionUi();
updateRecordingUi();
loadModel();

async function createDetector(vision, delegate, modelAssetPath = MODEL_PATH) {
  return ObjectDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath,
      delegate,
    },
    runningMode: "VIDEO",
    scoreThreshold: POSE_ASSISTED_SCORE_FLOOR,
    maxResults: 50,
    categoryAllowlist: ["person"],
  });
}

async function createImageDetector(
  vision,
  delegate,
  modelAssetPath = MODEL_PATH,
) {
  return ObjectDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath,
      delegate,
    },
    runningMode: "IMAGE",
    scoreThreshold: IMAGE_PROPOSAL_SCORE_FLOOR,
    maxResults: 50,
    categoryAllowlist: ["person"],
  });
}

async function createPoseLandmarker(vision, delegate) {
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: POSE_MODEL_PATH,
      delegate,
    },
    runningMode: "IMAGE",
    numPoses: MAX_POSES,
    minPoseDetectionConfidence: 0.35,
    minPosePresenceConfidence: 0.35,
    outputSegmentationMasks: false,
  });
}

async function loadModel() {
  try {
    updateAppStatus("Loading", "loading");
    elements.modelStatus.textContent = "Loading fast mobile person detector...";
    const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
    state.vision = vision;
    state.detector = await createDetector(vision, "CPU", MODEL_PATH);
    state.detectorModelName = "custom";

    elements.modelStatus.textContent = "Loading automatic person verifier...";
    try {
      state.poseLandmarker = await createPoseLandmarker(vision, "GPU");
    } catch (gpuError) {
      console.warn("GPU pose verifier unavailable; using CPU.", gpuError);
      try {
        state.poseLandmarker = await createPoseLandmarker(vision, "CPU");
      } catch (poseError) {
        console.warn(
          "Pose assistance unavailable; using persistent detector tracking.",
          poseError,
        );
        state.poseLandmarker = null;
      }
    }

    if (!state.poseLandmarker) {
      elements.modelLoading.hidden = true;
      elements.startButton.disabled = false;
      elements.openImageAnalysisButton.disabled = false;
      elements.poseStatusTag.textContent = "TRACK";
      elements.modelStatus.textContent = "Detector ready; pose assist unavailable";
      updateAppStatus("Ready (tracking only)", "ready");
      showError(
        "Pose assistance is unavailable. Counting will use persistent detector tracks; open the link directly in current Chrome or Safari for best results.",
      );
      return;
    }

    elements.poseStatusTag.textContent = "ASSIST";
    elements.modelLoading.hidden = true;
    elements.startButton.disabled = false;
    elements.openImageAnalysisButton.disabled = false;
    updateAppStatus("Ready", "ready");
  } catch (error) {
    console.error(error);
    elements.modelStatus.textContent = "Detector could not load";
    updateAppStatus("Model error", "error");
    showError(
      "The detection model could not load. Check the internet connection and reload the page.",
    );
  }
}
