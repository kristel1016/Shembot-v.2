"""Create the editable Milestone 3 Word report from committed result files."""

from __future__ import annotations

import json
from pathlib import Path

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / "outputs" / "milestone3_final"
DESTINATION = ROOT / "reports" / "MILESTONE_3_REPORT.docx"


def shade(cell, fill: str) -> None:
    properties = cell._tc.get_or_add_tcPr()
    element = OxmlElement("w:shd")
    element.set(qn("w:fill"), fill)
    properties.append(element)


def set_cell_text(cell, text: str, bold: bool = False, color: str | None = None) -> None:
    cell.text = ""
    paragraph = cell.paragraphs[0]
    run = paragraph.add_run(text)
    run.bold = bold
    run.font.size = Pt(9)
    if color:
        run.font.color.rgb = RGBColor.from_string(color)


def add_heading(document: Document, text: str, level: int = 1) -> None:
    heading = document.add_heading(text, level=level)
    heading.paragraph_format.space_before = Pt(8)
    heading.paragraph_format.space_after = Pt(4)


def main() -> None:
    summary = json.loads((RESULTS / "summary.json").read_text(encoding="utf-8"))
    failures = json.loads((RESULTS / "failure_counts.json").read_text(encoding="utf-8"))
    baseline, core = summary["methods"]

    document = Document()
    section = document.sections[0]
    section.orientation = WD_ORIENT.LANDSCAPE
    section.page_width, section.page_height = section.page_height, section.page_width
    section.top_margin = Inches(0.55)
    section.bottom_margin = Inches(0.55)
    section.left_margin = Inches(0.65)
    section.right_margin = Inches(0.65)

    styles = document.styles
    styles["Normal"].font.name = "Aptos"
    styles["Normal"].font.size = Pt(9.5)
    styles["Title"].font.name = "Aptos Display"
    styles["Title"].font.size = Pt(26)
    styles["Title"].font.color.rgb = RGBColor(15, 82, 108)
    for name in ("Heading 1", "Heading 2"):
        styles[name].font.name = "Aptos Display"
        styles[name].font.color.rgb = RGBColor(15, 82, 108)

    title = document.add_paragraph(style="Title")
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title.add_run("SHEMBOT v2 — Milestone 3")
    subtitle = document.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = subtitle.add_run("Core implementation and testing · editable submission report")
    run.bold = True
    run.font.color.rgb = RGBColor(64, 75, 82)

    info = document.add_table(rows=2, cols=4)
    info.style = "Table Grid"
    labels = ["Team", "________________", "Course / section", "________________",
              "Members", "________________", "Repository tag", "cp3-core"]
    for cell, value in zip([cell for row in info.rows for cell in row.cells], labels):
        set_cell_text(cell, value, bold=value in {"Team", "Course / section", "Members", "Repository tag"})
        if value in {"Team", "Course / section", "Members", "Repository tag"}:
            shade(cell, "DDEBF7")

    add_heading(document, "Checkpoint outcome")
    document.add_paragraph(
        "The main person-detection method is integrated into a staged pipeline. One command accepts "
        "an image folder, image, video, or webcam and produces annotated output. The same preprocess, "
        "inference, postprocessing, and rendering code is imported by both run.py and evaluate.py."
    )

    stages = document.add_table(rows=1, cols=4)
    stages.style = "Table Grid"
    for cell, label in zip(stages.rows[0].cells, ("PREPROCESS", "INFER", "POSTPROCESS", "RENDER")):
        shade(cell, "0F526C")
        set_cell_text(cell, label, bold=True, color="FFFFFF")
    detail = stages.add_row().cells
    values = (
        "Letterbox 640×640; BGR→RGB; float32 NCHW",
        "YOLOX-S INT8; COCO person only; full frame + 4 crops",
        "Confidence 0.20; geometry filters; NMS 0.45; containment fusion",
        "Boxes, confidence, count, FPS, CSV; video persistence",
    )
    for cell, value in zip(detail, values):
        set_cell_text(cell, value)

    add_heading(document, "Held-out test results")
    document.add_paragraph(
        "133 images · 53 source groups · 1,056 person boxes · matching IoU 0.50. "
        "Parameters were fixed from validation before the test run."
    )
    table = document.add_table(rows=1, cols=9)
    table.style = "Table Grid"
    headers = ("Method", "Precision", "Recall", "F1", "AP50", "mAP50–95", "Count MAE", "ms/image", "FPS")
    for cell, value in zip(table.rows[0].cells, headers):
        shade(cell, "0F526C")
        set_cell_text(cell, value, bold=True, color="FFFFFF")
    for method, result in (("Single-scale baseline", baseline), ("Multi-scale core", core)):
        row = table.add_row().cells
        values = (
            method, f"{result['precision']:.4f}", f"{result['recall']:.4f}",
            f"{result['f1']:.4f}", f"{result['ap50']:.4f}", f"{result['map50_95']:.4f}",
            f"{result['count_mae']:.4f}", f"{result['mean_inference_ms']:.2f}", f"{result['mean_fps']:.2f}",
        )
        for cell, value in zip(row, values):
            set_cell_text(cell, value, bold=method == "Multi-scale core")
            if method == "Multi-scale core":
                shade(cell, "E2F0D9")

    document.add_paragraph(
        "Interpretation: multi-scale scanning increases true positives from 38 to 105, more than "
        "doubles F1 and AP50, and reduces count MAE. It also adds false positives and is about 5.2× "
        "slower. Recall of 9.94% remains the main accuracy limitation."
    )
    speed = document.add_paragraph()
    speed.add_run("Speed platform: ").bold = True
    speed.add_run(
        "AMD Ryzen 7 5700X 8-Core CPU, Windows 10 Pro build 26300, Python 3.14.2, "
        "OpenCV 4.12.0. One warm-up inference was excluded."
    )

    document.add_page_break()
    add_heading(document, "Failure analysis")
    document.add_paragraph(
        "All 133 test images contain at least one unmatched ground-truth or prediction. The automated "
        "log categorizes every failure; twelve representative cases form the visual gallery."
    )
    failure_table = document.add_table(rows=1, cols=3)
    failure_table.style = "Table Grid"
    for cell, value in zip(failure_table.rows[0].cells, ("Cause", "Images", "Next measured change")):
        shade(cell, "0F526C")
        set_cell_text(cell, value, bold=True, color="FFFFFF")
    plans = {
        "Viewpoint and scale / small people": "More local small-person samples; center crop; small-object recall.",
        "Occlusion and clutter": "Crowded local scenes; crowd-focused or higher-resolution detector.",
        "Missed detection / low confidence": "Validation-only threshold tuning and deployment-domain samples.",
        "Lighting / low light": "Exposure augmentation and optional CLAHE; cause-specific recall.",
        "Viewpoint / partial person at frame edge": "Crop/cutout augmentation plus temporal confirmation.",
        "Look-alike background false positive": "Pose/persistence checks and hard-negative examples.",
    }
    for cause, count in sorted(failures.items(), key=lambda item: item[1], reverse=True):
        row = failure_table.add_row().cells
        for cell, value in zip(row, (cause, str(count), plans[cause])):
            set_cell_text(cell, value)

    gallery_image = next((RESULTS / "failures").glob("failure_01_*.jpg"))
    document.add_picture(str(gallery_image), width=Inches(4.3))
    caption = document.paragraphs[-1]
    caption.alignment = WD_ALIGN_PARAGRAPH.CENTER
    note = document.add_paragraph("Example failure: blue = ground truth, green = prediction.")
    note.alignment = WD_ALIGN_PARAGRAPH.CENTER

    add_heading(document, "Reproduction and in-class run")
    commands = (
        "python src/run.py --input demo_inputs --output outputs/class_demo\n"
        "python src/run.py --input demo.mp4 --output outputs/demo_annotated.mp4\n"
        "python src/run.py --webcam 0 --output outputs/webcam.mp4\n"
        "python src/evaluate.py --output outputs/milestone3"
    )
    paragraph = document.add_paragraph()
    run = paragraph.add_run(commands)
    run.font.name = "Consolas"
    run.font.size = Pt(8.5)

    add_heading(document, "Conclusion")
    document.add_paragraph(
        "The checkpoint satisfies the core-integration requirement and produces reproducible evidence. "
        "The honest test result shows meaningful improvement over the baseline, but small/crowded-person "
        "recall and CPU speed remain the next priorities."
    )

    footer = document.sections[0].footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    footer.add_run("CSST 106 · SHEMBOT v2 · Milestone 3 · cp3-core")
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    document.save(DESTINATION)
    print(f"Wrote {DESTINATION}")


if __name__ == "__main__":
    main()
