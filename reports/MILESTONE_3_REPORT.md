# SHEMBOT v2 — Milestone 3 core implementation and testing

## 1. Objective and delivered pipeline

The checkpoint integrates the main person-detection/counting method into one
working pipeline. `src/run.py` accepts raw images, an image directory, a video,
or a webcam and produces annotated frames plus machine-readable CSV output.

The stages are explicit in `src/pipeline.py`:

1. **Preprocess:** validate BGR input, letterbox without distortion to 640×640,
   convert BGR to RGB, cast to float32, and create an NCHW tensor.
2. **Infer:** run OpenCV-DNN YOLOX-S INT8 and retain COCO class 0 (`person`).
3. **Postprocess:** apply confidence and geometry filters, fuse overlapping
   full-frame/tile boxes with IoU and containment-aware suppression.
4. **Render:** draw person boxes, confidence, count, and measured FPS.
5. **Video stabilization:** keep a five-frame modal count and require three
   consistent updates before changing the confirmed count.

`src/run.py` and `src/evaluate.py` import this same pipeline, eliminating a
separate evaluation preprocessing path.

## 2. Main method versus baseline

The **baseline** is one full-frame 640×640 detector pass. The **core method**
adds four overlapping 64% crops, then maps their boxes back to the source frame,
filters implausible geometry, and fuses duplicates. The crop passes enlarge
small people that were nearly invisible to the single full-frame pass.

Post-processing was selected using all 145 validation images. Raw detections
were cached once, then confidence, NMS, containment, minimum box area, and
maximum aspect ratio were searched without opening the locked test split. The
selected validation configuration reached F1 `0.2522`, AP50 `0.1192`, and count
MAE `4.8897`. No parameter was changed after the locked test evaluation.

## 3. Representative held-out test data

The locked test set contains **133 augmented images from 53 source groups** and
**1,056 person boxes**. Source groups were assigned during Milestone 2, so
related frames/augmentations do not cross the train/validation/test boundary.
The source images contain the intended hard cases: distant people, dense indoor
scenes, partial people, low lighting, and cluttered backgrounds.

The original Roboflow VOC export names its only class `0`; the evaluator maps
both `0` and `person` to the person class. The first diagnostic test run exposed
this label encoding and was discarded before metrics were accepted.

## 4. Test results

Operating confidence is `0.10`, cross-scan NMS is `0.50`, containment is
`0.95`, minimum frame-area ratio is `0.001`, and metric matching uses IoU
`0.50`.

| Method | TP | FP | FN | Precision | Recall | F1 | AP50 | mAP50–95 | Count MAE | ms/image | FPS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline single scale | 76 | 51 | 980 | 0.5984 | 0.0720 | 0.1285 | 0.0619 | 0.0283 | 7.0000 | 161.35 | 6.20 |
| Core multi-scale | 155 | 137 | 901 | 0.5308 | 0.1468 | 0.2300 | 0.1166 | 0.0473 | 5.8346 | 821.26 | 1.22 |

Speed was measured after one excluded warm-up inference on an AMD Ryzen 7
5700X 8-Core Processor, Windows 10 Pro build 26300, Python 3.14.2, OpenCV
4.12.0, and NumPy 2.5.5.

### Interpretation

The core method improves F1 by 79.0%, AP50 by 88.5%, and count MAE by 1.1654
people per image over the single-scale baseline. It finds 79 additional true
positives, with 86 additional false positives, and is about 5.1× slower.
Recall remains only 14.68%, so this is a measurable improvement rather than a
claim of production-ready accuracy.

## 5. Error analysis

Every test image contains at least one unmatched ground-truth or prediction.
The evaluator categorizes all 133 failed images and produces a diverse 12-image
visual gallery. Blue boxes are ground truth; green boxes are predictions.

| Primary cause | Images |
| --- | ---: |
| Viewpoint and scale / small people | 55 |
| Occlusion and clutter | 36 |
| Missed detection / low confidence | 15 |
| Lighting / low light | 13 |
| Viewpoint / partial person at frame edge | 11 |
| Look-alike background false positive | 3 |

The biggest cause is scale: many people occupy only a small fraction of a
640×640 CCTV frame. Crowding is second; overlapping people merge visually and
are poorly represented by a generic COCO detector.

## 6. Improvement plan

1. **Small/far people (55):** retain tiling, add a center/high-density crop,
   train with small-person examples, and report small-object recall separately.
2. **Occlusion/clutter (36):** collect crowded phone-camera scenes and compare
   a crowd-focused detector at higher input resolution.
3. **Low-confidence misses (15):** tune only on validation and collect local
   deployment images instead of repeatedly adjusting against the test set.
4. **Low light (13):** add exposure/contrast augmentation and evaluate optional
   CLAHE based on cause-specific recall, not appearance alone.
5. **Partial people (11):** add crop/cutout augmentation and accept edge boxes
   only after temporal persistence.
6. **Look-alikes (3):** require pose or multi-frame persistence and add those
   backgrounds as hard negatives.

The next checkpoint should also reduce crop passes or schedule them only when
the full-frame confidence is low, because the current 1.22 FPS is not adequate
for real-time mobile use.

## 7. Reproduction

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m unittest tests.test_pipeline -v
node tests/static_smoke.test.mjs
python src/run.py --input data/test/images --output outputs/run
python src/evaluate.py --output outputs/milestone3
```

The evaluator writes `summary.json`, `per_image_results.csv`, `failures.csv`,
`failure_counts.json`, `EVALUATION_REPORT.md`, `IMPROVEMENT_PLAN.md`, and the
annotated failure gallery.
