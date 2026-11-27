import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import path from "node:path";
import {
  areAlignedBodyPartDetections,
  areOppositeSplitPairMembers,
  haveDistinctPoseIdentities,
  looksLikeSamePersonAcrossScales,
  matchesCropFragment,
  selectDistinctSplitPair,
  touchesInteriorCropEdge,
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
  "imageRecommendationSteps",
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
assert.doesNotMatch(html, /Correct difficult crowd results/);
assert.doesNotMatch(html, /addMissedPersonButton|splitDetectionButton|removeDetectionButton/);

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
assert.match(app, /IMAGE_DETECTOR_SCORE_FLOOR\s*=\s*0\.34/);
assert.match(app, /IMAGE_PROPOSAL_SCORE_FLOOR\s*=\s*0\.15/);
assert.match(app, /TRACK_HOLD_MS\s*=\s*3200/);
assert.match(app, /DISPLAY_TRACK_HOLD_MS\s*=\s*850/);
assert.match(app, /function publishLiveTracks/);
assert.match(app, /POSE_CACHE_MS\s*=\s*650/);
assert.match(app, /MOTION_REACQUIRE_SCORE_FLOOR\s*=\s*0\.28/);
assert.match(app, /looksLikeSamePersonAcrossScales/);
assert.match(app, /function hasLiveTrackEvidence/);
assert.doesNotMatch(app, /counting is disabled/);
assert.match(app, /continuing with detector tracking/);
assert.match(app, /videoWidth\s*<\s*MIN_CAMERA_DIMENSION/);
assert.match(app, /function recoverDetectorAfterRuntimeError/);
assert.match(app, /Switching to compatible detection/);
assert.match(app, /confirmed:\s*instantlyConfirmed/);
assert.match(app, /DETECTOR_ONLY_INSTANT_SCORE\s*=\s*0\.78/);
assert.match(app, /width:\s*\{ ideal: 1280 \}/);
assert.match(app, /height:\s*\{ ideal: 720 \}/);
assert.match(app, /numPoses:\s*MAX_POSES/);
assert.match(app, /pipeline:\s*\{ \.\.\.state\.pipelineStats \}/);
assert.match(app, /return \[\{ \.\.\.base, kind: "full" \}, tile\]/);
const scanStep = runInNewContext(`${app.slice(app.indexOf("function liveScanStep"), app.indexOf("function prepareInferenceFrame"))}\nliveScanStep`, {
  POSE_VERIFICATION_INTERVAL_MS: 420,
});
function scanPlan(index, tracks, now = 100) {
  const { areaIndex, nextIndex, completesCycle } = scanStep(index, tracks, now);
  return [areaIndex, nextIndex, completesCycle];
}
const stableTrack = { confirmationHits: 3, poseHits: 1, lastSeen: 50 };
assert.deepEqual(scanPlan(0, []), [0, 2, false]);
assert.deepEqual(scanPlan(0, [{ ...stableTrack, confirmationHits: 1 }]), [0, 2, false]);
assert.deepEqual(scanPlan(0, [stableTrack], 500), [0, 2, false]);
assert.deepEqual([0, 1, 2].map((index) => scanPlan(index, [stableTrack])),
  [[0, 1, true], [0, 2, false], [1, 0, true]],
  "stable tracks get an immediate full update between full-and-tile pairs");
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
assert.match(app, /video\/mp4;codecs=avc1\.42E01E/);
assert.ok(
  app.indexOf('mimeType: "video/mp4') < app.indexOf('mimeType: "video/webm'),
  "recording should prefer phone-compatible MP4 before WebM",
);
assert.match(app, /format\?\.extension === "mp4"\) recorder\.start\(\)/);
assert.match(app, /URL\.revokeObjectURL\(url\), 60_000/);
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
assert.match(app, /function hasIndependentImageSupport/);
assert.match(app, /IMAGE_UNSUPPORTED_SCORE_FLOOR\s*=\s*0\.42/);
assert.match(app, /multiPersonDetections/);
assert.match(app, /function refineMergedImageCandidates/);
assert.match(app, /selectDistinctSplitPair/);
assert.match(app, /recoveredFromMergedBox/);
assert.match(app, /detection_geometry\.js\?v=20261125-live-tracks/);
assert.match(app, /function motionAwareTrackMatchScore/);
assert.match(app, /function canReacquireMovingTrack/);
assert.match(app, /function isTrackVisible/);
assert.match(app, /state\.tracks\.filter\(\(track\) => isTrackVisible\(track, startedAt\)\)/);
assert.match(app, /allowStandalonePoses:\s*needsPoseVerification/);
assert.match(app, /scanArea\.kind === "full" &&\s*performance\.now\(\) - state\.lastPoseVerificationAt/);
assert.match(app, /velocityX/);
assert.match(app, /lastSupportedAt/);
assert.match(app, /const reliableTrack/);
assert.match(app, /function stabilizeTrackedBox/);
assert.match(app, /function duplicatesAlreadyMatchedTrack/);
assert.match(app, /function detailedCrowdScanAreas/);
assert.match(app, /function appendImageScanDetections/);
assert.match(app, /IMAGE_DETAIL_SCORE_FLOOR\s*=\s*0\.28/);
assert.match(app, /groupedScanIds/);
assert.match(app, /contained torso\/full-body duplicate/);
assert.match(app, /function suppressImageBodyPartDuplicates/);
assert.match(app, /areAlignedBodyPartDetections/);
assert.match(app, /function mergeDetectionWithPoseBox/);
assert.match(app, /allowRecoverablePoses:\s*true/);
assert.match(app, /recoverableImagePose/);
assert.match(app, /const samePoseIdentity/);
assert.match(app, /const poseSpansRecoveredPair/);
assert.match(app, /detections\.length >= 8/);
assert.doesNotMatch(app, /applyImageCorrection|manualCorrection|imageCorrectionMode/);
assert.match(app, /strongStandalonePose/);
assert.match(app, /haveDistinctPoseIdentities/);
assert.match(html, /<ol id="imageRecommendationSteps">/);
assert.match(app, /"The room is too full"/);
assert.match(app, /const movedRight/);
assert.match(app, /const centerX = state\.mirrored \? 1 - rawCenterX : rawCenterX/);
assert.match(app, /rightIsEntry/);
assert.match(app, /context\.moveTo\(x, 0\)/);
assert.match(app, /ENTRY →/);
assert.match(app, /context\.textBaseline = "middle"/);
assert.match(app, /elements\.overlay\.height \* 0\.1/);
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
assert.equal(
  haveDistinctPoseIdentities({ poseId: 1, poseBatch: 100 }, { poseId: 2, poseBatch: 200 }),
  false,
  "pose numbers from separate scans do not identify separate people",
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
  selectDistinctSplitPair(
    { bbox: [638, 555, 108, 267], score: 0.72 },
    [
      { bbox: [652, 585, 38, 235], score: 0.54, splitSide: "left" },
      { bbox: [677, 555, 49, 258], score: 0.86, splitSide: "right" },
    ],
  ),
  [],
  "the two crop slices of the shopper in blue must count once",
);
assert.deepEqual(
  selectDistinctSplitPair(mergedPairParent, [
    { bbox: [228, 170, 35, 275], score: 0.59, splitSide: "left" },
    { bbox: [258, 173, 74, 269], score: 0.63, splitSide: "right" },
  ]),
  [],
  "a narrow sliver beside a wider crop cannot establish a second person",
);

