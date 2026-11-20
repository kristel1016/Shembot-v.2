"""Create the editable Milestone 3 report in the checkpoint-guide format."""

from __future__ import annotations

import csv
import json
from pathlib import Path

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / "outputs" / "milestone3_final"
DESTINATION = ROOT / "reports" / "MILESTONE_3_REPORT.docx"
HANDOFF = ROOT.parent / "Shembot_Milestone_3_Checkpoint_Report.docx"

BLUE = "2455C3"
DARK_BLUE = "173D8F"
LIGHT_BLUE = "EAF0FC"
LIGHT_GREEN = "E7F8F0"
LIGHT_GRAY = "F2F3F5"
MID_GRAY = "D4D7DC"
TEXT_GRAY = "666A73"


def shade(cell, fill: str) -> None:
    properties = cell._tc.get_or_add_tcPr()
    element = properties.find(qn("w:shd"))
    if element is None:
        element = OxmlElement("w:shd")
        properties.append(element)
    element.set(qn("w:fill"), fill)


def set_cell_margins(cell, top: int = 55, start: int = 75, bottom: int = 55, end: int = 75) -> None:
    properties = cell._tc.get_or_add_tcPr()
    margins = properties.first_child_found_in("w:tcMar")
    if margins is None:
        margins = OxmlElement("w:tcMar")
        properties.append(margins)
    for name, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = margins.find(qn(f"w:{name}"))
        if node is None:
            node = OxmlElement(f"w:{name}")
            margins.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_cell_text(
    cell,
    text: str,
    *,
    bold: bool = False,
    color: str | None = None,
    size: float = 8.2,
    align: WD_ALIGN_PARAGRAPH | None = None,
) -> None:
    cell.text = ""
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    set_cell_margins(cell)
    paragraph = cell.paragraphs[0]
    paragraph.paragraph_format.space_before = Pt(0)
    paragraph.paragraph_format.space_after = Pt(0)
    paragraph.paragraph_format.line_spacing = 1.0
    if align is not None:
        paragraph.alignment = align
    run = paragraph.add_run(text)
    run.bold = bold
    run.font.name = "Arial"
    run.font.size = Pt(size)
    if color:
        run.font.color.rgb = RGBColor.from_string(color)


def repeat_header(row) -> None:
    properties = row._tr.get_or_add_trPr()
    marker = OxmlElement("w:tblHeader")
    marker.set(qn("w:val"), "true")
    properties.append(marker)


def remove_table_borders(table) -> None:
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        border = OxmlElement(f"w:{edge}")
        border.set(qn("w:val"), "nil")
        borders.append(border)
    table._tbl.tblPr.append(borders)


def add_field(paragraph, instruction: str) -> None:
    run = paragraph.add_run()
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    text = OxmlElement("w:instrText")
    text.set(qn("xml:space"), "preserve")
    text.text = instruction
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    run._r.extend((begin, text, end))


def configure_header_and_footer(document: Document) -> None:
    section = document.sections[0]
    header = section.header
    header.paragraphs[0].paragraph_format.space_after = Pt(0)
    table = header.add_table(rows=1, cols=2, width=Inches(7.05))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    remove_table_borders(table)
    set_cell_text(table.cell(0, 0), "CSST 106 - Computer Vision Final Project", color=TEXT_GRAY, size=8.5)
    set_cell_text(
        table.cell(0, 1),
        "Milestone 3 - Core Implementation and Testing",
        color=TEXT_GRAY,
        size=8.5,
        align=WD_ALIGN_PARAGRAPH.RIGHT,
    )
    line = header.add_paragraph()
    line.paragraph_format.space_before = Pt(0)
    line.paragraph_format.space_after = Pt(1)
    properties = line._p.get_or_add_pPr()
    borders = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "4")
    bottom.set(qn("w:color"), MID_GRAY)
    borders.append(bottom)
    properties.append(borders)

    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    footer.paragraph_format.space_before = Pt(0)
    footer.paragraph_format.space_after = Pt(0)
    run = footer.add_run("Page ")
    run.font.name = "Arial"
    run.font.size = Pt(8.5)
    run.font.color.rgb = RGBColor.from_string(TEXT_GRAY)
    add_field(footer, "PAGE")
    footer.add_run(" of ")
    add_field(footer, "NUMPAGES")


