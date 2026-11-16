# Phone Crowd Counter

A mobile-first browser application that opens the phone's rear camera, runs a
COCO-SSD Lite MobileNet person detector locally with TensorFlow.js, draws person
boxes, smooths the count, and shows a configurable capacity warning.

The app is a static website and is ready for HTTPS hosting with GitHub Pages.
Camera frames are processed in the browser and are not uploaded by the app.