const photoTile = { x: 0, y: 100, width: 480, height: 220 };
assert.equal(touchesInteriorCropEdge([80, 0, 50, 120], photoTile, 960, 480), true);
assert.equal(touchesInteriorCropEdge([80, 100, 50, 119], photoTile, 960, 480), true);
assert.equal(touchesInteriorCropEdge([0, 30, 50, 120], photoTile, 960, 480), false);
const wholeShopper = { bbox: [220, 100, 90, 220] };
assert.equal(matchesCropFragment({ bbox: [238, 205, 57, 105] }, wholeShopper), true);
assert.equal(matchesCropFragment({ bbox: [280, 128, 70, 125] }, wholeShopper), false);
assert.deepEqual(
  selectDistinctSplitPair(mergedPairParent, [
    recoveredPair[0],
    { ...recoveredPair[0], bbox: [214, 168, 88, 280], splitSide: "right" },
  ]),
  [],
  "two scans of the same centered person must not create a false pair",
);
assert.deepEqual(
  selectDistinctSplitPair(mergedPairParent, [
    { bbox: [206, 166, 92, 286], score: 0.71, splitSide: "left" },
    { bbox: [250, 170, 82, 282], score: 0.67, splitSide: "right" },
  ]),
  [],
  "two heavily overlapping crop results must remain one person",
);
assert.deepEqual(
  selectDistinctSplitPair(mergedPairParent, [
    { bbox: [206, 255, 62, 160], score: 0.71, splitSide: "left" },
    { bbox: [292, 170, 80, 282], score: 0.67, splitSide: "right" },
  ]),
  [],
  "a lower-body fragment and a full person must not become a pair",
);
assert.equal(
  areOppositeSplitPairMembers(
    { splitPairId: "pair-1", splitSide: "left" },
    { splitPairId: "pair-1", splitSide: "right" },
  ),
  true,
  "opposite members of one recovered pair must remain separate",
);

