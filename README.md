# Phone Crowd Counter

A mobile-first browser application that opens the phone's rear camera, runs a
MediaPipe EfficientDet-Lite0 person detector locally, draws person boxes,
smooths the count, and shows a configurable capacity warning. The detection
view can be rotated in 90-degree steps for portrait, landscape, or sideways
camera mounting.

The app is a static website and is ready for HTTPS hosting with GitHub Pages.
Camera frames are processed in the browser and are not uploaded by the app.
