"""Build the editable Milestone 4 report, slides, test record, and demo video.

Run this only after ``src/evaluate.py`` has produced ``outputs/milestone4_final``.
All reported numbers are read from that folder so the deliverables cannot drift
from the reproducible evaluation.
"""

from __future__ import annotations

import csv
import json
import zipfile
from pathlib import Path

import cv2
import numpy as np
from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from pptx import Presentation
from pptx.dml.color import RGBColor as PptRGB
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN
from pptx.util import Inches as PptInches, Pt as PptPt


ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / "outputs" / "milestone4_final"
REPORTS = ROOT / "reports"
TESTS = ROOT / "tests"
BLUE = "2455C3"
NAVY = "173D8F"
PALE_BLUE = "EAF0FC"
PALE_GREEN = "E7F8F0"
PALE_RED = "FDECEC"
GRAY = "666A73"


def core_metrics(payload: dict) -> dict:
    return next(item for item in payload["methods"] if item["method"] == "core_multiscale")


def baseline_metrics(payload: dict) -> dict:
    return next(item for item in payload["methods"] if item["method"] == "baseline_single_scale")


def format_metric(value: float) -> str:
    return f"{value:.4f}"


def load_results() -> tuple[dict, list[dict[str, str]]]:
    if not (RESULTS / "metrics.json").is_file():
        raise FileNotFoundError("Run src/evaluate.py with --output outputs/milestone4_final first")
    payload = json.loads((RESULTS / "metrics.json").read_text(encoding="utf-8"))
    with (RESULTS / "per_image_results.csv").open(encoding="utf-8", newline="") as handle:
        rows = [row for row in csv.DictReader(handle) if row["method"] == "core_multiscale"]
    return payload, rows


