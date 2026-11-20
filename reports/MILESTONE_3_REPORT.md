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

The confidence threshold was selected using the committed 30-image validation
subset. At `0.20`, validation core F1 was 0.2462 and count MAE was 5.2667,
compared with F1 0.2231 and MAE 5.4333 at `0.25`. After fixing `0.20`, no test
parameter was changed.

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

Operating confidence is `0.20`, cross-scan NMS is `0.45`, and metric matching
uses IoU `0.50`.

| Method | TP | FP | FN | Precision | Recall | F1 | AP50 | mAP50–95 | Count MAE | ms/image | FPS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline single scale | 38 | 12 | 1,018 | 0.7600 | 0.0360 | 0.0687 | 0.0353 | 0.0184 | 7.5789 | 141.28 | 7.08 |
| Core multi-scale | 105 | 51 | 951 | 0.6731 | 0.0994 | 0.1733 | 0.0849 | 0.0357 | 6.7970 | 738.54 | 1.35 |

Speed was measured after one excluded warm-up inference on an AMD Ryzen 7
5700X 8-Core Processor, Windows 10 Pro build 26300, Python 3.14.2, OpenCV
4.12.0, and NumPy 2.5.5.

### Interpretation

The core method more than doubles F1 and AP50 and reduces count MAE by 0.7819
people per image. The gain comes from 67 additional true positives. It also
adds 39 false positives and is about 5.2× slower. Recall remains only 9.94%, so
this checkpoint demonstrates an integrated method and honest failure analysis,
not production-ready accuracy.

## 5. Error analysis

Every test image contains at least one unmatched ground-truth or prediction.
The evaluator categorizes all 133 failed images and produces a diverse 12-image
visual gallery. Blue boxes are ground truth; green boxes are predictions.

| Primary cause | Images |
| --- | ---: |
| Viewpoint and scale / small people | 55 |
| Occlusion and clutter | 36 |
| Missed detection / low confidence | 16 |
| Lighting / low light | 13 |
| Viewpoint / partial person at frame edge | 11 |
| Look-alike background false positive | 2 |

The biggest cause is scale: many people occupy only a small fraction of a
640×640 CCTV frame. Crowding is second; overlapping people merge visually and
are poorly represented by a generic COCO detector.

## 6. Improvement plan

1. **Small/far people (55):** retain tiling, add a center/high-density crop,
   train with small-person examples, and report small-object recall separately.
2. **Occlusion/clutter (36):** collect crowded phone-camera scenes and compare
   a crowd-focused detector at higher input resolution.
3. **Low-confidence misses (16):** tune only on validation and collect local
   deployment images instead of repeatedly adjusting against the test set.
4. **Low light (13):** add exposure/contrast augmentation and evaluate optional
   CLAHE based on cause-specific recall, not appearance alone.
5. **Partial people (11):** add crop/cutout augmentation and accept edge boxes
   only after temporal persistence.
6. **Look-alikes (2):** require pose or multi-frame persistence and add those
   backgrounds as hard negatives.

The next checkpoint should also reduce crop passes or schedule them only when
the full-frame confidence is low, because the current 1.35 FPS is not adequate
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
