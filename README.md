# Phone Crowd Counter

A mobile-first browser application that opens the phone's rear camera, runs a
MediaPipe EfficientDet-Lite0 person detector locally, draws person boxes,
smooths the count, and shows a configurable capacity warning. It automatically
tests portrait and landscape orientations, supports a user-selected detection
area, and confirms detections across frames to reduce brief misses. Sensitivity
is automatic: an EfficientDet person candidate is cross-checked by a lightweight
MediaPipe pose model, while strong detections remain as a fallback when pose
landmarks are temporarily hidden. Pose results verify candidates but never
create countable boxes on their own. Overlapping zoom scans improve small and
crowded person detection. Results from a complete scan cycle are fused before
counting, and containment-aware suppression removes nested duplicate and large
group boxes.

The app is a static website and is ready for HTTPS hosting with GitHub Pages.
Camera frames are processed in the browser and are not uploaded by the app.
