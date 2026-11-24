# SHEMBOT v2 — person detection and counting

## About

Shembot is a private, on-device crowd counter with live person detection and
entry/exit analytics.

**Live site:** <https://kristel1016.github.io/Shembot-v.2/>

SHEMBOT is a mobile-first, browser-based people counter. It opens a phone or
laptop camera, runs person detection locally, draws boxes, stabilizes the
count, and displays capacity and entry/exit information. Camera frames are not
uploaded by the application.

This repository contains the working implementation. The live website,
vendored MediaPipe runtime, detector model, pose model, checkpoint reports,
dataset audit, training scripts, measured baselines, and smoke tests are all
included.

## Milestone 4 — application, evaluation, and documentation

> **✓ One usable application exposes the complete evaluated pipeline.**

Clone the exact 80% checkpoint and run the editable Gradio interface. The
model is loaded and warmed once; each result shows annotated person boxes,
confidence, count, processing time, and FPS.

```powershell
git clone --branch cp4-80 https://github.com/kristel1016/Shembot-v.2.git
cd Shembot-v.2
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-app.txt
python src/gradio_app.py
```

The public mobile interface remains available without localhost:

**<https://kristel1016.github.io/Shembot-v.2/>**

Reproduce the locked 133-image test result and regenerate the report assets:

```powershell
python src/evaluate.py --split test --weights evaluation/models/object_detection_yolox_2022nov_int8.onnx --output outputs/milestone4_final
python -m pip install -r requirements-docs.txt
python tools/create_milestone4_assets.py
python -m unittest tests.test_milestone4_artifacts -v
```

| Method | Precision | Recall | F1 | AP50 | mAP50–95 | Count MAE | CPU FPS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Single-scale baseline | 0.5984 | 0.0720 | 0.1285 | 0.0619 | 0.0283 | 7.0000 | 2.25 |
| Integrated multi-scale core | 0.5308 | 0.1468 | 0.2300 | 0.1166 | 0.0473 | 5.8346 | 0.44 |

The application is complete enough to demonstrate, but the evidence is
deliberately honest: low light, dense crowds, small/distant people, and
look-alike objects remain limitations. See `MILESTONE_4.md`,
`reports/MILESTONE_4_REPORT.docx`, `reports/MILESTONE_4_SLIDES.pptx`,
`tests/milestone4_test_cases.csv`, and `docs/remaining.md`.

## Milestone 3 — core implementation and testing

> **✓ One command takes raw input to visible annotated output.**

The Python checkpoint pipeline exposes separate `preprocess`, `infer`,
`postprocess`, and `render` stages. It accepts an image, image folder, video,
or webcam. The default core method combines a 640×640 full-frame YOLOX person
scan with four overlapping crops, geometry filtering, duplicate fusion, and
temporal count stabilization for video.

```powershell
git clone --branch cp3-core https://github.com/kristel1016/Shembot-v.2.git
cd Shembot-v.2
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt

# Raw image folder to annotated images and predictions.csv
python src/run.py --input data/test/images --output outputs/run

# Video or webcam
python src/run.py --input demo.mp4 --output outputs/demo_annotated.mp4
python src/run.py --webcam 0 --output outputs/webcam.mp4

# Reproduce the baseline/core table, speed, and failure analysis
python src/evaluate.py --output outputs/milestone3
```

Locked source-grouped test results at validation-selected confidence `0.10`, NMS `0.50`, and
matching IoU `0.50`:

| Method | Precision | Recall | F1 | AP50 | mAP50–95 | Count MAE | FPS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Single-scale baseline | 0.5984 | 0.0720 | 0.1285 | 0.0619 | 0.0283 | 7.0000 | 6.20 |
| Integrated multi-scale core | 0.5308 | 0.1468 | 0.2300 | 0.1166 | 0.0473 | 5.8346 | 1.22 |

These are intentionally reported as honest checkpoint results. Multi-scale
inference improves recall, F1, AP, and count error, but it remains too slow for
real-time CPU use and still misses many small or heavily occluded people.