def add_title(document: Document) -> None:
    title = document.add_paragraph()
    title.paragraph_format.space_before = Pt(2)
    title.paragraph_format.space_after = Pt(3)
    run = title.add_run("Milestone 3 - Core Implementation and Testing")
    run.bold = True
    run.font.name = "Arial"
    run.font.size = Pt(19)
    run.font.color.rgb = RGBColor.from_string(BLUE)

    subtitle = document.add_paragraph()
    subtitle.paragraph_format.space_after = Pt(6)
    subtitle.paragraph_format.line_spacing = 1.05
    run = subtitle.add_run(
        "Phase 3 of 5. SHEMBOT's person-detection method is integrated into one working pipeline "
        "and tested on held-out CCTV data. The result is reported honestly with failure causes "
        "and a measured improvement plan."
    )
    run.font.name = "Arial"
    run.font.size = Pt(9.2)


def add_section_heading(document: Document, number: int, title: str) -> None:
    paragraph = document.add_paragraph()
    paragraph.paragraph_format.space_before = Pt(5)
    paragraph.paragraph_format.space_after = Pt(2)
    paragraph.paragraph_format.keep_with_next = True
    run = paragraph.add_run(f"{number}. {title}")
    run.bold = True
    run.font.name = "Arial"
    run.font.size = Pt(12.5)
    run.font.color.rgb = RGBColor.from_string(BLUE)


def add_body(document: Document, text: str) -> None:
    paragraph = document.add_paragraph()
    paragraph.paragraph_format.space_before = Pt(0)
    paragraph.paragraph_format.space_after = Pt(3)
    paragraph.paragraph_format.line_spacing = 1.05
    run = paragraph.add_run(text)
    run.font.name = "Arial"
    run.font.size = Pt(9)


def add_bullet(document: Document, text: str) -> None:
    paragraph = document.add_paragraph(style="List Bullet")
    paragraph.paragraph_format.left_indent = Inches(0.2)
    paragraph.paragraph_format.first_line_indent = Inches(-0.12)
    paragraph.paragraph_format.space_after = Pt(1)
    run = paragraph.add_run(text)
    run.font.name = "Arial"
    run.font.size = Pt(8.8)


def add_code_block(document: Document, lines: list[str]) -> None:
    table = document.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = "Table Grid"
    cell = table.cell(0, 0)
    shade(cell, LIGHT_GRAY)
    cell.text = ""
    set_cell_margins(cell, top=65, start=95, bottom=65, end=95)
    for index, line in enumerate(lines):
        paragraph = cell.paragraphs[0] if index == 0 else cell.add_paragraph()
        paragraph.paragraph_format.space_before = Pt(0)
        paragraph.paragraph_format.space_after = Pt(0)
        run = paragraph.add_run(line)
        run.font.name = "Consolas"
        run.font.size = Pt(7.7)


def add_data_table(
    document: Document,
    headers: list[str],
    rows: list[list[str]],
    *,
    numeric_columns: set[int] | None = None,
    highlight_last: bool = False,
    font_size: float = 7.8,
) -> None:
    numeric_columns = numeric_columns or set()
    table = document.add_table(rows=1, cols=len(headers))
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True
    repeat_header(table.rows[0])
    for index, (cell, value) in enumerate(zip(table.rows[0].cells, headers)):
        shade(cell, LIGHT_BLUE)
        set_cell_text(
            cell,
            value,
            bold=True,
            color=DARK_BLUE,
            size=font_size,
            align=WD_ALIGN_PARAGRAPH.RIGHT if index in numeric_columns else None,
        )
    for row_index, values in enumerate(rows):
        cells = table.add_row().cells
        for index, (cell, value) in enumerate(zip(cells, values)):
            if highlight_last and row_index == len(rows) - 1:
                shade(cell, LIGHT_GREEN)
            set_cell_text(
                cell,
                value,
                bold=highlight_last and row_index == len(rows) - 1,
                size=font_size,
                align=WD_ALIGN_PARAGRAPH.RIGHT if index in numeric_columns else None,
            )


def add_checklist(document: Document, items: list[str]) -> None:
    table = document.add_table(rows=0, cols=1)
    table.style = "Table Grid"
    for item in items:
        cell = table.add_row().cells[0]
        shade(cell, LIGHT_GREEN)
        set_cell_text(cell, f"\u2713 {item}", size=10.2)


