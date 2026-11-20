# Milestone 4 - 80% checkpoint evidence map

## Definition of done

- [x] One application exposes the main pipeline: `src/gradio_app.py`.
- [x] Overlay, confidence, count, and processing time are visible; model is cached once.
- [x] 12 cases are recorded in `tests/milestone4_test_cases.csv`; 10 are hard cases.
- [x] `src/evaluate.py` reproduces all report values from the locked test split.
- [x] Main/condition metrics, model hash/size, warm-up speed, and confusion matrix are committed.
- [x] Limitations have examples and measured causes in `docs/LIMITATIONS.md`.
- [x] Editable DOCX report and PPTX slides are committed under `reports/`.
- [x] A generated backup demonstration MP4 is committed; a narrated team recording remains scheduled.
- [x] Remaining work has owners and target dates in `docs/remaining.md`.
- [x] This exact validated checkpoint is committed and tagged `cp4-80`.

## Exact evaluator command

```powershell
python src/evaluate.py --split test --weights evaluation/models/object_detection_yolox_2022nov_int8.onnx --output outputs/milestone4_final
```

Expected current F1: `0.229970`; AP50: `0.116628`; mAP50-95: `0.047321`; count MAE: `5.834586`.
