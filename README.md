# Phone Crowd Counter

A mobile-first browser application that opens the phone's rear camera, runs a
MediaPipe EfficientDet-Lite0 person detector locally, draws person boxes,
smooths the count, and shows a configurable capacity warning. It automatically
tests portrait and landscape orientations, supports a user-selected detection
area, and confirms detections across frames to reduce brief misses. Sensitivity
is automatic: every EfficientDet person candidate is cross-checked by a
lightweight MediaPipe pose model when it is available. If the pose model cannot
load, detector-only candidates must persist across several scan cycles before
they are counted. Pose results verify candidates but never create countable
boxes on their own. Overlapping zoom scans improve small and crowded person
detection. Results from a complete scan cycle are fused before counting, and
containment-aware suppression removes nested duplicate and large group boxes.

The app is a static website and is ready for HTTPS hosting with GitHub Pages.
Camera frames are processed in the browser and are not uploaded by the app.

Additional browser-local tools include camera lighting/clarity guidance,
persistent tracking IDs, an adjustable entry/exit counting line, occupancy and
flow history export to CSV, and correct/incorrect feedback capture. Incorrect
samples are downloaded directly to the user's device with the detected and
actual counts in the filename; they are never uploaded automatically.

## Project Structure

```
shembot2/
├── index.html                          # App entry point (root for GitHub Pages)
├── .nojekyll                           # Disables Jekyll processing on GitHub Pages
├── README.md                           # Project documentation
│
├── assets/                             # Static assets
│   └── css/
│       └── styles.css                  # Application stylesheet
│
├── src/                                # Application source code
│   └── js/
│       ├── boot.js                     # Lightweight bootstrap / loader script
│       └── app.js                      # Main application logic (detection, tracking, UI)
│
└── lib/                                # Third-party libraries and models
    └── mediapipe/
        ├── vision_bundle.mjs           # MediaPipe Vision SDK (bundled ES module)
        ├── wasm/                       # MediaPipe WASM runtime (filenames must not change)
        │   ├── vision_wasm_internal.js
        │   ├── vision_wasm_internal.wasm
        │   ├── vision_wasm_module_internal.js
        │   └── vision_wasm_module_internal.wasm
        └── models/                     # ML model files
            ├── efficientdet_lite0.tflite   # Person detection model
            └── pose_landmarker_lite.task   # Pose verification model
```

## Getting Started

1. Serve the project root over HTTPS (or use GitHub Pages).
2. Open `index.html` in a modern browser.
3. Grant camera access and start detection.

No build step is required — all code runs directly in the browser.
