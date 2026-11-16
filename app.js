import {
  FilesetResolver,
  ObjectDetector,
  PoseLandmarker,
} from "./vision_bundle.mjs";

const MEDIAPIPE_WASM = "./wasm";
const MODEL_PATH = "./efficientdet_lite0.tflite";
const POSE_MODEL_PATH = "./pose_landmarker_lite.task";
const MAX_INFERENCE_DIMENSION = 416;
const TRACK_HOLD_MS = 2600;
const RECALIBRATE_AFTER_MS = 4000;
const FULL_FRAME_SCORE_FLOOR = 0.3;
const ZOOMED_SCORE_FLOOR = 0.25;
const UNVERIFIED_STRONG_SCORE = 0.82;
const POSE_VERIFICATION_INTERVAL_MS = 900;
const ORIENTATION_SAMPLES = 2;

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
  setAreaButton: document.querySelector("#setAreaButton"),
  clearAreaButton: document.querySelector("#clearAreaButton"),
  areaStatus: document.querySelector("#areaStatus"),
  zoneSelection: document.querySelector("#zoneSelection"),
  zoneDraft: document.querySelector("#zoneDraft"),
  countValue: document.querySelector("#countValue"),
  capacityStatus: document.querySelector("#capacityStatus"),
  fpsValue: document.querySelector("#fpsValue"),
  capacityInput: document.querySelector("#capacityInput"),
  capacityOutput: document.querySelector("#capacityOutput"),
  errorMessage: document.querySelector("#errorMessage"),
};

const inferenceCanvas = document.createElement("canvas");
const inferenceContext = inferenceCanvas.getContext("2d", {
  alpha: false,
  desynchronized: true,
});

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

const state = {
  detector: null,
  poseLandmarker: null,
  stream: null,
  running: false,
  facingMode: "environment",
  loopToken: 0,
  fpsHistory: [],
  countHistory: [],
  lastVideoTime: -1,
  rotation: Number(localStorage.getItem("automaticDetectionRotation")) || 0,
  calibration: null,
  lastCalibrationAt: 0,
  scanIndex: 0,
  scanDetections: [],
  lastPoseVerificationAt: -Infinity,
  tracks: [],
  nextTrackId: 1,
  area: loadSavedArea(),
  selectingArea: false,
  dragStart: null,
  draftArea: null,
  wakeLock: null,
};

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

function updateAreaControls() {
  elements.areaStatus.textContent = state.area
    ? "Focused area active"
    : "Full frame — set an area for best accuracy";
  elements.clearAreaButton.disabled = !state.running || !state.area;
}