The current browser TFLite detector has also been evaluated through the exact
MediaPipe inference path used by the site. On the same locked 133-image test
split, at confidence `0.26`, it achieves **40.89% precision, 28.69% recall,
33.72% F1, 24.49% AP50, 8.18% mAP50-95, 4.20 count MAE, and 31.64 CPU FPS**.
These detector-only figures exclude the browser pose verifier, duplicate
suppression, and temporal confirmation. Full comparison details are in
[`training/EXPERIMENT_RESULTS.md`](training/EXPERIMENT_RESULTS.md).

Milestone 3 evidence is mapped in `MILESTONE_3.md`; the full report is in
`reports/MILESTONE_3_REPORT.md` and the generated metrics/failure gallery are
under `outputs/milestone3_final/`.

## Milestone 2 — fresh-clone checkpoint run

> **✓ A fresh clone plus the README steps runs the prototype.**

Clone the tagged checkpoint and verify its included files and validation
baseline:

```powershell
git clone --branch cp2-50 https://github.com/kristel1016/Shembot-v.2.git
cd Shembot-v.2
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
node tests/static_smoke.test.mjs
python -m unittest evaluation/test_evaluate_baseline.py -v
python evaluation/evaluate_baseline.py
```

Open the deployed HTTPS prototype—no local server is required:

**<https://kristel1016.github.io/Shembot-v.2/>**

Allow camera access and press **Start camera**. Use a current Chrome, Edge, or
Safari browser. No npm install or build step is required; `npm test` is an
optional shortcut for the JavaScript smoke test.

## Implemented at this checkpoint

- MediaPipe EfficientDet-Lite0 person proposals, filtered to class `person`
- optional PoseLandmarker assistance with detector-only temporal fallback
- portrait/landscape orientation testing
- full-frame plus overlapping zoom scans for small people
- NMS, containment-aware duplicate suppression, and cross-frame tracking
- live raw/plausible/pose/candidate/tracked pipeline diagnostics
- HD camera request and 768-pixel inference preparation
- configurable room capacity and detection area
- safe, near-capacity, and overcapacity status with an optional sound alert
- live occupancy graph, session summary, and downloadable session CSV report
- downloadable annotated camera recording with count, status, and local timestamp
- uploaded-image crowd analysis with a generic COCO detector, ten multi-scale scans, pose-based pair splitting, confidence summary, recommended action, and downloadable annotated output
- front/rear camera switching and mirrored preview correction
- lighting and clarity guidance
- entry/exit line counter and local CSV history
- local correct/incorrect feedback capture
- static GitHub Pages deployment workflow

## Reproducible evidence

| Evidence | Result |
| --- | --- |
| Count baseline | 300 validation frames: MAE 20.92, RMSE 21.5177, 17.6476 FPS |
| Custom EfficientDet-Lite0 | 133-image held-out test: AP 0.0958, AP50 0.2886, AR@100 0.2830 |
| Detection dataset | 1,350 images, 10,439 person boxes, source-grouped split |
| Included validation baseline | 30 distinct validation sources: precision 0.7273, recall 0.0773, F1 0.1397 at IoU 0.50 |
| Browser smoke test | Confirms all app assets, models, required UI elements, and person-only filters |

The custom CCTV model is documented as a baseline but is not the deployed
default. Its public CCTV domain does not match the intended phone-camera domain
well enough. The checkpoint therefore uses the vendored generic detector plus
pose, geometry, temporal, and duplicate checks while phone-specific training
data is collected.

## Checkpoint documents

- `CHECKPOINT_50.md` — submission checklist and evidence map
- `reports/DATA_CARD.md` — source, license, split, labels, preprocessing, gaps
- `reports/MODEL_EVALUATION.md` — measured results and deployment decision
- `reports/PREPROCESSING.md` — code path and visual evidence
- `reports/PROGRESS_REPORT.md` — weighted 50% progress and blockers
- `reports/PROGRESS_REPORT.docx` — formatted, editable Word submission copy
- `reports/DEMO_GUIDE.md` — in-class demo steps and likely questions

## Project structure

```text
.
|-- index.html
|-- assets/css/styles.css
|-- src/js/
|-- lib/mediapipe/
|-- training/
|-- data/
|-- evidence/
|-- evaluation/
|-- reports/
|-- tests/static_smoke.test.mjs
|-- package.json
`-- requirements.txt
```

## Privacy

Detection, pose assistance, tracking, and history remain in the browser.
Incorrect samples are downloaded only when the user explicitly requests it;
they are never uploaded automatically.