def main() -> None:
    summary = json.loads((RESULTS / "summary.json").read_text(encoding="utf-8"))
    failure_counts = json.loads((RESULTS / "failure_counts.json").read_text(encoding="utf-8"))
    with (RESULTS / "failures.csv").open(newline="", encoding="utf-8") as handle:
        gallery_rows = [row for row in csv.DictReader(handle) if row["gallery_file"]][:3]
    baseline, core = summary["methods"]

    document = Document()
    section = document.sections[0]
    section.page_width = Inches(8.27)
    section.page_height = Inches(11.69)
    section.top_margin = Inches(0.62)
    section.bottom_margin = Inches(0.52)
    section.left_margin = Inches(0.62)
    section.right_margin = Inches(0.62)
    section.header_distance = Inches(0.18)
    section.footer_distance = Inches(0.22)

    normal = document.styles["Normal"]
    normal.font.name = "Arial"
    normal.font.size = Pt(9)
    normal.paragraph_format.space_after = Pt(3)
    normal.paragraph_format.line_spacing = 1.05
    document.core_properties.title = "SHEMBOT v2 - Milestone 3 Core Implementation and Testing"
    document.core_properties.subject = "CSST 106 Computer Vision Final Project"
    document.core_properties.author = "SHEMBOT project team"
    configure_header_and_footer(document)

    # Page 1 - pipeline, integration, representative tests, and metrics.
    add_title(document)
    add_section_heading(document, 1, "One pipeline, one command")
    add_code_block(document, [
        "python src/run.py --input data/test/images --output outputs/run",
        "python src/run.py --input demo.mp4 --output outputs/demo_annotated.mp4",
        "python src/run.py --webcam 0 --output outputs/webcam.mp4",
    ])
    add_data_table(
        document,
        ["Stage", "Input", "Output"],
        [
            ["preprocess()", "BGR camera frame", "640x640 RGB float32 NCHW tensor"],
            ["infer()", "Prepared tensor / overlapping crops", "YOLOX person scores and boxes"],
            ["postprocess()", "Raw candidates", "Thresholded, NMS-filtered, fused boxes"],
            ["render()", "Frame plus accepted detections", "Annotated frame, count, confidence and CSV row"],
        ],
        font_size=7.7,
    )
    add_body(
        document,
        "The same preprocess() and PersonPipeline implementation are imported by run.py and evaluate.py, "
        "preventing RGB/BGR, scaling, and input-size mismatches."
    )

    add_section_heading(document, 2, "Integrating the main method")
    add_bullet(document, "Detector: YOLOX-S INT8 ONNX restricted to the COCO person class.")
    add_bullet(document, "Core method: one 640x640 full-frame scan plus four overlapping crops for small people.")
    add_bullet(document, "Postprocessing: confidence 0.10, NMS 0.50, containment 0.95 and geometry checks.")
    add_bullet(document, "Video: five-frame modal count with three-frame persistence before a count changes.")

    add_section_heading(document, 3, "Testing on representative data")
    add_body(
        document,
        "The locked test set contains 133 augmented CCTV images from 53 source groups and 1,056 person "
        "boxes. It includes crowding, small people, low light, blur and frame-edge truncation."
    )
    test_rows = []
    for index, row in enumerate(gallery_rows, start=1):
        test_rows.append([
            f"T{index:02}", Path(row["image"]).stem[:27] + "...", row["cause"],
            row["ground_truth"], row["predicted"],
        ])
    add_data_table(
        document,
        ["ID", "Input", "Condition", "Expected", "Got"],
        test_rows,
        numeric_columns={3, 4},
        font_size=7.4,
    )

    add_section_heading(document, 4, "The right metric for the task")
    add_body(
        document,
        "Detection is matched at IoU 0.50. Confidence 0.10, NMS 0.50 and containment 0.95 were selected "
        "on all 145 validation images. Speed is measured on "
        "an AMD Ryzen 7 5700X CPU after one excluded warm-up inference."
    )
    metric_rows = []
    for name, result in (("Single-scale baseline", baseline), ("Multi-scale core", core)):
        metric_rows.append([
            name, f"{result['precision']:.4f}", f"{result['recall']:.4f}", f"{result['f1']:.4f}",
            f"{result['ap50']:.4f}", f"{result['map50_95']:.4f}", f"{result['count_mae']:.4f}",
            f"{result['mean_inference_ms']:.2f}", f"{result['mean_fps']:.2f}",
        ])
    add_data_table(
        document,
        ["Method", "P", "R", "F1", "AP50", "mAP50-95", "MAE", "ms/image", "FPS"],
        metric_rows,
        numeric_columns=set(range(1, 9)),
        highlight_last=True,
        font_size=7.1,
    )

    # Page 2 - error analysis, improvement plan, and class demonstration.
    document.add_page_break()
    add_section_heading(document, 5, "Error analysis")
    add_body(
        document,
        "Every failed test image is logged in failures.csv. Twelve varied examples are annotated in "
        "outputs/milestone3_final/failures/; blue boxes are ground truth and green boxes are predictions."
    )
    total_failures = sum(failure_counts.values())
    failure_rows = [
        [cause, str(count), f"{count / total_failures * 100:.1f}%"]
        for cause, count in sorted(failure_counts.items(), key=lambda item: item[1], reverse=True)
    ]
    add_data_table(
        document,
        ["Failure cause", "Images", "Share of failed images"],
        failure_rows,
        numeric_columns={1, 2},
        font_size=8.0,
    )
    add_body(
        document,
        "Finding: small/far people and occlusion/clutter account for 91 of 133 failed images (68.4%). "
        "Those two causes therefore receive the highest priority."
    )

    add_section_heading(document, 6, "The improvement plan")
    add_data_table(
        document,
        ["Failure cause (count)", "Change", "Expected effect / measurement"],
        [
            ["Small/far people (55)", "More local samples; 960px or center crop", "Small-person recall; AP50"],
            ["Occlusion/clutter (36)", "Crowded-scene fine-tuning; stronger detector", "FN count; recall; count MAE"],
            ["Low confidence (15)", "Validation-only threshold tuning", "F1 and precision/recall balance"],
            ["Low light (13)", "Exposure augmentation; optional CLAHE", "Low-light recall and FP count"],
            ["Frame-edge partials (11)", "Crop/cutout augmentation plus persistence", "Edge-person recall"],
            ["Look-alike objects (3)", "Hard negatives plus temporal/pose evidence", "Background false positives"],
        ],
        font_size=7.5,
    )

    add_section_heading(document, 7, "What happens in class")
    add_bullet(document, "Open the tagged cp3-core environment and receive unseen images or clips.")
    add_bullet(document, "Run one command and inspect the annotated output without manual processing.")
    add_bullet(document, "Explain one failure through scale, confidence, IoU, NMS, fusion or persistence.")
    add_bullet(document, "State that the held-out test was not used for threshold selection.")
    add_code_block(document, [
        "python src/run.py --input <unseen-file-or-folder> --output outputs/class_demo",
        "python src/evaluate.py --output outputs/milestone3",
    ])

    # Page 3 - completion checklist, mistakes, and evidence index.
    document.add_page_break()
    add_section_heading(document, 8, "Definition of done")
    add_checklist(document, [
        "run.py takes raw images, folders, videos or webcam input to visible output with no manual steps.",
        "The multi-scale main method is compared with a single-scale baseline on the held-out test set.",
        "evaluate.py reproduces the metric table, including warm-up-excluded speed measurements.",
        "A 12-image failure gallery has causes and counts; the plan is tied to them; commit tagged cp3-core.",
    ])

    add_section_heading(document, 9, "Common mistakes addressed")
    add_data_table(
        document,
        ["Risk", "Status", "Project evidence"],
        [
            ["Tuning repeatedly on test", "Avoided", "Thresholds selected on validation before locked test."],
            ["Different preprocessing", "Avoided", "run.py and evaluate.py import the same pipeline module."],
            ["Showing only successes", "Avoided", "All 133 failures are logged; 12 are visualized."],
            ["Generic improvement plan", "Avoided", "Each action is tied to an observed cause and metric."],
        ],
        font_size=8.0,
    )

    add_section_heading(document, 10, "Evidence and reproduction index")
    add_data_table(
        document,
        ["Evidence", "Location"],
        [
            ["Runnable pipeline", "src/run.py; src/pipeline.py"],
            ["Reproducible evaluator", "src/evaluate.py"],
            ["Locked held-out data", "data/test/manifest.csv; data/test/images; data/test/annotations"],
            ["Metrics and speed", "outputs/milestone3_final/summary.json; EVALUATION_REPORT.md"],
            ["Failure evidence", "failures.csv; failure_counts.json; failures/*.jpg"],
            ["Improvement plan", "outputs/milestone3_final/IMPROVEMENT_PLAN.md"],
            ["Repository snapshot", "https://github.com/kristel1016/Shembot-v.2/tree/cp3-core"],
            ["Live browser demo", "https://kristel1016.github.io/Shembot-v.2/"],
        ],
        font_size=7.7,
    )
    add_body(
        document,
        "Conclusion: the integrated core method improves F1, AP50 and count MAE over the baseline, but "
        "recall and CPU speed remain below production targets. This is an honest checkpoint result and "
        "the next work is prioritized by measured failures."
    )

    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    document.save(DESTINATION)
    print(f"Wrote {DESTINATION}")
    try:
        document.save(HANDOFF)
        print(f"Wrote {HANDOFF}")
    except PermissionError:
        print(f"Skipped open handoff copy: {HANDOFF}")


if __name__ == "__main__":
    main()
