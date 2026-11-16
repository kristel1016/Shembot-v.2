# Phone Crowd Counter

A mobile-first browser application that opens the phone's rear camera, runs a
MediaPipe EfficientDet-Lite0 person detector locally, draws person boxes,
smooths the count, and shows a configurable capacity warning. It automatically
tests portrait and landscape orientations, supports a user-selected detection
area, and confirms detections across frames to reduce brief misses and common
animal/object false positives. A balanced 32% confidence floor rejects weak
background objects, while overlapping zoom scans improve small and crowded
person detection without adding extra inference calls per video frame. Results
from a complete scan cycle are fused before counting to suppress duplicate and
large group boxes. Every cycle also includes a full-frame scan so large nearby
people suppress cropped body-part detections from the zoom tiles.

The app is a static website and is ready for HTTPS hosting with GitHub Pages.
Camera frames are processed in the browser and are not uploaded by the app.
