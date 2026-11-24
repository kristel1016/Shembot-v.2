import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  areOppositeSplitPairMembers,
  haveDistinctPoseIdentities,
  looksLikeSamePersonAcrossScales,
  selectDistinctSplitPair,
} from "../src/js/detection_geometry.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDir, "..");

const requiredFiles = [
  "index.html",
  "assets/css/styles.css",
  "src/js/boot.js",
  "src/js/app.js",
  "src/js/detection_geometry.js",
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
  "openImageAnalysisButton",
  "imageAnalysisDialog",
  "imageFileInput",
  "imageResultCanvas",
  "imagePeopleCount",
  "downloadImageResultButton",
  "imageResultGuidance",
  "imageRecommendationTitle",
  "imageRecommendationMessage",
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
assert.match(app, /DETECTOR_ONLY_SCORE_FLOOR\s*=\s*0\.50/);
assert.match(app, /IMAGE_DETECTOR_SCORE_FLOOR\s*=\s*0\.30/);
assert.match(app, /IMAGE_PROPOSAL_SCORE_FLOOR\s*=\s*0\.15/);
assert.match(app, /TRACK_HOLD_MS\s*=\s*1500/);
assert.match(app, /DISPLAY_TRACK_HOLD_MS\s*=\s*850/);
assert.match(app, /MAX_VISIBLE_MISSED_CYCLES\s*=\s*1/);
assert.match(app, /POSE_CACHE_MS\s*=\s*650/);
assert.match(app, /MOTION_REACQUIRE_SCORE_FLOOR\s*=\s*0\.28/);
assert.match(app, /looksLikeSamePersonAcrossScales/);
assert.match(app, /detection\.verifiedByPose\s*\|\|\s*detection\.score/);
assert.doesNotMatch(app, /counting is disabled/);
assert.match(app, /continuing with detector tracking/);
assert.match(app, /videoWidth\s*<\s*MIN_CAMERA_DIMENSION/);
assert.match(app, /function recoverDetectorAfterRuntimeError/);
assert.match(app, /Switching to compatible detection/);
assert.match(app, /MAX_CONFIRMED_MISSED_CYCLES/);
assert.match(app, /confirmed:\s*instantlyConfirmed/);
assert.match(app, /DETECTOR_ONLY_INSTANT_SCORE\s*=\s*0\.78/);
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
assert.match(app, /function analyzeImageFile/);
assert.match(app, /function renderAnalyzedImage/);
assert.match(app, /function downloadAnalyzedImage/);
assert.match(app, /runningMode:\s*"IMAGE"/);
assert.match(app, /imageScanAreas/);
assert.match(app, /xPositions\s*=\s*\[0, Math\.round\(right \/ 2\), right\]/);
assert.match(app, /createImageDetector\(state\.vision, "CPU", FALLBACK_MODEL_PATH\)/);
assert.match(app, /candidate\.score >= IMAGE_DETECTOR_SCORE_FLOOR/);
assert.match(app, /multiPersonDetections/);
assert.match(app, /function refineMergedImageCandidates/);
assert.match(app, /selectDistinctSplitPair/);
assert.match(app, /recoveredFromMergedBox/);
assert.match(app, /detection_geometry\.js\?v=20261124-live1/);
assert.match(app, /function motionAwareTrackMatchScore/);
assert.match(app, /function canReacquireMovingTrack/);
assert.match(app, /function isTrackVisible/);
assert.match(app, /state\.tracks\.filter\(\(track\) => isTrackVisible\(track, startedAt\)\)/);
assert.match(app, /allowStandalonePoses:\s*needsPoseVerification/);
assert.match(app, /velocityX/);
assert.match(app, /strongStandalonePose/);
assert.match(app, /haveDistinctPoseIdentities/);
assert.match(app, /Reduce occupancy by at least/);
assert.match(app, /average confidence/);
assert.match(app, /image\/jpeg.*image\/png.*image\/webp/s);

const screenshotUpperBody = {
  bbox: [598, 127, 455, 425],
  score: 0.46,
  fromFullScan: true,
  verifiedByPose: false,
};
const screenshotLowerBody = {
  bbox: [654, 385, 475, 413],
  score: 0.78,
  fromFullScan: false,
  verifiedByPose: true,
};
assert.equal(
  looksLikeSamePersonAcrossScales(screenshotUpperBody, screenshotLowerBody),
  true,
  "overlapping full/tile boxes for the screenshot person should merge",
);
assert.equal(
  looksLikeSamePersonAcrossScales(
    screenshotLowerBody,
    { ...screenshotUpperBody, bbox: [1100, 127, 455, 425] },
  ),
  false,
  "side-by-side people should remain separate",
);
assert.equal(
  looksLikeSamePersonAcrossScales(
    { ...screenshotUpperBody, verifiedByPose: true },
    screenshotLowerBody,
  ),
  false,
  "two independently pose-supported boxes should remain separate",
);
assert.equal(
  looksLikeSamePersonAcrossScales(
    { ...screenshotUpperBody, fromFullScan: false, scanId: "tile-0-0" },
    { ...screenshotLowerBody, verifiedByPose: false, fromFullScan: false, scanId: "tile-1-0" },
  ),
  true,
  "aligned duplicates from different image tiles should merge",
);
assert.equal(
  looksLikeSamePersonAcrossScales(
    { bbox: [100, 100, 110, 220], score: 0.62, scanId: "tile-0-0" },
    { bbox: [111, 108, 104, 211], score: 0.41, scanId: "tile-0-1" },
  ),
  true,
  "near-identical boxes from overlapping tiles should merge",
);
assert.equal(
  looksLikeSamePersonAcrossScales(
    { bbox: [100, 100, 110, 220], score: 0.62, scanId: "tile-0-0" },
    { bbox: [180, 105, 105, 215], score: 0.55, scanId: "tile-0-1" },
  ),
  false,
  "adjacent people from overlapping tiles should remain separate",
);
assert.equal(
  haveDistinctPoseIdentities({ poseId: 1 }, { poseId: 2 }),
  true,
  "detections backed by different poses must remain separate people",
);
assert.equal(
  haveDistinctPoseIdentities({ poseId: 1 }, { poseId: 1 }),
  false,
  "detections backed by the same pose may still be deduplicated",
);

const mergedPairParent = { bbox: [200, 160, 180, 300], score: 0.64 };
const recoveredPair = [
  { bbox: [206, 166, 92, 286], score: 0.71, splitSide: "left" },
  { bbox: [292, 170, 80, 282], score: 0.67, splitSide: "right" },
];
assert.deepEqual(
  selectDistinctSplitPair(mergedPairParent, recoveredPair),
  recoveredPair,
  "a broad box with two separated full-height people should split into two",
);
assert.deepEqual(
  selectDistinctSplitPair(mergedPairParent, [
    recoveredPair[0],
    { ...recoveredPair[0], bbox: [214, 168, 88, 280], splitSide: "right" },
  ]),
  [],
  "two scans of the same centered person must not create a false pair",
);
assert.equal(
  areOppositeSplitPairMembers(
    { splitPairId: "pair-1", splitSide: "left" },
    { splitPairId: "pair-1", splitSide: "right" },
  ),
  true,
  "opposite members of one recovered pair must remain separate",
);

console.log(`SHEMBOT checkpoint smoke test passed (${requiredFiles.length} assets).`);