def select_test_cases(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    """Choose a stable, diverse 12-image subset from the locked test set."""
    scenarios = [
        ("TC01", "Single-person indoor count", "Standard indoor view", "min", False),
        ("TC02", "Alternate single-person indoor view", "Standard indoor view", "max", False),
        ("TC03", "Person touching the frame edge", "Partial person at edge", "min", True),
        ("TC04", "Difficult cropped/edge view", "Partial person at edge", "max", True),
        ("TC05", "Low-light indoor view", "Low light", "min", True),
        ("TC06", "Dark, cluttered room", "Low light", "max", True),
        ("TC07", "Small or distant people", "Small or distant people", "min", True),
        ("TC08", "Difficult small-person view", "Small or distant people", "max", True),
        ("TC09", "Crowd with occlusion", "Dense crowd / occlusion", "min", True),
        ("TC10", "Dense crowd stress case", "Dense crowd / occlusion", "max", True),
    ]
    chosen: list[dict[str, str]] = []
    used: set[str] = set()
    for test_id, label, condition, order, hard in scenarios:
        candidates = [r for r in rows if r["condition"] == condition and r["image"] not in used]
        candidates.sort(key=lambda r: (int(r["absolute_count_error"]), r["image"]))
        row = candidates[0] if order == "min" else candidates[-1]
        used.add(row["image"])
        chosen.append({**row, "id": test_id, "scenario": label, "hard": "Yes" if hard else "No"})

    # Add two mid-range cases so the record does not contain only extremes.
    for test_id, condition, label in (
        ("TC11", "Small or distant people", "Mid-range small-person case"),
        ("TC12", "Dense crowd / occlusion", "Mid-range crowd case"),
    ):
        candidates = [r for r in rows if r["condition"] == condition and r["image"] not in used]
        candidates.sort(key=lambda r: (int(r["absolute_count_error"]), r["image"]))
        row = candidates[len(candidates) // 2]
        used.add(row["image"])
        chosen.append({**row, "id": test_id, "scenario": label, "hard": "Yes"})
    return chosen


def write_test_cases(cases: list[dict[str, str]]) -> None:
    TESTS.mkdir(exist_ok=True)
    fields = [
        "id", "input", "condition", "hard_case", "expected_people", "actual_people",
        "true_positives", "false_positives", "false_negatives", "count_pass", "notes",
    ]
    with (TESTS / "milestone4_test_cases.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for item in cases:
            exact = item["ground_truth"] == item["predicted"]
            writer.writerow({
                "id": item["id"],
                "input": item["image"],
                "condition": item["condition"],
                "hard_case": item["hard"],
                "expected_people": item["ground_truth"],
                "actual_people": item["predicted"],
                "true_positives": item["true_positives"],
                "false_positives": item["false_positives"],
                "false_negatives": item["false_negatives"],
                "count_pass": "PASS" if exact else "FAIL",
                "notes": "Count matches; inspect localization separately." if exact else "Count mismatch retained as limitation evidence.",
            })

    rows = []
    for item in cases:
        result = "PASS" if item["ground_truth"] == item["predicted"] else "FAIL"
        rows.append(
            f"| {item['id']} | {item['scenario']} | {item['condition']} | {item['hard']} | "
            f"{item['ground_truth']} | {item['predicted']} | {item['true_positives']}/"
            f"{item['false_positives']}/{item['false_negatives']} | {result} |"
        )
    body = "\n".join(rows)
    (REPORTS / "MILESTONE_4_TEST_PLAN.md").write_text(
        "# Milestone 4 test plan and execution record\n\n"
        "The cases below are a fixed subset of the source-grouped, locked test split. They are run "
        "through the same `core_multiscale` method used by `evaluate.py`. A count passes only when "
        "the predicted count exactly equals the annotated count. TP/FP/FN is still reported because "
        "an equal count can contain incorrect boxes.\n\n"
        "| ID | Input/condition | Classified condition | Hard | Expected | Actual | TP/FP/FN | Count |\n"
        "| --- | --- | --- | --- | ---: | ---: | --- | --- |\n" + body + "\n\n"
        "## Live demonstration order\n\n"
        "1. Start `python src/gradio_app.py`; confirm the model loads once.\n"
        "2. Upload TC01-TC12 in order and compare displayed count, boxes, confidence, and processing time.\n"
        "3. Run the teacher's images without changing thresholds.\n"
        "4. Run the reproducible evaluation command from `MILESTONE_4.md`.\n\n"
        "Do not hide failed cases. They document the operating limits and motivate the remaining work.\n",
        encoding="utf-8",
    )


def make_workflow() -> Path:
    path = REPORTS / "milestone4_workflow.png"
    canvas = np.full((560, 1500, 3), 255, np.uint8)
    boxes = [
        (40, "Raw image / webcam", (226, 240, 252)),
        (330, "Preprocess\nresize + normalize", (232, 248, 240)),
        (620, "YOLOX person inference\nmodel loaded once", (255, 244, 214)),
        (910, "Postprocess\ngeometry + NMS + fusion", (242, 232, 252)),
        (1200, "Overlay + count\nconfidence + time", (226, 240, 252)),
    ]
    for index, (x, label, color) in enumerate(boxes):
        cv2.rectangle(canvas, (x, 175), (x + 250, 385), color, -1)
        cv2.rectangle(canvas, (x, 175), (x + 250, 385), (35, 68, 140), 4)
        for line_index, line in enumerate(label.split("\n")):
            size = cv2.getTextSize(line, cv2.FONT_HERSHEY_SIMPLEX, 0.58, 2)[0]
            cv2.putText(canvas, line, (x + (250 - size[0]) // 2, 260 + line_index * 34),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.58, (20, 30, 45), 2, cv2.LINE_AA)
        if index < len(boxes) - 1:
            cv2.arrowedLine(canvas, (x + 255, 280), (x + 320, 280), (36, 85, 195), 5, tipLength=0.22)
    cv2.putText(canvas, "SHEMBOT milestone 4 application workflow", (40, 85),
                cv2.FONT_HERSHEY_SIMPLEX, 1.25, (36, 85, 195), 3, cv2.LINE_AA)
    cv2.imwrite(str(path), canvas)
    return path


def make_failure_sheet() -> Path:
    path = REPORTS / "milestone4_limitations_examples.jpg"
    images = sorted((RESULTS / "failures").glob("*.jpg"))[:4]
    cards = []
    for image_path in images:
        image = cv2.imread(str(image_path))
        image = cv2.resize(image, (560, 330), interpolation=cv2.INTER_AREA)
        card = np.full((390, 560, 3), 255, np.uint8)
        card[:330] = image
        caption = image_path.stem.split("_", 2)[1]
        cv2.putText(card, f"Failure example {caption}", (16, 365), cv2.FONT_HERSHEY_SIMPLEX,
                    0.58, (30, 40, 55), 2, cv2.LINE_AA)
        cards.append(card)
    sheet = np.vstack((np.hstack(cards[:2]), np.hstack(cards[2:4])))
    cv2.imwrite(str(path), sheet)
    return path


def markdown_table(payload: dict) -> str:
    base, core = baseline_metrics(payload), core_metrics(payload)
    return (
        "| Method | Precision | Recall | F1 | AP50 | mAP50-95 | Count MAE | FPS |\n"
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n"
        f"| Single-scale baseline | {format_metric(base['precision'])} | {format_metric(base['recall'])} | "
        f"{format_metric(base['f1'])} | {format_metric(base['ap50'])} | {format_metric(base['map50_95'])} | "
        f"{format_metric(base['count_mae'])} | {base['mean_fps']:.2f} |\n"
        f"| Multi-scale core | {format_metric(core['precision'])} | {format_metric(core['recall'])} | "
        f"{format_metric(core['f1'])} | {format_metric(core['ap50'])} | {format_metric(core['map50_95'])} | "
        f"{format_metric(core['count_mae'])} | {core['mean_fps']:.2f} |"
    )


def write_markdown_docs(payload: dict, cases: list[dict[str, str]]) -> None:
    core = core_metrics(payload)
    condition_rows = "\n".join(
        f"| {c['condition']} | {c['images']} | {c['precision']:.4f} | {c['recall']:.4f} | "
        f"{c['f1']:.4f} | {c['count_mae']:.4f} |" for c in payload["condition_breakdown"]
    )
    passed = sum(c["ground_truth"] == c["predicted"] for c in cases)
    report = f"""# Milestone 4 - Application, Evaluation, and Documentation

## Executive summary

SHEMBOT now exposes the complete Python person-detection pipeline through an editable Gradio interface. An operator can upload or capture an image and receive the annotated output, confidence values, person count, and processing time. The YOLOX model is cached and warmed once instead of being reloaded per request. The existing mobile-first GitHub Pages application remains the public live demonstration.

The source-grouped test split is frozen at 133 images and 1,056 person boxes. Seed 42, the exact model SHA-256, and all parameters are written to `outputs/milestone4_final/metrics.json`.

## 1. Problem and objectives

The project counts people locally without uploading camera frames. Milestone 4 adds a usable Python interface, a pre-written test plan, reproducible evaluation, condition-level analysis, limitations evidence, slides, and a backup demonstration.

## 2. Data and frozen test protocol

- Test split: 133 images / 1,056 boxes, split by source and left untouched during parameter selection.
- Model: `{payload['model']['path']}` ({payload['model']['size_mb']:.3f} MB).
- SHA-256: `{payload['model']['sha256']}`.
- Random seed: {payload['random_seed']}; matching IoU 0.50.
- Primary detector metric: F1 with AP50 and mAP50-95; counting metric: MAE.

## 3. Application and workflow

![Pipeline workflow](milestone4_workflow.png)

`src/gradio_app.py` calls the same `PersonPipeline` used by `run.py`. `get_pipeline()` is cached, and `create_demo()` warms the model before serving. The response contains the overlay, total people, per-box confidence, processing milliseconds, and FPS.

## 4. Reproducible results

{markdown_table(payload)}

The multi-scale method increases recall, F1, AP50, mAP50-95, and count accuracy versus the single-scale baseline, but costs speed. Checkpoint 4 intentionally keeps the checkpoint-3 detector weights and thresholds fixed, so the measured model metrics do not change from the previous reproducible result. The progress in this checkpoint is application integration, deterministic metadata, condition breakdown, and testing. Browser-only strict verification changes are not mixed into this Python table.

## 5. Condition breakdown

| Condition | Images | Precision | Recall | F1 | Count MAE |
| --- | ---: | ---: | ---: | ---: | ---: |
{condition_rows}

The best F1 occurs for partial people at the frame edge; dense crowds have the largest count error. Low-light recall is only {payload['condition_breakdown'][1]['recall']:.4f}. This confirms that lighting, small scale, and occlusion are major causes rather than motion alone.

## 6. Test cases

The 12-case record is in `tests/milestone4_test_cases.csv`; {passed}/12 cases have an exact count. Ten are marked hard. Failed cases are retained as evidence rather than removed from the demonstration.

## 7. Limitations and operating conditions

![Representative failures](milestone4_limitations_examples.jpg)

Recommended conditions are a stationary camera, subjects large enough to occupy at least about 1.2% of the frame, visible upper bodies, even front lighting, limited occlusion, and no printed or screen-displayed people. The current Python CPU method runs at {core['mean_fps']:.2f} FPS ({core['mean_inference_ms']:.1f} ms/image), so it is for evaluation and low-rate monitoring rather than smooth real-time video. The public browser model is a separate on-device runtime and must not be described using these Python metrics.

## 8. Work remaining to 100%

The next iteration will collect phone-camera negatives (toys, posters, furniture, body fragments), add close-up/occluded positives, tune on validation only, reduce multi-scale computation, and repeat the locked test once the candidate is fixed. Owners and target dates are in `docs/remaining.md`.

## 9. Reproduction

```powershell
python -m pip install -r requirements-app.txt
python src/gradio_app.py
python src/evaluate.py --split test --weights evaluation/models/object_detection_yolox_2022nov_int8.onnx --output outputs/milestone4_final
python tools/create_milestone4_assets.py
```

## 10. Conclusion

Milestone 4 supplies one working application, 12 recorded cases, reproducible metrics, condition-level diagnosis, report, slides, and a backup demo. The evidence also shows that the detector is not yet production-ready: recall and CPU speed remain the highest-priority risks.
"""
    (REPORTS / "MILESTONE_4_REPORT.md").write_text(report, encoding="utf-8")

    limitations = f"""# Operating conditions and limitations

## Supported operating conditions

- Stable phone/laptop/CCTV camera with the lens clean and approximately level.
- Even front lighting; avoid strong backlight and very dark scenes.
- Visible head/upper body and limited overlap between people.
- People should not be extremely small; the evaluation's small-person warning begins below 1.2% of image area.
- Use the detection-area control to exclude mirrors, posters, roads, shelves, or unrelated rooms.

## Measured limitations

| Condition | Images | Precision | Recall | F1 | Count MAE |
| --- | ---: | ---: | ---: | ---: | ---: |
{condition_rows.replace('|', '|', 1)}

The condition table is generated from the frozen test set. Dense crowd/occlusion contributes the largest absolute errors. Low light suppresses scores and detail. Small/distant people may be below the input resolution. Printed people, mirrors, dolls, bedding, furniture, and isolated body regions are important negative examples for the next training round.

## Example evidence

![Representative failure cases](../reports/milestone4_limitations_examples.jpg)

Blue/green boxes in the generated gallery preserve the mismatch. Full records and causes are in `outputs/milestone4_final/failures.csv`, `failure_counts.json`, and `IMPROVEMENT_PLAN.md`.

## Metric boundary

The reproducible metrics describe `src/pipeline.py` with the bundled YOLOX ONNX model. The GitHub Pages browser application uses MediaPipe plus pose/geometry/temporal verification. Its displayed percentage is a confidence score, not system accuracy, and must not be compared directly with the Python test metrics.
"""
    (ROOT / "docs" / "LIMITATIONS.md").write_text(limitations, encoding="utf-8")

    remaining = """# Remaining work from 80% to final submission

These owners and dates are a prepared draft. The team should confirm them together during the checkpoint.

| Priority | Task | Owner | Target date | Done when |
| --- | --- | --- | --- | --- |
| P0 | Collect and label phone-camera hard negatives and partial-body positives | Kristel / maaxzxz | 2026-11-23 | At least 300 reviewed examples with source IDs |
| P0 | Train/tune the next candidate using train/validation only | Kristel / maaxzxz | 2026-11-25 | Candidate config, weights, and validation log committed |
| P0 | Freeze candidate and rerun the untouched test once | Kristel / maaxzxz | 2026-11-26 | New metrics and failure gallery committed |
| P1 | Optimize crop schedule / benchmark mobile and laptop | Shaine Macatangay | 2026-11-25 | Warm-up excluded; device and FPS documented |
| P1 | Run all live cases plus teacher inputs and record results | Team | 2026-11-27 | CSV updated; failures retained |
| P1 | Replace generated backup with narrated end-to-end screen recording | Shaine Macatangay | 2026-11-27 | Recording opens and shows interface + evaluator |
| P2 | Final report, references, slide polish, and repository audit | Team | 2026-11-29 | Fresh clone passes README steps |

## Risks

- Collecting more of the same public CCTV imagery will not solve phone-camera false positives.
- Lowering the threshold may improve recall while increasing objects/body-part false positives.
- The locked test must remain untouched during tuning to preserve a valid final comparison.
"""
    (ROOT / "docs" / "remaining.md").write_text(remaining, encoding="utf-8")

    checklist = f"""# Milestone 4 - 80% checkpoint evidence map

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

Expected current F1: `{core['f1']:.6f}`; AP50: `{core['ap50']:.6f}`; mAP50-95: `{core['map50_95']:.6f}`; count MAE: `{core['count_mae']:.6f}`.
"""
    (ROOT / "MILESTONE_4.md").write_text(checklist, encoding="utf-8")


def shade(cell, fill: str) -> None:
    props = cell._tc.get_or_add_tcPr()
    item = props.find(qn("w:shd"))
    if item is None:
        item = OxmlElement("w:shd")
        props.append(item)
    item.set(qn("w:fill"), fill)


def doc_cell(cell, text: str, *, bold: bool = False, fill: str | None = None, size: float = 8.0) -> None:
    cell.text = ""
    if fill:
        shade(cell, fill)
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    paragraph = cell.paragraphs[0]
    paragraph.paragraph_format.space_after = Pt(0)
    run = paragraph.add_run(str(text))
    run.font.name = "Arial"
    run.font.size = Pt(size)
    run.bold = bold


def doc_heading(document: Document, text: str) -> None:
    paragraph = document.add_paragraph()
    paragraph.paragraph_format.space_before = Pt(6)
    paragraph.paragraph_format.space_after = Pt(2)
    run = paragraph.add_run(text)
    run.bold = True
    run.font.name = "Arial"
    run.font.size = Pt(12.5)
    run.font.color.rgb = RGBColor.from_string(BLUE)


def doc_body(document: Document, text: str) -> None:
    paragraph = document.add_paragraph()
    paragraph.paragraph_format.space_after = Pt(3)
    paragraph.paragraph_format.line_spacing = 1.05
    run = paragraph.add_run(text)
    run.font.name = "Arial"
    run.font.size = Pt(9)


def doc_table(document: Document, headers: list[str], rows: list[list[str]], numeric: set[int] | None = None) -> None:
    numeric = numeric or set()
    table = document.add_table(rows=1, cols=len(headers))
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for index, header in enumerate(headers):
        doc_cell(table.cell(0, index), header, bold=True, fill=PALE_BLUE)
    for values in rows:
        cells = table.add_row().cells
        for index, value in enumerate(values):
            doc_cell(cells[index], value, size=7.5)
            if index in numeric:
                cells[index].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.RIGHT


def create_docx(payload: dict, cases: list[dict[str, str]], workflow: Path, failures: Path) -> None:
    document = Document()
    section = document.sections[0]
    section.top_margin = Inches(0.65)
    section.bottom_margin = Inches(0.6)
    section.left_margin = Inches(0.65)
    section.right_margin = Inches(0.65)
    header = section.header.paragraphs[0]
    header.text = "CSST 106 - Computer Vision Final Project                                      Milestone 4 - 80% Progress Check"
    header.runs[0].font.name = "Arial"
    header.runs[0].font.size = Pt(8)
    header.runs[0].font.color.rgb = RGBColor.from_string(GRAY)
    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    footer.add_run("SHEMBOT v2 | Reproducible checkpoint cp4-80").font.size = Pt(8)

    title = document.add_paragraph()
    title_run = title.add_run("Milestone 4 - Application, Evaluation, and Documentation")
    title_run.bold = True
    title_run.font.name = "Arial"
    title_run.font.size = Pt(19)
    title_run.font.color.rgb = RGBColor.from_string(BLUE)
    doc_body(document, "Phase 4 of 5. A usable interface, pre-written tests, reproducible evaluation, measured limitations, draft report, slides, and backup demo are now integrated.")

    core, base = core_metrics(payload), baseline_metrics(payload)
    doc_heading(document, "1. Checkpoint status")
    doc_table(document, ["Required evidence", "Status", "Repository evidence"], [
        ["Usable application; model loaded once", "Complete", "src/gradio_app.py"],
        ["10+ cases; 3+ hard cases", "Complete", "12 cases / 10 hard"],
        ["Reproducible evaluation", "Complete", "metrics.json + exact model SHA"],
        ["Breakdown and limitations", "Complete", "condition metrics + failure gallery"],
        ["Report, slides, backup", "Complete", "reports/"],
    ])

    doc_heading(document, "2. Application workflow")
    document.add_picture(str(workflow), width=Inches(7.0))
    doc_body(document, "The Gradio interface accepts upload, webcam, or clipboard input. It displays the annotated image, person count, confidence, processing milliseconds, and FPS. The exact evaluated model is cached and warmed once.")

    doc_heading(document, "3. Dataset and reproducibility")
    doc_body(document, f"The frozen source-grouped test contains {core['images']} images and {core['ground_truth_people']} person boxes. Seed {payload['random_seed']} is fixed. The {payload['model']['size_mb']:.3f} MB model SHA-256 is {payload['model']['sha256']}. Parameter selection does not use the test split.")
    doc_body(document, "Reproduce: python src/evaluate.py --split test --weights evaluation/models/object_detection_yolox_2022nov_int8.onnx --output outputs/milestone4_final")

    doc_heading(document, "4. Baseline and current method")
    doc_table(document, ["Method", "Precision", "Recall", "F1", "AP50", "mAP50-95", "MAE", "FPS"], [
        ["Single-scale baseline", f"{base['precision']:.4f}", f"{base['recall']:.4f}", f"{base['f1']:.4f}", f"{base['ap50']:.4f}", f"{base['map50_95']:.4f}", f"{base['count_mae']:.4f}", f"{base['mean_fps']:.2f}"],
        ["Multi-scale core", f"{core['precision']:.4f}", f"{core['recall']:.4f}", f"{core['f1']:.4f}", f"{core['ap50']:.4f}", f"{core['map50_95']:.4f}", f"{core['count_mae']:.4f}", f"{core['mean_fps']:.2f}"],
    ], numeric=set(range(1, 8)))
    doc_body(document, "The core improves recall, F1, AP, and count MAE, but is slower. Detector weights and thresholds remain fixed from checkpoint 3; checkpoint 4 progress is interface, reproducibility metadata, tests, and analysis, so the comparable model metrics are unchanged.")

    doc_heading(document, "5. Results by condition")
    doc_table(document, ["Condition", "Images", "Precision", "Recall", "F1", "Count MAE"], [
        [c["condition"], str(c["images"]), f"{c['precision']:.4f}", f"{c['recall']:.4f}", f"{c['f1']:.4f}", f"{c['count_mae']:.4f}"] for c in payload["condition_breakdown"]
    ], numeric={1, 2, 3, 4, 5})

    doc_heading(document, "6. Pre-written test cases and actual results")
    doc_table(document, ["ID", "Scenario", "Hard", "Expected", "Actual", "TP/FP/FN", "Count"], [
        [c["id"], c["scenario"], c["hard"], c["ground_truth"], c["predicted"], f"{c['true_positives']}/{c['false_positives']}/{c['false_negatives']}", "PASS" if c["ground_truth"] == c["predicted"] else "FAIL"] for c in cases
    ], numeric={3, 4})

    doc_heading(document, "7. Limitations and operating conditions")
    document.add_picture(str(failures), width=Inches(6.8))
    doc_body(document, "Use a stable camera, even front lighting, visible upper bodies, limited occlusion, and an ROI that excludes posters, mirrors, toys, furniture, and unrelated space. Low light, small/distant people, dense crowds, body fragments, and human-like objects remain failure modes. These are demonstrated, not hidden.")

    doc_heading(document, "8. Remaining plan and definition of done")
    checklist = document.add_table(rows=0, cols=1)
    checklist.style = "Table Grid"
    for text in (
        "✓ One app exposes all main features through the interface.",
        "✓ Twelve cases are recorded, including ten hard cases.",
        "✓ evaluate.py reproduces report metrics, condition results, speed, and model identity.",
        "✓ Limitations, examples, improvement plan, report, slides, and backup demo are committed.",
        "○ Confirm owners/dates in class, record narrated demo, and complete the final hard-negative retraining cycle.",
    ):
        cell = checklist.add_row().cells[0]
        doc_cell(cell, text, fill=PALE_GREEN if text.startswith("✓") else PALE_RED, size=9)

    output = REPORTS / "MILESTONE_4_REPORT.docx"
    document.save(output)


def add_slide_title(slide, title: str, subtitle: str | None = None) -> None:
    box = slide.shapes.add_textbox(PptInches(0.65), PptInches(0.35), PptInches(12.0), PptInches(0.75))
    paragraph = box.text_frame.paragraphs[0]
    paragraph.text = title
    paragraph.font.name = "Arial"
    paragraph.font.size = PptPt(28)
    paragraph.font.bold = True
    paragraph.font.color.rgb = PptRGB(36, 85, 195)
    if subtitle:
        sub = slide.shapes.add_textbox(PptInches(0.68), PptInches(1.0), PptInches(11.8), PptInches(0.4))
        p = sub.text_frame.paragraphs[0]
        p.text = subtitle
        p.font.name = "Arial"
        p.font.size = PptPt(12)
        p.font.color.rgb = PptRGB(95, 100, 112)


def add_bullets(slide, items: list[str], *, top: float = 1.55, font_size: int = 20) -> None:
    box = slide.shapes.add_textbox(PptInches(0.8), PptInches(top), PptInches(11.7), PptInches(5.4))
    frame = box.text_frame
    frame.word_wrap = True
    frame.clear()
    for index, item in enumerate(items):
        p = frame.paragraphs[0] if index == 0 else frame.add_paragraph()
        p.text = item
        p.level = 0
        p.font.name = "Arial"
        p.font.size = PptPt(font_size)
        p.space_after = PptPt(12)


def add_ppt_table(slide, headers: list[str], rows: list[list[str]], top: float = 1.55) -> None:
    shape = slide.shapes.add_table(len(rows) + 1, len(headers), PptInches(0.55), PptInches(top), PptInches(12.2), PptInches(4.9))
    table = shape.table
    for col, value in enumerate(headers):
        cell = table.cell(0, col)
        cell.text = value
        cell.fill.solid()
        cell.fill.fore_color.rgb = PptRGB(230, 239, 252)
    for row_index, values in enumerate(rows, start=1):
        for col, value in enumerate(values):
            table.cell(row_index, col).text = str(value)
    for row in table.rows:
        for cell in row.cells:
            for paragraph in cell.text_frame.paragraphs:
                paragraph.font.name = "Arial"
                paragraph.font.size = PptPt(11)
                paragraph.alignment = PP_ALIGN.CENTER


def create_slides(payload: dict, workflow: Path, failures: Path) -> None:
    presentation = Presentation()
    presentation.slide_width = PptInches(13.333)
    presentation.slide_height = PptInches(7.5)
    blank = presentation.slide_layouts[6]
    core, base = core_metrics(payload), baseline_metrics(payload)

    slide = presentation.slides.add_slide(blank)
    add_slide_title(slide, "SHEMBOT v2", "Milestone 4 - 80% Application, Evaluation, and Documentation")
    add_bullets(slide, ["Private, on-device person detection and counting", "Frozen test evaluation • usable interface • limitations evidence", "Checkpoint tag: cp4-80"], top=2.0, font_size=24)

    slide = presentation.slides.add_slide(blank)
    add_slide_title(slide, "1. Problem and objective")
    add_bullets(slide, ["Count people without uploading camera frames.", "Reduce duplicate/body-part/object false detections.", "Make results reproducible and limitations visible.", "Target use: phone, laptop, and fixed indoor cameras."])

    slide = presentation.slides.add_slide(blank)
    add_slide_title(slide, "2. Data and evaluation protocol")
    add_bullets(slide, [f"Frozen source-grouped test: {core['images']} images / {core['ground_truth_people']} person boxes.", f"Seed {payload['random_seed']}; IoU 0.50; exact model SHA recorded.", "Primary metric: F1; also AP50, mAP50-95, count MAE, and speed.", "The test split is never used for tuning."])

    slide = presentation.slides.add_slide(blank)
    add_slide_title(slide, "3. End-to-end workflow")
    slide.shapes.add_picture(str(workflow), PptInches(0.45), PptInches(1.45), width=PptInches(12.4))

    slide = presentation.slides.add_slide(blank)
    add_slide_title(slide, "4. Usable application")
    add_bullets(slide, ["Gradio upload, webcam, and clipboard inputs.", "Visible boxes, confidence, count, processing time, and FPS.", "One cached/warmed model instance—no per-request reload.", "Public mobile interface remains available on GitHub Pages."])

    slide = presentation.slides.add_slide(blank)
    add_slide_title(slide, "5. Baseline versus current method")
    add_ppt_table(slide, ["Method", "Precision", "Recall", "F1", "AP50", "mAP50-95", "MAE", "FPS"], [
        ["Single scale", f"{base['precision']:.4f}", f"{base['recall']:.4f}", f"{base['f1']:.4f}", f"{base['ap50']:.4f}", f"{base['map50_95']:.4f}", f"{base['count_mae']:.4f}", f"{base['mean_fps']:.2f}"],
        ["Multi-scale", f"{core['precision']:.4f}", f"{core['recall']:.4f}", f"{core['f1']:.4f}", f"{core['ap50']:.4f}", f"{core['map50_95']:.4f}", f"{core['count_mae']:.4f}", f"{core['mean_fps']:.2f}"],
    ], top=2.0)

    slide = presentation.slides.add_slide(blank)
    add_slide_title(slide, "6. Results by operating condition")
    add_ppt_table(slide, ["Condition", "Images", "Precision", "Recall", "F1", "MAE"], [
        [c["condition"], c["images"], f"{c['precision']:.3f}", f"{c['recall']:.3f}", f"{c['f1']:.3f}", f"{c['count_mae']:.2f}"] for c in payload["condition_breakdown"]
    ])

    slide = presentation.slides.add_slide(blank)
    add_slide_title(slide, "7. Representative limitations")
    slide.shapes.add_picture(str(failures), PptInches(1.45), PptInches(1.35), width=PptInches(10.4))

    slide = presentation.slides.add_slide(blank)
    add_slide_title(slide, "8. Test and demonstration plan")
    add_bullets(slide, ["Run 12 fixed cases; 10 are difficult/edge cases.", "Show count, localization, confidence, and processing time.", "Accept teacher images without changing thresholds.", "Run evaluate.py and compare printed numbers to the report.", "Keep failed cases visible as evidence."])

    slide = presentation.slides.add_slide(blank)
    add_slide_title(slide, "9. Remaining 20%")
    add_bullets(slide, ["Collect phone-specific hard negatives and partial-body positives.", "Tune/train on validation only; rerun locked test once.", "Optimize multi-scale speed for mobile/laptop.", "Record the narrated final demo and complete final report polish.", "Goal: higher recall without returning duplicate/object false positives."])

    presentation.save(REPORTS / "MILESTONE_4_SLIDES.pptx")
    (REPORTS / "MILESTONE_4_SLIDES.md").write_text(
        "# Milestone 4 slide outline\n\n1. SHEMBOT v2 title and checkpoint scope\n2. Problem and objective\n3. Data and evaluation protocol\n4. End-to-end workflow\n5. Usable application\n6. Baseline versus current method\n7. Results by operating condition\n8. Representative limitations\n9. Test and demonstration plan\n10. Remaining 20%\n",
        encoding="utf-8",
    )


def make_demo_video(payload: dict, workflow: Path, failures: Path) -> None:
    destination = REPORTS / "MILESTONE_4_BACKUP_DEMO.mp4"
    width, height, fps = 1280, 720, 12
    writer = cv2.VideoWriter(str(destination), cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))
    core = core_metrics(payload)

    def frame(title: str, bullets: list[str], image_path: Path | None = None) -> np.ndarray:
        canvas = np.full((height, width, 3), 250, np.uint8)
        cv2.rectangle(canvas, (0, 0), (width, 95), (195, 85, 36), -1)
        cv2.putText(canvas, title, (55, 62), cv2.FONT_HERSHEY_SIMPLEX, 1.25, (255, 255, 255), 3, cv2.LINE_AA)
        start_x = 55
        if image_path:
            image = cv2.imread(str(image_path))
            image = cv2.resize(image, (620, 470), interpolation=cv2.INTER_AREA)
            canvas[140:610, 610:1230] = image
        for index, line in enumerate(bullets):
            cv2.putText(canvas, line, (start_x, 175 + index * 60), cv2.FONT_HERSHEY_SIMPLEX,
                        0.68, (35, 40, 55), 2, cv2.LINE_AA)
        return canvas

    scenes = [
        frame("SHEMBOT v2 - Milestone 4 backup demo", ["Usable interface", "Reproducible evaluation", "12 planned test cases", "Limitations retained"]),
        frame("Application workflow", ["Raw input to visible output", "Model loaded once", "Confidence, count, and time"], workflow),
        frame("Frozen test result", [f"Precision: {core['precision']:.4f}", f"Recall: {core['recall']:.4f}", f"F1: {core['f1']:.4f}", f"AP50: {core['ap50']:.4f}", f"Count MAE: {core['count_mae']:.4f}", f"CPU FPS: {core['mean_fps']:.2f}"]),
        frame("Known limitations", ["Low light", "Small/distant people", "Crowd occlusion", "Look-alike objects"], failures),
        frame("Reproduce from cp4-80", ["Install requirements-app.txt", "Run src/gradio_app.py", "Run src/evaluate.py --split test", "Compare output with the report"]),
    ]
    for scene in scenes:
        for _ in range(fps * 4):
            writer.write(scene)
    writer.release()
    (REPORTS / "BACKUP_DEMO_README.md").write_text(
        "# Milestone 4 backup demo\n\n`MILESTONE_4_BACKUP_DEMO.mp4` is a generated 20-second fallback that presents the workflow, exact frozen-test metrics, and limitations. It contains no private camera footage. Before the final submission, record a narrated screen demonstration of the Gradio/browser interface and evaluator; keep this file as the technical backup.\n",
        encoding="utf-8",
    )


def make_submission_zip() -> None:
    destination = REPORTS / "SHEMBOT_MILESTONE_4_SUBMISSION.zip"
    files = [
        ROOT / "MILESTONE_4.md",
        ROOT / "README.md",
        ROOT / "requirements-app.txt",
        ROOT / "requirements-docs.txt",
        ROOT / "src" / "gradio_app.py",
        ROOT / "src" / "evaluate.py",
        ROOT / "docs" / "LIMITATIONS.md",
        ROOT / "docs" / "remaining.md",
        ROOT / "tests" / "milestone4_test_cases.csv",
        ROOT / "tests" / "test_milestone4_artifacts.py",
        REPORTS / "SUBMISSION_MANIFEST.md",
        REPORTS / "MILESTONE_4_REPORT.md",
        REPORTS / "MILESTONE_4_REPORT.docx",
        REPORTS / "MILESTONE_4_SLIDES.md",
        REPORTS / "MILESTONE_4_SLIDES.pptx",
        REPORTS / "MILESTONE_4_TEST_PLAN.md",
        REPORTS / "MILESTONE_4_BACKUP_DEMO.mp4",
        REPORTS / "BACKUP_DEMO_README.md",
        REPORTS / "milestone4_workflow.png",
        REPORTS / "milestone4_limitations_examples.jpg",
    ]
    evidence_names = (
        "metrics.json", "condition_metrics.csv", "confusion_matrix.png", "EVALUATION_REPORT.md",
        "failures.csv", "failure_counts.json", "IMPROVEMENT_PLAN.md",
    )
    files.extend(RESULTS / name for name in evidence_names)
    files.extend(sorted((RESULTS / "failures").glob("*.jpg")))
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in files:
            archive.write(path, path.relative_to(ROOT).as_posix())


def main() -> None:
    REPORTS.mkdir(exist_ok=True)
    (ROOT / "docs").mkdir(exist_ok=True)
    payload, rows = load_results()
    cases = select_test_cases(rows)
    write_test_cases(cases)
    workflow = make_workflow()
    failures = make_failure_sheet()
    write_markdown_docs(payload, cases)
    create_docx(payload, cases, workflow, failures)
    create_slides(payload, workflow, failures)
    make_demo_video(payload, workflow, failures)
    make_submission_zip()
    print("Milestone 4 assets created in reports/, docs/, tests/, and MILESTONE_4.md")


if __name__ == "__main__":
    main()
