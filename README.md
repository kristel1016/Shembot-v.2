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