function resetTracking() {
  state.tracks = [];
  state.countHistory = [];
  state.scanIndex = 0;
  state.scanDetections = [];
  state.lastPoseVerificationAt = -Infinity;
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

function getCrop(areaOverride) {
  const sourceWidth = elements.camera.videoWidth;
  const sourceHeight = elements.camera.videoHeight;
  const area = areaOverride || state.area || { x: 0, y: 0, width: 1, height: 1 };
  const x = Math.round(area.x * sourceWidth);
  const y = Math.round(area.y * sourceHeight);
  const width = Math.max(2, Math.round(area.width * sourceWidth));
  const height = Math.max(2, Math.round(area.height * sourceHeight));
  return {
    x: clamp(x, 0, sourceWidth - 1),
    y: clamp(y, 0, sourceHeight - 1),
    width: Math.min(width, sourceWidth - x),
    height: Math.min(height, sourceHeight - y),
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
  return [{ ...base, kind: "full" }, ...tiles];
}

function prepareInferenceFrame(rotation, areaOverride) {
  const sourceWidth = elements.camera.videoWidth;
  const sourceHeight = elements.camera.videoHeight;
  const crop = getCrop(areaOverride);
  const turnsSideways = rotation === 90 || rotation === 270;
  const rotatedWidth = turnsSideways ? crop.height : crop.width;
  const rotatedHeight = turnsSideways ? crop.width : crop.height;
  const scale = Math.min(
    1,
    MAX_INFERENCE_DIMENSION / Math.max(rotatedWidth, rotatedHeight),
  );
  const width = Math.max(1, Math.round(rotatedWidth * scale));
  const height = Math.max(1, Math.round(rotatedHeight * scale));

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
        (landmark.visibility ?? 1) >= 0.35 &&
        (landmark.presence ?? 1) >= 0.35
      );
    const visibleByIndex = new Map(
      visible.map(({ landmark, index }) => [index, landmark]),
    );
    const leftShoulder = visibleByIndex.get(11);
    const rightShoulder = visibleByIndex.get(12);
    const hips = [visibleByIndex.get(23), visibleByIndex.get(24)].filter(Boolean);
    if (visible.length < 8 || !leftShoulder || !rightShoulder || hips.length === 0) {
      return [];
    }

    const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    const hipY = average(hips.map((hip) => hip.y));
    if (hipY - shoulderY < 0.02) return [];

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

    return [{
      bbox: [left, top, right - left, bottom - top],
      score: 1,
      fromFullScan: scanArea?.kind === "full",
      relativeScanArea: ((right - left) * (bottom - top)) /
        Math.max(1, frame.sourceWidth * frame.sourceHeight),
      edgeCropped: false,
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
      "Automatic pose verification was disabled; continuing with person detection.",
      error,
    );
    try {
      state.poseLandmarker.close();
    } catch {
      // The failed task may already be closed.
    }
    state.poseLandmarker = null;
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

  if (aspectRatio < 0.7 || areaRatio < 0.001 || areaRatio > 0.55) {
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
    if (aspectRatio >= 0.65 && areaRatio >= 0.001 && areaRatio <= 0.55) {
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
  if (overlap >= 0.45 || intersectionOverSmaller(first, second) >= 0.65) {
    return true;
  }

  const firstArea = boxArea(first);
  const secondArea = boxArea(second);
  const areaRatio = Math.max(firstArea, secondArea) /
    Math.max(1, Math.min(firstArea, secondArea));
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
  return distance < smallerDiagonal * 0.22;
}

function detectionsCorrespond(first, second) {
  const overlap = intersectionOverUnion(first.bbox, second.bbox);
  if (overlap >= 0.12) return true;

  const containment = intersectionOverSmaller(first.bbox, second.bbox);
  const firstCenter = boxCenter(first.bbox);
  const secondCenter = boxCenter(second.bbox);
  const distance = Math.hypot(
    firstCenter[0] - secondCenter[0],
    firstCenter[1] - secondCenter[1],
  );
  const firstDiagonal = Math.max(1, Math.hypot(first.bbox[2], first.bbox[3]));
  return containment >= 0.55 && distance <= firstDiagonal * 0.55;
}

function consolidateDetections(detections) {
  const dominantFullFramePeople = detections.filter(
    (detection) =>
      detection.fromFullScan && detection.relativeScanArea >= 0.1,
  );
  const prepared = detections.filter((detection) => {
    if (detection.fromFullScan) return true;
    return !dominantFullFramePeople.some(
      (fullDetection) =>
        boxArea(detection.bbox) < boxArea(fullDetection.bbox) * 0.85 &&
        centerIsInside(detection.bbox, fullDetection.bbox),
    );
  });
  const countable = prepared.filter((detection) => !detection.edgeCropped);
  const sorted = [...countable].sort(
    (first, second) => second.score - first.score,
  );
  const unique = [];

  for (const detection of sorted) {
    if (!unique.some((kept) => boxesAreDuplicate(kept.bbox, detection.bbox))) {
      unique.push(detection);
    }
  }

  return unique.filter((candidate) => {
    if (candidate.fromFullScan && candidate.relativeScanArea >= 0.1) {
      return true;
    }
    const candidateArea = boxArea(candidate.bbox);
    const containedPeople = unique.filter((other) => {
      if (other === candidate) return false;
      return (
        boxArea(other.bbox) < candidateArea * 0.65 &&
        centerIsInside(other.bbox, candidate.bbox)
      );
    });
    return containedPeople.length < 2;
  });
}

function smoothBox(previous, next) {
  const newWeight = 0.68;
  return previous.map(
    (value, index) => value * (1 - newWeight) + next[index] * newWeight,
  );
}

function updateTracks(detections, now) {
  const unmatchedTracks = new Set(state.tracks.map((track) => track.id));

  for (const detection of detections) {
    let bestTrack = null;
    let bestScore = 0.2;

    for (const track of state.tracks) {
      if (!unmatchedTracks.has(track.id)) continue;
      const score = boxMatchScore(track.bbox, detection.bbox);
      if (score > bestScore) {
        bestTrack = track;
        bestScore = score;
      }
    }

    if (bestTrack) {
      bestTrack.bbox = smoothBox(bestTrack.bbox, detection.bbox);
      bestTrack.score = detection.score;
      bestTrack.maxScore = Math.max(bestTrack.maxScore, detection.score);
      bestTrack.hits += 1;
      bestTrack.lastSeen = now;
      if (detection.verifiedByPose) bestTrack.confirmed = true;
      const requiredHits = bestTrack.maxScore >= 0.4 ? 2 : 3;
      if (bestTrack.hits >= requiredHits) bestTrack.confirmed = true;
      unmatchedTracks.delete(bestTrack.id);
    } else {
      state.tracks.push({
        id: state.nextTrackId++,
        bbox: detection.bbox,
        score: detection.score,
        maxScore: detection.score,
        hits: 1,
        lastSeen: now,
        confirmed: detection.verifiedByPose || detection.score >= 0.72,
      });
    }
  }

  state.tracks = state.tracks.filter((track) => {
    const age = now - track.lastSeen;
    return age <= TRACK_HOLD_MS;
  });

  return consolidateDetections(
    state.tracks.filter((track) => track.confirmed),
  );
}

function drawArea(context) {
  if (!state.area) return;
  const x = state.area.x * elements.overlay.width;
  const y = state.area.y * elements.overlay.height;
  const width = state.area.width * elements.overlay.width;
  const height = state.area.height * elements.overlay.height;

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

function drawDetections(tracks) {
  const context = elements.overlay.getContext("2d");
  context.clearRect(0, 0, elements.overlay.width, elements.overlay.height);
  const styles = getComputedStyle(document.documentElement);
  const color = elements.cameraCard.classList.contains("is-alert")
    ? styles.getPropertyValue("--red").trim()
    : styles.getPropertyValue("--green").trim();

  context.lineWidth = Math.max(3, elements.overlay.width / 210);
  context.font =
    "700 " + Math.max(14, elements.overlay.width / 35) + "px system-ui";
  context.textBaseline = "top";

  for (const track of tracks) {
    const [x, y, width, height] = track.bbox;
    const label = Math.round(track.score * 100) + "%";
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
    const rotation = state.calibration
      ? state.calibration.rotations[state.calibration.index]
      : state.rotation;
    const scanAreas = getScanAreas();
    const scanArea = state.calibration
      ? state.area
      : scanAreas[state.scanIndex % scanAreas.length];
    const frame = prepareInferenceFrame(rotation, scanArea);
    const result = state.detector.detectForVideo(inferenceCanvas, startedAt);
    if (!state.running || token !== state.loopToken) return;

    if (state.calibration) {
      handleCalibrationResult(result, frame);
      drawDetections(state.tracks.filter((track) => track.confirmed));
      scheduleDetection(token);
      return;
    }

    state.scanIndex = (state.scanIndex + 1) % scanAreas.length;

    const minimumScore = scanArea?.kind === "full"
      ? FULL_FRAME_SCORE_FLOOR
      : ZOOMED_SCORE_FLOOR;
    const people = (result.detections || [])
      .filter((detection) => isPlausiblePerson(detection, frame, minimumScore))
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
      people.some((detection) => detection.score < UNVERIFIED_STRONG_SCORE) &&
      performance.now() - state.lastPoseVerificationAt >=
        POSE_VERIFICATION_INTERVAL_MS;
    const poseDetections = needsPoseVerification
      ? safelyDetectPoses(frame, scanArea)
      : [];
    if (needsPoseVerification) {
      state.lastPoseVerificationAt = performance.now();
    }
    const verifiedPeople = !poseWasAvailable || !state.poseLandmarker
      ? people
      : people.flatMap((detection) => {
          if (detection.score >= UNVERIFIED_STRONG_SCORE) return [detection];
          const isPoseVerified = poseDetections.some((pose) =>
            detectionsCorrespond(detection, pose)
          );
          return isPoseVerified
            ? [{ ...detection, verifiedByPose: true }]
            : [];
        });
    state.scanDetections.push(...verifiedPeople);
    const scanCycleComplete = state.scanIndex === 0;
    let confirmedTracks = consolidateDetections(
      state.tracks.filter((track) => track.confirmed),
    );

    if (scanCycleComplete) {
      const fusedDetections = consolidateDetections(state.scanDetections);
      state.scanDetections = [];
      confirmedTracks = updateTracks(fusedDetections, startedAt);
      state.countHistory.push(confirmedTracks.length);
      if (state.countHistory.length > 3) state.countHistory.shift();
      updateCapacity(median(state.countHistory));
    }

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
    showError(
      `Detection paused: ${error?.message || "unexpected browser vision error"}. ` +
      "Stop the camera, then start it again.",
    );
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
    state.fpsHistory = [];
    state.lastVideoTime = -1;
    state.lastCalibrationAt = performance.now();
    resetTracking();
    elements.emptyState.hidden = true;
    elements.hud.hidden = false;
    elements.flipButton.disabled = false;
    elements.setAreaButton.disabled = false;
    elements.startButton.classList.add("is-running");
    elements.startButton.innerHTML =
      '<span class="button-icon">■</span> Stop camera';
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
  state.running = false;
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
  elements.hud.hidden = true;
  elements.emptyState.hidden = false;
  elements.flipButton.disabled = true;
  elements.setAreaButton.disabled = true;
  elements.clearAreaButton.disabled = true;
  elements.startButton.classList.remove("is-running");
  elements.startButton.innerHTML =
    '<span class="button-icon">●</span> Start camera';
  elements.cameraCard.classList.remove("is-alert");
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

function pointerPosition(event) {
  const rect = elements.zoneSelection.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
    y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
  };
}

function updateZoneDraft(area) {
  elements.zoneDraft.hidden = false;
  elements.zoneDraft.style.left = area.x * 100 + "%";
  elements.zoneDraft.style.top = area.y * 100 + "%";
  elements.zoneDraft.style.width = area.width * 100 + "%";
  elements.zoneDraft.style.height = area.height * 100 + "%";
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
elements.flipButton.addEventListener("click", flipCamera);
elements.setAreaButton.addEventListener("click", startAreaSelection);
elements.clearAreaButton.addEventListener("click", clearArea);
elements.camera.addEventListener("loadedmetadata", syncCanvas);
elements.camera.addEventListener("resize", handleOrientationChange);
elements.capacityInput.addEventListener("input", () => {
  elements.capacityOutput.textContent =
    elements.capacityInput.value + " people";
  updateCapacity(Number(elements.countValue.textContent));
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

window.addEventListener("resize", syncCanvas);
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
updateAreaControls();
loadModel();

async function createDetector(vision, delegate) {
  return ObjectDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_PATH,
      delegate,
    },
    runningMode: "VIDEO",
    scoreThreshold: 0.18,
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
    numPoses: 10,
    minPoseDetectionConfidence: 0.4,
    minPosePresenceConfidence: 0.4,
    outputSegmentationMasks: false,
  });
}

async function loadModel() {
  try {
    elements.modelStatus.textContent = "Loading fast mobile person detector...";
    const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);

    try {
      state.detector = await createDetector(vision, "GPU");
    } catch (gpuError) {
      console.warn("GPU detector unavailable; using CPU.", gpuError);
      elements.modelStatus.textContent = "Loading compatible detector...";
      state.detector = await createDetector(vision, "CPU");
    }

    elements.modelStatus.textContent = "Loading automatic person verifier...";
    try {
      state.poseLandmarker = await createPoseLandmarker(vision, "GPU");
    } catch (gpuError) {
      console.warn("GPU pose verifier unavailable; using CPU.", gpuError);
      try {
        state.poseLandmarker = await createPoseLandmarker(vision, "CPU");
      } catch (poseError) {
        console.warn(
          "Pose verification unavailable; using detector-only fallback.",
          poseError,
        );
        state.poseLandmarker = null;
      }
    }

    elements.modelLoading.hidden = true;
    elements.startButton.disabled = false;
  } catch (error) {
    console.error(error);
    elements.modelStatus.textContent = "Detector could not load";
    showError(
      "The detection model could not load. Check the internet connection and reload the page.",
    );
  }
}
