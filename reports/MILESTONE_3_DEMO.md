# Milestone 3 in-class demo checklist

## Before class

- Activate `.venv` and confirm `python src/run.py --help` works.
- Keep the repository at tag `cp3-core` with no uncommitted changes.
- Download the three unseen teacher inputs into `demo_inputs/`.
- If a video is supplied, confirm its extension is MP4, MOV, AVI, MKV, or WebM.
- Keep the laptop charged; the core CPU method runs around 1.35 FPS on the test machine.

## One-command run

For images:

```powershell
python src/run.py --input demo_inputs --output outputs/class_demo
```

For a video:

```powershell
python src/run.py --input demo.mp4 --output outputs/demo_annotated.mp4
```

For the camera:

```powershell
python src/run.py --webcam 0 --output outputs/webcam.mp4
```

## What each stage outputs

- `preprocess()` → RGB float32 tensor shaped `1 × 3 × 640 × 640` plus letterbox metadata.
- backend `infer()` → person candidate boxes and confidence scores.
- `postprocess()` → confidence/geometry-filtered, cross-scan deduplicated boxes.
- `render()` → annotated BGR frame with person labels, count, and FPS.
- video smoother → confirmed count after a five-frame modal window and three-frame persistence.

## Threshold answers

- Confidence `0.20` was chosen on validation because it improved validation F1 and count MAE over `0.25`.
- NMS `0.45` merges duplicate boxes from overlapping scans.
- Evaluation IoU `0.50` is stated and held constant for both methods.
- The test split was not used to choose these parameters.

## Likely failure explanation

If a distant person is missed: after the entire scene is reduced to 640×640,
the person covers too few feature-map cells. Tiles help by enlarging the person,
but heavy occlusion and very small scale can still leave insufficient person
features above confidence 0.20.

If an object is counted as a person: the generic COCO detector produced a
person-class score above threshold from a person-like shape. Geometry and NMS
cannot prove human structure; pose verification or temporal persistence is the
next targeted control.

## Half-resolution answer

At half the source resolution, small people lose detail before letterboxing,
so recall should fall most strongly on the 55 scale-related failures. Speed may
improve at capture/decoding, but the detector still computes a 640×640 tensor.
