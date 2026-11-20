# Milestone 3 — core implementation and testing

This file maps the checkpoint rubric to reproducible repository evidence.

## Definition of done

- [x] `src/run.py` takes an image, folder, video, or webcam from raw input to visible annotated output without manual processing.
- [x] The main method is one staged pipeline: `preprocess → infer → postprocess → render` in `src/pipeline.py`.
- [x] `src/run.py` and `src/evaluate.py` import the same `preprocess()` function and the same `PersonPipeline` implementation.
- [x] The core multi-scale method is compared with the single-scale baseline on the same locked source-grouped test set.
- [x] `src/evaluate.py` reproduces precision, recall, F1, AP50, mAP50–95, count MAE, ms/image, and FPS.
- [x] Speed excludes one warm-up inference and records the test machine in the report.
- [x] `outputs/milestone3_final/failures/` contains 12 annotated failures; `failures.csv` categorizes all 133 failed test images.
- [x] `IMPROVEMENT_PLAN.md` is generated from the observed failure counts.
- [x] Unit and static smoke tests cover preprocessing, duplicate fusion, temporal persistence, and browser assets.
- [x] The exact submission commit is tagged `cp3-core`.

## One-command examples

```powershell
python src/run.py --input data/test/images --output outputs/run
python src/run.py --input demo.mp4 --output outputs/demo_annotated.mp4
python src/run.py --webcam 0 --output outputs/webcam.mp4
python src/evaluate.py --output outputs/milestone3
```

## Fixed parameters

The confidence threshold was selected on the committed validation subset before
the held-out test was run. The locked test settings are:

- confidence: `0.20`
- cross-scan NMS IoU: `0.45`
- metric matching IoU: `0.50`
- detector input: letterboxed RGB `640 × 640`, float32 NCHW
- core scans: one full frame plus four overlapping `64%` crops
- video count smoothing: five-frame modal window, three-frame persistence

## Evidence map

| Evidence | Path |
| --- | --- |
| Runnable pipeline | `src/run.py`, `src/pipeline.py` |
| Reproducible evaluator | `src/evaluate.py` |
| Locked test manifest | `data/test/manifest.csv` |
| Full metric summary | `outputs/milestone3_final/summary.json` |
| Per-image log | `outputs/milestone3_final/per_image_results.csv` |
| Failure log and counts | `outputs/milestone3_final/failures.csv`, `failure_counts.json` |
| Failure gallery | `outputs/milestone3_final/failures/` |
| Improvement plan | `outputs/milestone3_final/IMPROVEMENT_PLAN.md` |
| Written analysis | `reports/MILESTONE_3_REPORT.md` |
| In-class procedure | `reports/MILESTONE_3_DEMO.md` |
| Automated checks | `tests/test_pipeline.py`, `tests/static_smoke.test.mjs` |

## Honest limitation

The test split is difficult, dominated by small and crowded CCTV people. The
core method improves on the baseline but does not yet meet production accuracy
or real-time CPU speed. This limitation is part of the checkpoint evidence, not
hidden or tuned away.