assert.equal(
  areAlignedBodyPartDetections(
    { bbox: [300, 130, 45, 95], score: 0.72 },
    { bbox: [294, 225, 40, 42], score: 0.43 },
  ),
  true,
  "vertically aligned upper and lower body fragments should merge",
);
assert.equal(
  areAlignedBodyPartDetections(
    { bbox: [500, 200, 90, 220], score: 0.64 },
    { bbox: [510, 220, 60, 100], score: 0.51 },
  ),
  true,
  "a nested partial-body box should merge into the full-person box",
);
assert.equal(
  areAlignedBodyPartDetections(
    { bbox: [300, 300, 70, 250], score: 0.67 },
    { bbox: [365, 300, 70, 250], score: 0.64 },
  ),
  false,
  "side-by-side people must remain separate",
);
assert.equal(
  areAlignedBodyPartDetections(
    { bbox: [200, 160, 100, 300], splitPairId: "pair", splitSide: "left" },
    { bbox: [270, 160, 100, 300], splitPairId: "pair", splitSide: "right" },
  ),
  false,
  "automatic merged-pair recovery must remain two people",
);
assert.equal(
  areAlignedBodyPartDetections(
    { bbox: [400, 100, 90, 120], verifiedByPose: true, poseId: 1 },
    { bbox: [405, 225, 100, 260], verifiedByPose: true, poseId: 2 },
  ),
  false,
  "independently posed people above and below each other must remain separate",
);

// Exercise the actual tracker with detections in camera coordinates.
const trackerState = { tracks: [], lastConfirmedTracks: [], flowTracks: new Map() };
const published = { count: 0, tracked: 0, boxes: [], historyCount: 0 };
const tracker = runInNewContext(`
  ${app.slice(app.indexOf("const TRACK_HOLD_MS"), app.indexOf("const IMAGE_PROPOSAL_SCORE_FLOOR"))}
  ${app.slice(app.indexOf("function intersectionOverUnion"), app.indexOf("function drawArea"))}
  ({ updateTracks, isTrackVisible, publishLiveTracks, updateFlowTracking })
`, {
  state: trackerState,
  elements: { overlay: { width: 1400, height: 700 } },
  clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
  haveDistinctPoseIdentities,
  areOppositeSplitPairMembers,
  looksLikeSamePersonAcrossScales,
  matchesCropFragment,
  updateCapacity: (count) => { published.count = count; },
  updatePipelineDiagnostics: ({ tracked }) => { published.tracked = tracked; },
  recordCountHistory: (count) => { published.historyCount = count; },
  drawDetections: (tracks) => { published.boxes = tracks; },
  saveFlowCounts: () => {},
  updateFlowUi: () => {},
  recordHistory: () => {},
});

const foreground = { bbox: [458, 155, 708, 535], score: 0.8, fromFullScan: true };
const shoulderFalsePositive = { bbox: [310, 225, 176, 306], score: 0.36 };
const cachedFalsePositive = {
  ...shoulderFalsePositive, score: 0.49, verifiedByPose: true, poseVerifiedFromCache: true,
};
assert.equal(tracker.updateTracks([foreground], 100).length, 1);
for (const now of [300, 500, 700]) {
  assert.equal(tracker.updateTracks([
    shoulderFalsePositive,
    cachedFalsePositive,
    { ...foreground, score: 0.53 },
    { ...shoulderFalsePositive, score: 0.8, clippedByLiveTile: true },
  ], now).length, 1, "weak and crop-clipped boxes must not start tracks beside a person");
  assert.equal(trackerState.tracks.length, 1);
}
const personId = trackerState.tracks[0].id;
const weakMovingPerson = { ...foreground, bbox: [482, 154, 705, 535], score: 0.38 };
assert.equal(tracker.updateTracks([weakMovingPerson], 900)[0].id, personId);
assert.equal(trackerState.tracks[0].lastSupportedAt, 700);

const secondPerson = { bbox: [136, 208, 180, 440], score: 0.56, fromFullScan: true };
for (const [now, count] of [[1100, 1], [1300, 1], [1500, 2]]) {
  assert.equal(tracker.updateTracks([foreground, secondPerson], now).length, count,
    "a second person with three supported scans still gets a track");
}

trackerState.tracks = [];
tracker.updateTracks([foreground], 100);
for (const now of [500, 1000, 1500, 2000, 2500]) {
  assert.equal(tracker.updateTracks([weakMovingPerson], now).length, 1);
}
assert.equal(tracker.updateTracks([weakMovingPerson], 3400).length, 0,
  "weak boxes alone cannot hold a confirmed track indefinitely");

