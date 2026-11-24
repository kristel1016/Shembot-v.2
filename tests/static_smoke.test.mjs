import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDir, "..");

const requiredFiles = [
  "index.html",
  "assets/css/styles.css",
  "src/js/boot.js",
  "src/js/app.js",
  "lib/mediapipe/vision_bundle.js",
  "lib/mediapipe/models/efficientdet_lite0.tflite",
  "lib/mediapipe/models/efficientdet_lite0_generic.tflite",
  "lib/mediapipe/models/pose_landmarker_lite.task",
  "lib/mediapipe/wasm/vision_wasm_internal.js",
  "lib/mediapipe/wasm/vision_wasm_internal.wasm",
  "lib/mediapipe/wasm/vision_wasm_module_internal.js",
  "lib/mediapipe/wasm/vision_wasm_module_internal.wasm",
];

for (const relativePath of requiredFiles) {
  await access(path.join(root, relativePath), constants.R_OK);
}

const html = await readFile(path.join(root, "index.html"), "utf8");
for (const id of [
  "camera",
  "overlay",
  "startButton",
  "recordButton",
  "recordingIndicator",
  "recordingElapsed",
  "flipButton",
  "countValue",
  "capacityMetric",
  "capacityStatus",
  "capacityAlert",
  "capacityInput",
  "alertSoundToggle",
  "occupancyChart",
  "sessionCurrentStatus",
  "sessionMax",
  "sessionAverage",
  "sessionAlerts",
  "downloadSessionButton",
  "setAreaButton",
  "pipelineRaw",
  "pipelineTracked",
  "poseStatusTag",
]) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
}

const boot = await readFile(path.join(root, "src/js/boot.js"), "utf8");
assert.match(boot, /import\(["'].\/app\.js/);

const app = await readFile(path.join(root, "src/js/app.js"), "utf8");
assert.match(app, /categoryAllowlist:\s*\["person"\]/);
assert.match(app, /category\.categoryName\s*!==\s*"person"/);
assert.match(app, /ObjectDetector\.createFromOptions/);
assert.match(app, /PoseLandmarker\.createFromOptions/);
assert.match(app, /function prepareInferenceFrame/);
assert.match(app, /function consolidateDetections/);
assert.match(app, /function attachPoseEvidence/);
assert.match(app, /DETECTOR_ONLY_SCORE_FLOOR/);
assert.match(app, /DETECTOR_ONLY_FAST_SCORE/);
assert.match(app, /detection\.verifiedByPose\s*\|\|\s*detection\.score/);
assert.doesNotMatch(app, /counting is disabled/);
assert.match(app, /continuing with detector tracking/);
assert.match(app, /videoWidth\s*<\s*MIN_CAMERA_DIMENSION/);
assert.match(app, /function recoverDetectorAfterRuntimeError/);
assert.match(app, /Switching to compatible detection/);
assert.match(app, /MAX_CONFIRMED_MISSED_CYCLES/);
assert.match(app, /confirmed:\s*Boolean\(detection\.verifiedByPose\)/);
assert.match(app, /width:\s*\{ ideal: 1280 \}/);
assert.match(app, /height:\s*\{ ideal: 720 \}/);
assert.match(app, /numPoses:\s*MAX_POSES/);
assert.match(app, /pipeline:\s*\{ \.\.\.state\.pipelineStats \}/);
assert.match(app, /return \[\{ \.\.\.base, kind: "full" \}, tile\]/);
assert.doesNotMatch(app, /Detection paused:/);
assert.match(app, /navigator\.mediaDevices\.getUserMedia/);
assert.match(app, /function getCapacityStatus/);
assert.match(app, /NEAR CAPACITY/);
assert.match(app, /function playCapacityAlarm/);
assert.match(app, /function drawOccupancyChart/);
assert.match(app, /function downloadSessionReport/);
assert.match(app, /Box percentages are detection confidence, not system accuracy/);
assert.match(app, /function startRecording/);
assert.match(app, /function stopRecording/);
assert.match(app, /recordingCanvas\.captureStream\(20\)/);
assert.match(app, /formatRecordingTimestamp/);
assert.match(app, /video-recording-start/);
assert.match(app, /video-recording-end/);

console.log(`SHEMBOT checkpoint smoke test passed (${requiredFiles.length} assets).`);

