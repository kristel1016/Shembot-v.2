# Phone Crowd Counter

A mobile-first browser application that opens the phone's rear camera, runs a
MediaPipe EfficientDet-Lite0 person detector locally, draws person boxes,
smooths the count, and shows a configurable capacity warning. It automatically
tests portrait and landscape orientations, supports a user-selected detection
area, and confirms detections across frames to reduce brief misses and common
animal/object false positives. A strict 35% confidence floor prevents weak
background-object detections from entering the count.

The app is a static website and is ready for HTTPS hosting with GitHub Pages.
Camera frames are processed in the browser and are not uploaded by the app.