trackerState.tracks = [];
const closePerson = { ...foreground, bbox: [560, 30, 635, 670], score: 0.91, atLargeFrameEdge: true };
const early = { earlyFullFrame: true };
const tileDuplicate = { ...foreground, fromFullScan: false };
const poseConfirmedPerson = { ...secondPerson, verifiedByPose: true, strongPoseEvidence: true };
assert.equal(tracker.updateTracks([
  secondPerson, closePerson, tileDuplicate,
  { ...poseConfirmedPerson, poseVerifiedFromCache: true },
  { ...poseConfirmedPerson, score: 0.22, strongPoseEvidence: false },
], 50, early).length, 0, "uncertain, edge, tile, and weak pose boxes must wait for fusion");
assert.equal(trackerState.tracks.length, 0);
const beforeTile = tracker.updateTracks([foreground, { ...foreground }], 100, early);
tracker.publishLiveTracks(beforeTile);
assert.equal(published.count, 1, "a strong full-frame detection updates the displayed count before the tile");
const afterTile = tracker.updateTracks([tileDuplicate], 160);
assert.equal(afterTile[0].id, beforeTile[0].id, "tile fusion should preserve the early track ID");
assert.equal(afterTile[0].confirmationHits, 1, "a cycle should provide only one confirmation hit");
assert.equal(tracker.updateTracks([foreground], 250, early)[0].confirmationHits, 1,
  "an existing track should wait for the combined scan before gaining another hit");
assert.equal(tracker.updateTracks([tileDuplicate], 310)[0].confirmationHits, 2);

trackerState.tracks = [];
assert.equal(tracker.updateTracks([secondPerson], 50).length, 0);
const tentativeId = trackerState.tracks[0].id;
const poseConfirmedTrack = tracker.updateTracks([poseConfirmedPerson], 100, early)[0];
assert.equal(poseConfirmedTrack.id, tentativeId,
  "a strong current pose can confirm a pending detector track before the tile");
assert.equal(tracker.updateTracks([poseConfirmedPerson], 160)[0].confirmationHits, 2,
  "confirming a pending track must also count only one hit per scan cycle");

trackerState.tracks = [];
const weakPose = { ...poseConfirmedPerson, score: 0.25, strongPoseEvidence: false };
assert.equal(tracker.updateTracks([weakPose], 50).length, 0,
  "a weak pose match should not confirm a low-confidence background box");
const freshStandalonePose = { ...poseConfirmedPerson, standalonePose: true };
assert.equal(tracker.updateTracks([freshStandalonePose], 100, early).length, 1,
  "a fresh full-frame pose with strong anatomy counts even without a detector box");

trackerState.tracks = [];
assert.equal(tracker.updateTracks([closePerson], 100).length, 0,
  "one large edge detection cannot immediately add a person");
assert.equal(tracker.updateTracks([closePerson], 250).length, 1,
  "a strong close-up person should count after a second scan");
const visible = tracker.updateTracks([closePerson], 400);
tracker.publishLiveTracks(visible, true);
assert.equal(published.count, published.boxes.length);
assert.equal(published.tracked, 1);
assert.equal(published.historyCount, 1);
for (const now of [450, 500, 550, 600, 1100, 1550]) {
  assert.equal(tracker.updateTracks([], now).length, 1,
    "a steady person survives a brief gap at both fast and slow scan rates");
}
tracker.publishLiveTracks(tracker.updateTracks([], 1750));
assert.equal(published.count, 0, "an expired box and the count disappear together between scan cycles");
assert.equal(published.boxes.length, 0);
assert.equal(published.tracked, 0);
assert.equal(published.historyCount, 0);

const movingOut = {
  ...visible[0], bbox: [1250, 250, 130, 300], velocityX: 0.25, lastSeen: 2000, lastSupportedAt: 2000,
};
assert.equal(tracker.isTrackVisible(movingOut, 2250), true);
assert.equal(tracker.isTrackVisible(movingOut, 2400), false,
  "a person moving out of the frame gets a shorter hold");

Object.assign(trackerState, {
  flowEnabled: true, rightIsEntry: true, flowLinePosition: 0.5, entered: 0, exited: 0,
});
function observeCrossing(centerX, now, lastSeen = now) {
  tracker.updateFlowTracking([{ id: 5, bbox: [centerX - 50, 100, 100, 200], lastSeen }], now);
}
observeCrossing(600, 2000);
observeCrossing(700, 2400);
observeCrossing(700, 2800);
observeCrossing(700, 3200);
observeCrossing(800, 3400);
observeCrossing(800, 3500, 3400);
assert.equal(trackerState.entered, 0, "a held box cannot confirm a crossing");
observeCrossing(800, 3600);
assert.equal(trackerState.entered, 1, "a slow crossing still counts after two real observations");
observeCrossing(600, 5000);
observeCrossing(600, 5100);
assert.equal(trackerState.exited, 0, "reappearance after a gap cannot create an exit");

console.log(`SHEMBOT checkpoint smoke test passed (${requiredFiles.length} assets).`);

