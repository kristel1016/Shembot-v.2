from __future__ import annotations

from pathlib import Path

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "reports"
REPORT_PATH = REPORTS / "SHEMBOT_FINAL_REPORT_DRAFT.docx"
PRESENTATION_PATH = REPORTS / "SHEMBOT_FINAL_PRESENTATION_CONTENT.docx"

BLUE = "2454D6"
NAVY = "17365D"
TEAL = "159E8C"
LIGHT_BLUE = "EAF1FF"
LIGHT_GREEN = "EAF8F2"
LIGHT_YELLOW = "FFF5CC"
LIGHT_GRAY = "F2F4F7"
MID_GRAY = "D9E1F2"
RED = "C00000"
WHITE = "FFFFFF"
BLACK = "202124"


def set_cell_shading(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=90, start=110, bottom=90, end=110) -> None:
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for m, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{m}"))
        if node is None:
            node = OxmlElement(f"w:{m}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_repeat_table_header(row) -> None:
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def set_cell_text(cell, text: str, *, bold=False, color=BLACK, size=9.5, align=None) -> None:
    cell.text = ""
    p = cell.paragraphs[0]
    if align is not None:
        p.alignment = align
    r = p.add_run(str(text))
    r.bold = bold
    r.font.name = "Aptos"
    r.font.size = Pt(size)
    r.font.color.rgb = RGBColor.from_string(color)
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    set_cell_margins(cell)


def add_table(doc: Document, headers: list[str], rows: list[list[object]], widths=None, font_size=9.0):
    table = doc.add_table(rows=1, cols=len(headers))
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True
    hdr = table.rows[0]
    set_repeat_table_header(hdr)
    for i, header in enumerate(headers):
        set_cell_shading(hdr.cells[i], BLUE)
        set_cell_text(hdr.cells[i], header, bold=True, color=WHITE, size=font_size)
        if widths:
            hdr.cells[i].width = Inches(widths[i])
    for row_idx, values in enumerate(rows):
        cells = table.add_row().cells
        for col_idx, value in enumerate(values):
            if row_idx % 2 == 1:
                set_cell_shading(cells[col_idx], "F7F9FC")
            set_cell_text(cells[col_idx], str(value), size=font_size)
            if widths:
                cells[col_idx].width = Inches(widths[col_idx])
    doc.add_paragraph()
    return table


def set_repeat_header_footer(section, short_title: str) -> None:
    header = section.header
    p = header.paragraphs[0]
    p.text = "CSST 106 — Computer Vision Final Project"
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r = p.runs[0]
    r.font.name = "Aptos"
    r.font.size = Pt(8.5)
    r.font.color.rgb = RGBColor.from_string("707070")
    p.add_run("\t" + short_title)
    p.paragraph_format.space_after = Pt(3)

    footer = section.footer
    fp = footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fr = fp.add_run("SHEMBOT v2  •  ")
    fr.font.name = "Aptos"
    fr.font.size = Pt(8)
    fr.font.color.rgb = RGBColor.from_string("707070")
    fld = OxmlElement("w:fldSimple")
    fld.set(qn("w:instr"), "PAGE")
    fp._p.append(fld)


def configure_document(doc: Document, short_title: str) -> None:
    section = doc.sections[0]
    section.top_margin = Inches(0.7)
    section.bottom_margin = Inches(0.65)
    section.left_margin = Inches(0.75)
    section.right_margin = Inches(0.75)
    set_repeat_header_footer(section, short_title)

    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = "Aptos"
    normal.font.size = Pt(10.5)
    normal.font.color.rgb = RGBColor.from_string(BLACK)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.08

    for name, size, color in (("Title", 28, NAVY), ("Subtitle", 12, "666666")):
        style = styles[name]
        style.font.name = "Aptos Display"
        style.font.size = Pt(size)
        style.font.color.rgb = RGBColor.from_string(color)

    for name, size in (("Heading 1", 18), ("Heading 2", 14), ("Heading 3", 11.5)):
        style = styles[name]
        style.font.name = "Aptos Display"
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = RGBColor.from_string(BLUE if name != "Heading 3" else NAVY)
        style.paragraph_format.keep_with_next = True
        style.paragraph_format.space_before = Pt(10)
        style.paragraph_format.space_after = Pt(5)

    if "Caption Custom" not in styles:
        caption = styles.add_style("Caption Custom", WD_STYLE_TYPE.PARAGRAPH)
        caption.font.name = "Aptos"
        caption.font.size = Pt(8.5)
        caption.font.italic = True
        caption.font.color.rgb = RGBColor.from_string("666666")
        caption.paragraph_format.space_after = Pt(8)
        caption.paragraph_format.keep_with_next = False

    if "Callout" not in styles:
        callout = styles.add_style("Callout", WD_STYLE_TYPE.PARAGRAPH)
        callout.font.name = "Aptos"
        callout.font.size = Pt(9.5)
        callout.font.color.rgb = RGBColor.from_string(NAVY)
        callout.paragraph_format.left_indent = Inches(0.22)
        callout.paragraph_format.right_indent = Inches(0.22)
        callout.paragraph_format.space_before = Pt(4)
        callout.paragraph_format.space_after = Pt(7)


def add_title_page(doc: Document, title: str, subtitle: str) -> None:
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(75)
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("COMPUTER VISION FINAL PROJECT")
    r.bold = True
    r.font.name = "Aptos"
    r.font.size = Pt(13)
    r.font.color.rgb = RGBColor.from_string(TEAL)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(10)
    r = p.add_run("SHEMBOT v2")
    r.bold = True
    r.font.name = "Aptos Display"
    r.font.size = Pt(34)
    r.font.color.rgb = RGBColor.from_string(NAVY)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(title)
    r.bold = True
    r.font.name = "Aptos Display"
    r.font.size = Pt(22)
    r.font.color.rgb = RGBColor.from_string(BLUE)

    p = doc.add_paragraph(subtitle)
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.style = doc.styles["Subtitle"]

    table = doc.add_table(rows=5, cols=2)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    entries = [
        ("Course", "CSST 106 — Computer Vision"),
        ("Team", "[Insert team name]"),
        ("Members", "[Member A]  •  [Member B]  •  [Member C]"),
        ("Instructor", "[Insert instructor name]"),
        ("Submission date", "[Insert final submission date]"),
    ]
    for i, (label, value) in enumerate(entries):
        set_cell_shading(table.rows[i].cells[0], LIGHT_BLUE)
        set_cell_text(table.rows[i].cells[0], label, bold=True, color=NAVY, size=10)
        set_cell_text(table.rows[i].cells[1], value, size=10)
        table.rows[i].cells[0].width = Inches(1.6)
        table.rows[i].cells[1].width = Inches(4.8)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(18)
    r = p.add_run("Editable draft — replace bracketed fields and insert final screenshots before submission")
    r.italic = True
    r.font.size = Pt(9)
    r.font.color.rgb = RGBColor.from_string(RED)
    doc.add_page_break()


def add_bullets(doc: Document, items: list[str], level=0) -> None:
    for item in items:
        p = doc.add_paragraph(style="List Bullet" if level == 0 else "List Bullet 2")
        p.add_run(item)


def add_numbered(doc: Document, items: list[str]) -> None:
    for item in items:
        p = doc.add_paragraph(style="List Number")
        p.add_run(item)


def add_caption(doc: Document, text: str) -> None:
    p = doc.add_paragraph(text, style="Caption Custom")
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER


def add_picture_if_exists(doc: Document, path: Path, width: float, caption: str) -> None:
    if path.exists():
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.add_run().add_picture(str(path), width=Inches(width))
        add_caption(doc, caption)
    else:
        p = doc.add_paragraph(f"[Insert figure: {caption}]", style="Callout")
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER


def add_callout(doc: Document, title: str, body: str, fill=LIGHT_BLUE) -> None:
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = table.cell(0, 0)
    set_cell_shading(cell, fill)
    set_cell_margins(cell, top=130, bottom=130, start=160, end=160)
    p = cell.paragraphs[0]
    r = p.add_run(title + "\n")
    r.bold = True
    r.font.name = "Aptos"
    r.font.size = Pt(10)
    r.font.color.rgb = RGBColor.from_string(NAVY)
    r = p.add_run(body)
    r.font.name = "Aptos"
    r.font.size = Pt(9.5)
    r.font.color.rgb = RGBColor.from_string(BLACK)
    doc.add_paragraph()


def add_auto_toc(doc: Document) -> None:
    p = doc.add_paragraph()
    run = p.add_run()
    fld_char = OxmlElement("w:fldChar")
    fld_char.set(qn("w:fldCharType"), "begin")
    instr_text = OxmlElement("w:instrText")
    instr_text.set(qn("xml:space"), "preserve")
    instr_text.text = 'TOC \\o "1-3" \\h \\z \\u'
    fld_sep = OxmlElement("w:fldChar")
    fld_sep.set(qn("w:fldCharType"), "separate")
    placeholder = OxmlElement("w:t")
    placeholder.text = "Right-click this field in Word and choose Update Field."
    fld_end = OxmlElement("w:fldChar")
    fld_end.set(qn("w:fldCharType"), "end")
    run._r.extend([fld_char, instr_text, fld_sep, placeholder, fld_end])


def build_report() -> None:
    doc = Document()
    configure_document(doc, "Final Report")
    doc.core_properties.title = "SHEMBOT v2 Final Report Draft"
    doc.core_properties.subject = "Computer vision person detection and counting"
    doc.core_properties.author = "SHEMBOT v2 Team"

    add_title_page(
        doc,
        "Final Report Draft",
        "Private, on-device person detection, counting, and room-capacity monitoring",
    )

    doc.add_heading("Document completion checklist", level=1)
    add_callout(
        doc,
        "Before exporting the final PDF",
        "Replace all bracketed fields; add team names and the contribution table; capture 3–5 final live-site screenshots; verify every metric by rerunning the stated command; update the table of contents; and tag the submitted commit as v1.0.",
        LIGHT_YELLOW,
    )
    add_bullets(
        doc,
        [
            "Repository tag: v1.0 on the exact submitted commit.",
            "README covers purpose, requirements, installation, run steps, evaluation command, dataset/model locations, project structure, and contributions.",
            "Final screenshots and sample outputs are stored in outputs/final/ and copied into the appendix.",
            "The results table is reproduced from a fresh clone with one documented command.",
            "The final PDF contains every section below, including limitations and the member-by-module contribution table.",
        ],
    )

    doc.add_heading("Table of contents", level=1)
    add_auto_toc(doc)
    doc.add_page_break()

    doc.add_heading("1. Abstract", level=1)
    doc.add_paragraph(
        "SHEMBOT v2 is a mobile-first people-monitoring system designed to estimate room occupancy without uploading camera frames. The system opens a phone or laptop camera, performs on-device person detection, filters duplicate and implausible detections, stabilizes the count across frames, and displays room-capacity and entry/exit information. The project uses a one-class indoor CCTV dataset containing 1,350 images and 10,439 person boxes, separated by original source to prevent augmented copies from leaking across train, validation, and test sets. The final browser detector was evaluated through the same MediaPipe inference path used by the website on a locked test set of 133 images and 1,056 people. At a validation-selected confidence threshold of 0.26, it achieved 40.89% precision, 28.69% recall, 33.72% F1, 24.49% AP50, 8.18% mAP50–95, a count mean absolute error of 4.20 people, and 31.64 CPU frames per second in detector-only evaluation. Compared with the earlier generic browser detector, AP50 improved by 9.03 percentage points and F1 by 11.24 points. Results show that the prototype is suitable for a controlled classroom demonstration but is not yet production-ready, especially under low light, heavy occlusion, long distance, and severe domain shift."
    )
    add_callout(
        doc,
        "Metric scope",
        "The figures above measure the custom browser detector only. They do not include pose verification, duplicate suppression, temporal tracking, or camera/display overhead. Live browser FPS and the separate Python YOLOX pipeline are reported independently.",
        LIGHT_GREEN,
    )

    doc.add_heading("2. Introduction", level=1)
    doc.add_heading("2.1 Problem", level=2)
    doc.add_paragraph(
        "Manual room counting is slow, inconsistent, and difficult to maintain while people move through a space. Cloud-based camera analytics can reduce manual effort, but they introduce privacy, connectivity, and operating-cost concerns. SHEMBOT v2 addresses this problem with an on-device web application that detects and counts people using the camera already available on a phone or laptop. Camera frames remain in the browser; the application does not automatically upload or record them."
    )
    doc.add_heading("2.2 Beneficiaries and use case", level=2)
    doc.add_paragraph(
        "The intended users are classroom, laboratory, office, and small-room operators who need a quick occupancy estimate and capacity warning. The prototype is best treated as decision support rather than a safety-certified counter: an operator can view the boxes, inspect the count, and correct the setup when lighting, distance, or occlusion is poor."
    )
    doc.add_heading("2.3 Objectives", level=2)
    add_numbered(
        doc,
        [
            "Build a mobile-first browser application that opens a front or rear camera and performs person-only detection locally.",
            "Display visible person boxes, confidence values, a stabilized live count, room-capacity status, and optional entry/exit statistics.",
            "Prevent common over-counting through person-class filtering, pose/geometry checks, duplicate suppression, and temporal tracking.",
            "Create a source-grouped train/validation/test protocol and report precision, recall, F1, AP50, mAP50–95, count MAE, and speed on a locked test split.",
            "Provide a reproducible repository, documented evaluation command, test evidence, limitations, and a public HTTPS demonstration.",
        ],
    )
    doc.add_heading("2.4 Scope", level=2)
    doc.add_paragraph(
        "The system detects the person class in RGB camera frames. It does not identify individuals, recognize faces, infer identity or emotion, or guarantee legal occupancy compliance. It is designed for ordinary indoor views with visible people and reasonable lighting, not for thermal cameras, very large outdoor crowds, surveillance at extreme distance, or safety-critical deployment."
    )

    doc.add_heading("3. Related Work", level=1)
    doc.add_paragraph(
        "The project combines ideas from compact object detection, browser inference, human-pose verification, and temporal filtering. The following systems informed the design."
    )
    add_table(
        doc,
        ["Approach", "Useful idea", "Relation to SHEMBOT"],
        [
            ["EfficientDet / EfficientDet-Lite", "Efficient multi-scale feature fusion and compact detector variants.", "The browser detector uses an EfficientDet-Lite-style TFLite model suitable for on-device inference."],
            ["YOLOX", "Anchor-free object detection with strong speed/accuracy trade-offs.", "The reproducible Python baseline and multi-scale core use an INT8 YOLOX ONNX model."],
            ["MediaPipe Tasks", "Cross-platform web runtimes for TFLite object detection and pose landmarks.", "The public app uses vendored MediaPipe detector and pose assets so inference remains local."],
            ["Deep SORT / tracking-by-detection", "Associate detections across frames instead of treating every frame independently.", "SHEMBOT uses lightweight browser-side tracks and temporal hold rules to stabilize counts."],
            ["COCO detection evaluation", "IoU-based TP/FP matching, AP50, and mAP across IoU thresholds.", "The evaluation reports detection metrics rather than misleading image-classification accuracy."],
        ],
        widths=[1.65, 2.55, 3.35],
    )
    doc.add_paragraph(
        "SHEMBOT differs from a standard detector demo because the visible count is produced by a pipeline: camera acquisition, orientation handling, detector proposals, optional pose confirmation, duplicate merging, temporal tracking, and room logic. This improves usability but also means detector-only metrics and end-to-end live behavior must be reported separately."
    )

    doc.add_heading("4. Dataset", level=1)
    doc.add_heading("4.1 Primary dataset and license", level=2)
    doc.add_paragraph(
        "The primary training and evaluation source is CCTV Indoor Person Detection v1 from Roboflow Universe (project URL: https://universe.roboflow.com/yolo-k9iku/cctv-indoor-person-detection-bi2vp). It is licensed under CC BY 4.0 and provides Pascal VOC XML annotations for one class: person. Attribution and the original source URL must remain in the final repository and report."
    )
    add_table(
        doc,
        ["Split", "Original source groups", "Images", "Person boxes", "Use"],
        [
            ["Train", "438", "1,072", "8,332", "Model fitting and augmentation"],
            ["Validation", "61", "145", "1,051", "Model/threshold selection only"],
            ["Locked test", "53", "133", "1,056", "Final reporting only"],
            ["Total", "552", "1,350", "10,439", "One person class"],
        ],
        widths=[1.0, 1.35, 0.85, 1.0, 2.8],
    )
    doc.add_heading("4.2 Leakage prevention", level=2)
    doc.add_paragraph(
        "The public dataset contains augmented versions of the same original image. Each image was traced to its original source identifier, and all augmentations from one source were assigned to the same deterministic split. This source grouping prevents near-identical train images from appearing in validation or test. The 133-image test split remained untouched during threshold selection and failed-experiment analysis."
    )
    doc.add_heading("4.3 Annotation audit", level=2)
    add_bullets(
        doc,
        [
            "Image/XML pairs and the one-class label map were checked before training.",
            "A total of 203 out-of-bounds coordinates were clamped to the image boundary; no valid person boxes were intentionally removed.",
            "The audit checked malformed boxes, missing pairs, class consistency, and split leakage.",
            "The test split was not relabeled or filtered after viewing model results.",
        ],
    )
    doc.add_heading("4.4 Preprocessing and augmentation", level=2)
    doc.add_paragraph(
        "The source export applies EXIF orientation handling and 640×640 stretching, with random crop (0–15%), rotation (±15°), brightness adjustment (±25%), Gaussian blur (0–1.1 px), and 1.37% salt-and-pepper noise. Custom EfficientDet training uses 320×320 RGB input. In the browser, selected crops are rotated when required and downscaled while preserving aspect ratio, with a maximum side of 512 pixels."
    )
    add_picture_if_exists(
        doc,
        ROOT / "evidence" / "preprocessing_comparison.jpg",
        6.4,
        "Figure 1. Example preprocessing comparison used to verify the image pipeline.",
    )
    doc.add_heading("4.5 Additional datasets and deployment gap", level=2)
    doc.add_paragraph(
        "Additional Kaggle and classroom sources were audited, but they were not automatically merged into the final model. A 1,339-image pedestrian VOC dataset reduced AP50 from 28.86% to 14.18% when combined, and a 2,586-image classroom experiment produced only 5.57% AP50 because several labels described behavior regions rather than one complete person. A classification dataset supplied 362 useful non-person negatives, but not detection boxes for its 559 positive images. These experiments demonstrate that more data is not automatically better: annotation definition, completeness, camera angle, and deployment similarity are critical."
    )

    doc.add_heading("5. Methodology", level=1)
    doc.add_heading("5.1 End-to-end workflow", level=2)
    add_picture_if_exists(
        doc,
        ROOT / "reports" / "milestone4_workflow.png",
        6.6,
        "Figure 2. SHEMBOT detection, verification, tracking, and reporting workflow.",
    )
    add_table(
        doc,
        ["Stage", "Operation", "Reason"],
        [
            ["1. Camera input", "Request camera permission, select front/rear lens, validate nonzero frame dimensions.", "Prevents invalid-frame and divide-by-zero failures."],
            ["2. Frame preparation", "Correct orientation/mirroring, apply ROI, downscale while retaining aspect ratio.", "Matches device orientation and limits inference cost."],
            ["3. Detector", "Run the custom compact TFLite detector; use a compatible generic fallback if the primary runtime fails.", "Provides person proposals on common phones and laptops."],
            ["4. Human verification", "Apply person class allowlist, geometry checks, and pose landmarks when available.", "Rejects furniture, toys, body fragments, and impossible boxes."],
            ["5. Duplicate suppression", "Use NMS plus containment/overlap/proximity logic across full and zoom scans.", "Avoids counting one person several times."],
            ["6. Temporal tracking", "Associate boxes across frames, confirm new tracks, and hold recent valid tracks briefly.", "Reduces flicker without allowing stale counts to persist indefinitely."],
            ["7. Application output", "Draw boxes/confidence, update count/capacity, optional line crossing, local history.", "Turns model outputs into a usable monitoring interface."],
        ],
        widths=[1.15, 3.4, 2.25],
        font_size=8.7,
    )
    doc.add_heading("5.2 Detection models", level=2)
    doc.add_paragraph(
        "The public browser app uses a custom optimized TFLite detector as its primary CPU model and retains a compatible generic model as a runtime fallback. The fallback is a reliability mechanism, not a claim that both models share the same measured accuracy. The separate Python research pipeline uses the 8.659 MB INT8 YOLOX ONNX model evaluation/models/object_detection_yolox_2022nov_int8.onnx (SHA-256 01a3b0f400b30bc1e45230e991b2e499ab42622485a330021947333fbaf03935)."
    )
    doc.add_heading("5.3 Duplicate and temporal filtering", level=2)
    doc.add_paragraph(
        "A raw detector may place multiple boxes on a face, torso, limbs, or the same person at different scan scales. SHEMBOT first suppresses high-overlap boxes, then compares containment and centers to merge cross-scan duplicates. Remaining candidates are matched with existing tracks. A detector-plus-pose result can be confirmed immediately, while uncertain proposals require temporal evidence. Valid tracks are held for approximately 2.2 seconds to reduce one-frame disappearance, and periodic full-frame reacquisition prevents a missed person from remaining absent for too long."
    )
    doc.add_heading("5.4 Privacy and storage", level=2)
    doc.add_paragraph(
        "Camera inference, pose verification, tracking, and count history run locally in the browser. No automatic upload is performed. The user may explicitly download a CSV history or save a misclassified sample for later annotation; these actions are local and user initiated."
    )

    doc.add_heading("6. Experiments", level=1)
    doc.add_heading("6.1 Experimental protocol", level=2)
    add_table(
        doc,
        ["Item", "Setting"],
        [
            ["Locked test", "133 images, 1,056 ground-truth people, grouped by original source"],
            ["Random seed", "42 for reproducible Python evaluation"],
            ["Detection matching", "IoU ≥ 0.50 for TP/FP/FN and AP50"],
            ["Browser threshold", "Confidence 0.26, selected without tuning on the locked test"],
            ["Primary detection measures", "Precision, recall, F1, AP50, mAP50–95"],
            ["Counting measure", "Mean absolute error (MAE) between predicted and true count"],
            ["Efficiency measure", "Detector-only CPU FPS; live browser FPS reported separately"],
            ["Reproduction command", "python src/evaluate.py --split test --weights evaluation/models/object_detection_yolox_2022nov_int8.onnx --output outputs/final"],
        ],
        widths=[1.8, 5.1],
    )
    doc.add_heading("6.2 Why accuracy is not the primary metric", level=2)
    doc.add_paragraph(
        "Object detection does not have a useful count of true-negative background regions: an image contains an effectively unlimited number of places where no person exists. A conventional accuracy percentage would therefore be dominated by undefined or arbitrary background choices. Precision measures how many predicted people are correct; recall measures how many labeled people are found; F1 balances both; AP measures ranking quality over confidence; IoU evaluates box overlap; count MAE measures occupancy error; and FPS measures practical speed."
    )
    doc.add_heading("6.3 Model-development experiments", level=2)
    add_table(
        doc,
        ["Candidate", "Data / change", "AP50", "Decision"],
        [
            ["CCTV EfficientDet epoch 23", "Primary CCTV data", "28.86% (Model Maker)", "Promoted after browser-path testing"],
            ["Extended v2 epoch 10", "Added mixed sources", "20.56%", "Rejected"],
            ["Hard-negative v2 epoch 15", "Added audited negatives", "26.28%", "Rejected; closest candidate"],
            ["Classroom v1 epoch 5", "CCTV + 2,586 classroom images", "5.57%", "Rejected; annotation/domain mismatch"],
        ],
        widths=[1.75, 2.9, 0.9, 1.65],
    )
    doc.add_paragraph(
        "Candidate selection was based on validation evidence and browser compatibility. Failed runs remain documented to show that the final decision was not based only on the best-looking demonstration frame."
    )

    doc.add_heading("7. Results", level=1)
    doc.add_heading("7.1 Final browser-detector metrics", level=2)
    add_table(
        doc,
        ["Metric", "Final custom detector", "Interpretation"],
        [
            ["Precision", "40.89%", "About 41 of every 100 detector boxes match a labeled person at the selected protocol."],
            ["Recall", "28.69%", "About 29 of every 100 labeled people are detected."],
            ["F1", "33.72%", "Harmonic balance between precision and recall."],
            ["AP50", "24.49%", "Area under the precision–recall curve at IoU 0.50."],
            ["mAP50–95", "8.18%", "Stricter average across IoU 0.50 to 0.95."],
            ["Count MAE", "4.20 people/image", "Average absolute difference between predicted and true count."],
            ["CPU speed", "31.64 FPS", "Detector-only benchmark; excludes camera, rendering, pose, and tracking."],
        ],
        widths=[1.3, 1.55, 4.0],
    )
    add_callout(
        doc,
        "Do not call F1 the system’s “accuracy.”",
        "For the final presentation, say: “The final detector achieved 40.89% precision, 28.69% recall, and 33.72% F1 on the locked test set.” Then explain that object detection accuracy is represented by several metrics rather than one conventional accuracy value.",
        LIGHT_YELLOW,
    )
    doc.add_heading("7.2 Browser detector improvement", level=2)
    add_table(
        doc,
        ["Browser detector", "Precision", "Recall", "F1", "AP50", "mAP50–95", "MAE", "FPS"],
        [
            ["Earlier generic", "38.84%", "15.81%", "22.48%", "15.46%", "5.00%", "5.01", "13.91"],
            ["Final custom", "40.89%", "28.69%", "33.72%", "24.49%", "8.18%", "4.20", "31.64"],
            ["Change", "+2.05 pp", "+12.88 pp", "+11.24 pp", "+9.03 pp", "+3.18 pp", "−0.81", "+17.73"],
        ],
        font_size=8.1,
    )
    doc.add_paragraph(
        "The final custom detector improves every reported browser-detector metric and more than doubles detector-only CPU throughput. However, precision and recall remain modest, so the live application still relies on human verification logic and visible overlays rather than presenting the count as unquestionable ground truth."
    )
    doc.add_heading("7.3 Separate Python baseline comparison", level=2)
    add_table(
        doc,
        ["Python method", "Precision", "Recall", "F1", "AP50", "mAP50–95", "Count MAE", "CPU FPS"],
        [
            ["Single-scale baseline", "59.84%", "7.20%", "12.85%", "6.19%", "2.83%", "7.0000", "2.25"],
            ["Integrated multi-scale core", "53.08%", "14.68%", "23.00%", "11.66%", "4.73%", "5.8346", "0.44"],
        ],
        font_size=8.1,
    )
    doc.add_paragraph(
        "The multi-scale Python method doubles recall and improves F1, AP, and count MAE, but its 0.44 FPS speed is unsuitable for smooth video. These values describe a separate ONNX/YOLOX research pipeline and must not be presented as the live website’s performance."
    )
    doc.add_heading("7.4 Condition-level analysis", level=2)
    add_table(
        doc,
        ["Condition", "Images", "Precision", "Recall", "F1", "Count MAE"],
        [
            ["Dense crowd / occlusion", "36", "56.85%", "13.50%", "21.81%", "13.0278"],
            ["Low light", "13", "41.18%", "8.24%", "13.73%", "5.2308"],
            ["Partial person at edge", "11", "83.33%", "24.39%", "37.74%", "2.6364"],
            ["Small or distant people", "56", "49.04%", "17.71%", "26.02%", "3.4286"],
            ["Standard indoor view", "17", "30.77%", "14.81%", "20.00%", "1.0588"],
        ],
        widths=[2.2, 0.7, 1.0, 0.9, 0.8, 1.15],
    )
    doc.add_paragraph(
        "Dense crowds produce the largest counting error because overlapping people hide each other. Low light gives the lowest recall because person edges and textures lose contrast. Small/distant people contain fewer useful pixels. Partial-edge performance is comparatively stronger when a visible upper body remains large enough."
    )
    doc.add_heading("7.5 Sample outputs and failures", level=2)
    add_picture_if_exists(
        doc,
        ROOT / "reports" / "milestone4_limitations_examples.jpg",
        6.6,
        "Figure 3. Representative difficult cases retained as evidence rather than removed from the evaluation.",
    )
    doc.add_paragraph(
        "The 12-case checkpoint test record produced two exact-count cases and ten difficult cases. Common failures include missed small people, false boxes on person-like objects or images, duplicated boxes on body regions, count flicker during motion, and delayed reacquisition after a low-confidence frame. The final browser logic reduces—but does not eliminate—these errors."
    )

    doc.add_heading("8. Discussion and Limitations", level=1)
    doc.add_heading("8.1 What works", level=2)
    add_bullets(
        doc,
        [
            "Private, installation-free camera monitoring from a public HTTPS page.",
            "Usable visible output: boxes, confidence, count, capacity, camera switching, ROI, and local activity history.",
            "Improved final browser detector compared with the earlier generic detector on the same locked split.",
            "Source-grouped evaluation and documented failed experiments reduce the risk of misleading performance claims.",
            "Temporal hold and fast reacquisition reduce one-frame disappearance while preserving responsiveness.",
        ],
    )
    doc.add_heading("8.2 What does not yet work reliably", level=2)
    add_bullets(
        doc,
        [
            "Crowded or heavily occluded rooms: one person may hide most of another person.",
            "Night or backlit scenes: low contrast lowers confidence and pose visibility.",
            "Long distance: each person occupies too few pixels for a compact model.",
            "Printed people, screens, mannequins, toys, furniture, or hanging objects can resemble a person.",
            "Extreme close-ups and body fragments can create overlapping or partial proposals.",
            "Different phones and in-app browsers vary in WebAssembly/WebGL support, startup time, memory, and camera behavior.",
        ],
    )
    doc.add_heading("8.3 Recommended operating conditions", level=2)
    doc.add_paragraph(
        "For the final demonstration, use a stationary phone or laptop, front lighting, a clean lens, visible upper bodies, limited overlap, and a distance at which each person occupies at least roughly 1.2% of the frame. Avoid pointing at posters or screens containing people. Set a detection area that excludes shelves, beds, roads, roofs, and other persistent distractors. Open the live site directly in a current Chrome, Edge, or Safari browser rather than an embedded social-media browser when possible."
    )
    doc.add_heading("8.4 Threats to validity", level=2)
    doc.add_paragraph(
        "The locked set is dominated by indoor CCTV imagery and does not fully represent every classroom, phone camera, lens, night condition, or crowd density. Detector-only FPS was measured separately from live end-to-end latency. The browser postprocessor can improve visible stability but cannot be assigned the detector’s AP without an end-to-end annotated video benchmark. Finally, results from the Python ONNX pipeline and browser TFLite pipeline are not interchangeable."
    )

    doc.add_heading("9. Conclusion and Future Work", level=1)
    doc.add_heading("9.1 Conclusion against the objectives", level=2)
    doc.add_paragraph(
        "SHEMBOT v2 meets the prototype objectives: it runs from a public mobile-friendly website, processes camera frames locally, displays person-only overlays and room analytics, includes duplicate and temporal filtering, and provides a reproducible source-grouped evaluation. The final detector improves substantially over the earlier generic browser detector, especially in recall, F1, AP50, count MAE, and speed. The measured recall of 28.69% nevertheless shows that it should be demonstrated as a controlled prototype rather than a production occupancy system."
    )
    doc.add_heading("9.2 Prioritized future work", level=2)
    add_numbered(
        doc,
        [
            "Collect deployment-specific classroom/laboratory frames from the intended camera height, distance, lighting, and crowd density, including empty scenes and person-like objects.",
            "Audit every positive box for completeness and label each whole visible person consistently; keep source scenes together when splitting.",
            "Train a compact detector initialized from general person weights and compare candidates only on the validation split.",
            "Choose confidence, NMS, pose, and temporal thresholds using validation precision–recall and counting error, not demonstration appearance.",
            "Add an annotated end-to-end video benchmark to evaluate duplicate suppression, track stability, time-to-detect, and time-to-clear.",
            "Optimize scan frequency and model input size per device, then freeze one candidate and run the locked test once.",
            "For real deployment, add consent procedures, access control, monitoring, failure alarms, device qualification, and manual fallback.",
        ],
    )

    doc.add_heading("10. References", level=1)
    refs = [
        "Tan, M., Pang, R., & Le, Q. V. (2020). EfficientDet: Scalable and Efficient Object Detection. CVPR.",
        "Ge, Z., Liu, S., Wang, F., Li, Z., & Sun, J. (2021). YOLOX: Exceeding YOLO Series in 2021. arXiv:2107.08430.",
        "Lugaresi, C., et al. (2019). MediaPipe: A Framework for Building Perception Pipelines. arXiv:1906.08172.",
        "Lin, T.-Y., et al. (2014). Microsoft COCO: Common Objects in Context. ECCV.",
        "Wojke, N., Bewley, A., & Paulus, D. (2017). Simple Online and Realtime Tracking with a Deep Association Metric. ICIP.",
        "Roboflow Universe. CCTV Indoor Person Detection v1. CC BY 4.0. https://universe.roboflow.com/yolo-k9iku/cctv-indoor-person-detection-bi2vp",
        "Google. MediaPipe Tasks for Web documentation and vendored runtime assets used in this repository.",
        "SHEMBOT v2 repository. https://github.com/kristel1016/Shembot-v.2",
    ]
    for i, ref in enumerate(refs, 1):
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Inches(0.25)
        p.paragraph_format.first_line_indent = Inches(-0.25)
        p.add_run(f"[{i}] {ref}")

    doc.add_heading("Appendices", level=1)
    doc.add_heading("Appendix A. Reproduction commands", level=2)
    commands = [
        "git clone https://github.com/kristel1016/Shembot-v.2.git",
        "cd Shembot-v.2",
        "python -m venv .venv",
        r".\.venv\Scripts\Activate.ps1",
        "python -m pip install -r requirements.txt",
        "python src/evaluate.py --split test --weights evaluation/models/object_detection_yolox_2022nov_int8.onnx --output outputs/final",
        "node tests/static_smoke.test.mjs",
    ]
    for cmd in commands:
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Inches(0.25)
        set_cell = p.add_run(cmd)
        set_cell.font.name = "Consolas"
        set_cell.font.size = Pt(9)
        set_cell.font.color.rgb = RGBColor.from_string(NAVY)

    doc.add_heading("Appendix B. Final test-case record", level=2)
    add_table(
        doc,
        ["ID", "Condition", "Expected", "Observed", "Pass?", "Evidence / note"],
        [[str(i), "[Fill from final run]", "[Count]", "[Count]", "[Yes/No]", "[Screenshot filename and diagnosis]"] for i in range(1, 13)],
        widths=[0.4, 1.5, 0.8, 0.8, 0.65, 2.7],
        font_size=8.5,
    )
    doc.add_heading("Appendix C. Team contribution table", level=2)
    add_callout(
        doc,
        "Required final edit",
        "Replace the placeholders below with real names and repository evidence. The table must match the Git history and actual work; do not assign work only to make the rows look equal.",
        LIGHT_YELLOW,
    )
    add_table(
        doc,
        ["Member", "Modules / responsibilities", "Evidence (commits/files)", "Contribution %"],
        [
            ["[Member A]", "Problem definition, interface, final integration", "[Commit hashes / files]", "[%]"],
            ["[Member B]", "Dataset audit, training, annotation review", "[Commit hashes / files]", "[%]"],
            ["[Member C]", "Evaluation, tests, documentation, presentation", "[Commit hashes / files]", "[%]"],
        ],
        widths=[1.2, 2.7, 2.3, 0.8],
    )
    doc.add_heading("Appendix D. Final package checklist", level=2)
    add_bullets(
        doc,
        [
            "[ ] Git tag v1.0 created and pushed.",
            "[ ] Fresh clone runs by following README only.",
            "[ ] Public live site tested on the demonstration phone and laptop.",
            "[ ] One command reproduces the final results table.",
            "[ ] Model weights and dataset locations are documented; large files use a release or external link if necessary.",
            "[ ] outputs/final/ contains sample successes, failures, metrics, and screenshots.",
            "[ ] Final PDF and presentation uploaded to the release/submission location.",
            "[ ] Contribution table verified against Git history.",
        ],
    )

    REPORTS.mkdir(parents=True, exist_ok=True)
    doc.save(REPORT_PATH)


def add_slide_block(
    doc: Document,
    number: str,
    title: str,
    timing: str,
    owner: str,
    on_slide: list[str],
    notes: list[str],
    visual: str,
    transition: str | None = None,
) -> None:
    doc.add_heading(f"Slide {number}. {title}", level=1)
    meta = doc.add_table(rows=1, cols=3)
    meta.alignment = WD_TABLE_ALIGNMENT.CENTER
    for idx, (label, value) in enumerate((("Time", timing), ("Owner", owner), ("Suggested visual", visual))):
        set_cell_shading(meta.cell(0, idx), LIGHT_BLUE)
        p = meta.cell(0, idx).paragraphs[0]
        r = p.add_run(label + ": ")
        r.bold = True
        r.font.color.rgb = RGBColor.from_string(NAVY)
        r.font.size = Pt(9)
        rr = p.add_run(value)
        rr.font.size = Pt(9)
        set_cell_margins(meta.cell(0, idx))
    doc.add_paragraph()

    doc.add_heading("Put this on the slide", level=2)
    add_bullets(doc, on_slide)
    doc.add_heading("What to say", level=2)
    for note in notes:
        p = doc.add_paragraph(note)
        p.paragraph_format.left_indent = Inches(0.18)
    if transition:
        add_callout(doc, "Transition", transition, LIGHT_GREEN)


def build_presentation_document() -> None:
    doc = Document()
    configure_document(doc, "Presentation Content")
    doc.core_properties.title = "SHEMBOT v2 Final Presentation Content and Speaker Notes"
    doc.core_properties.subject = "Slide-by-slide presentation guide"
    doc.core_properties.author = "SHEMBOT v2 Team"

    add_title_page(
        doc,
        "Final Presentation Content and Speaker Notes",
        "A timed 10-minute presentation, 4-minute live demo, and prepared defense answers",
    )

    doc.add_heading("Presentation plan", level=1)
    add_table(
        doc,
        ["Time", "Required content", "Owner"],
        [
            ["1 minute", "Problem and objectives", "Member A"],
            ["2 minutes", "Dataset and approach, including pipeline diagram", "Member B"],
            ["2 minutes", "Results: baseline vs final, condition breakdown, speed", "Member C"],
            ["4 minutes", "Live demo: prepared test cases, then teacher input", "Everyone; one person drives"],
            ["1 minute", "Limitations, future work, conclusion", "Member A"],
            ["5+ minutes", "Questions / defense", "Everyone"],
        ],
        widths=[1.0, 4.5, 1.4],
    )
    add_callout(
        doc,
        "Team edit needed",
        "Replace Member A/B/C with real names. The live-demo driver should be the person most familiar with camera permissions, browser refresh, the detection-area control, and the backup video.",
        LIGHT_YELLOW,
    )

    add_slide_block(
        doc,
        "1",
        "SHEMBOT v2",
        "10 seconds",
        "Member A",
        [
            "Private, on-device person detection and room counting",
            "CSST 106 — Computer Vision Final Project",
            "[Insert team-member names]",
            "Live demo: https://kristel1016.github.io/Shembot-v.2/",
        ],
        [
            "Good day. We are presenting SHEMBOT v2, a mobile-first computer-vision system that detects and counts people using a phone or laptop camera while keeping camera frames on the device.",
        ],
        "One clean screenshot of the final mobile interface",
    )

    add_slide_block(
        doc,
        "2",
        "Problem and motivation",
        "20 seconds",
        "Member A",
        [
            "Manual room counting is slow and inconsistent",
            "Cloud camera analytics raises privacy and connectivity concerns",
            "Need: a visible, local, low-cost occupancy estimate",
        ],
        [
            "Classrooms and laboratories may need quick occupancy information, but repeatedly counting people by hand is inconvenient. Sending camera feeds to a server also creates privacy and network concerns. Our goal was therefore a browser-based system that performs detection locally and shows the operator exactly what was counted.",
        ],
        "Three icons: manual counting, cloud/privacy, on-device camera",
    )

    add_slide_block(
        doc,
        "3",
        "Objectives and scope",
        "30 seconds",
        "Member A",
        [
            "Detect only people from a phone or laptop camera",
            "Draw boxes and show a stable live count and capacity status",
            "Reduce false and duplicate counts with verification and tracking",
            "Evaluate on a source-grouped locked test set",
            "Frames stay in the browser; no face recognition",
        ],
        [
            "We set five measurable objectives. The app must run from a camera, filter to the person class, draw visible boxes, stabilize the count, and report reproducible detection and counting metrics. It does not identify people or recognize faces. It is a prototype for controlled indoor monitoring, not a certified safety counter.",
        ],
        "Five short objective cards",
        "Member B will now explain the data and how a camera frame becomes the displayed count.",
    )

    add_slide_block(
        doc,
        "4",
        "Dataset and leakage prevention",
        "45 seconds",
        "Member B",
        [
            "CCTV Indoor Person Detection v1 — CC BY 4.0",
            "1,350 images • 10,439 person boxes • one class",
            "Train: 1,072 images / 8,332 boxes",
            "Validation: 145 / 1,051",
            "Locked test: 133 / 1,056",
            "Split by original source, not augmented filename",
        ],
        [
            "Our primary data source contains indoor CCTV scenes with one person class. The important part of our split is source grouping. Augmented copies of the same original image always remain in one split, so a rotated or brighter copy cannot leak from training into validation or test. The 133-image test split was locked and was not used for threshold tuning.",
            "We also audited extra Kaggle and classroom data. We rejected combined runs when annotation definitions or camera domains reduced validation performance. This is evidence that data quality and match matter more than simply adding image counts.",
        ],
        "Dataset table plus one representative annotated image",
    )

    add_slide_block(
        doc,
        "5",
        "Approach: from camera to count",
        "75 seconds",
        "Member B",
        [
            "Camera → orientation/ROI → compact detector",
            "Person allowlist + geometry/pose verification",
            "NMS and cross-scan duplicate suppression",
            "Temporal tracking and short hold",
            "Boxes → count → capacity / entry-exit analytics",
        ],
        [
            "The camera frame is validated first so zero-width or zero-height frames cannot stop the loop. We correct orientation and mirroring, apply the selected detection area, and resize the frame for a compact TFLite person detector.",
            "Detector proposals pass through person-only, geometry, and—when available—pose checks. NMS and containment rules merge boxes that represent the same body or the same person at different scan scales. Tracks then connect detections across frames. A short hold prevents one missed frame from immediately erasing a person, while periodic full-frame scanning reacquires missed people.",
            "The custom optimized detector is the primary CPU model. A compatible generic model remains only as a runtime fallback for devices where the primary MediaPipe path fails.",
        ],
        "Use reports/milestone4_workflow.png as the full-width diagram",
        "Member C will present the locked-test measurements and explain what improved.",
    )

    add_slide_block(
        doc,
        "6",
        "Final browser-detector results",
        "50 seconds",
        "Member C",
        [
            "Locked test: 133 images, 1,056 labeled people",
            "Precision 40.89% • Recall 28.69% • F1 33.72%",
            "AP50 24.49% • mAP50–95 8.18%",
            "Count MAE 4.20 people/image",
            "Detector-only CPU speed 31.64 FPS",
        ],
        [
            "At the validation-selected confidence threshold of 0.26, the custom browser detector achieved 40.89 percent precision, 28.69 percent recall, and 33.72 percent F1. AP50 was 24.49 percent, strict mAP50 to 95 was 8.18 percent, and average count error was 4.20 people per image.",
            "The 31.64 FPS figure is detector-only CPU evaluation. It excludes camera capture, drawing, pose verification, and tracking, so we do not present it as guaranteed live FPS on every phone.",
            "We do not report conventional accuracy because object detection has no meaningful fixed number of true-negative background locations. Precision, recall, F1, AP, IoU, count MAE, and speed describe the system more honestly.",
        ],
        "Large metric cards; highlight F1, AP50, MAE, and FPS",
    )

    add_slide_block(
        doc,
        "7",
        "Baseline versus final",
        "40 seconds",
        "Member C",
        [
            "F1: 22.48% → 33.72% (+11.24 percentage points)",
            "Recall: 15.81% → 28.69% (+12.88 pp)",
            "AP50: 15.46% → 24.49% (+9.03 pp)",
            "Count MAE: 5.01 → 4.20 (lower is better)",
            "CPU detector FPS: 13.91 → 31.64",
        ],
        [
            "Compared with the earlier generic browser detector on the same protocol, the final custom detector improves F1 by 11.24 percentage points, recall by 12.88 points, and AP50 by 9.03 points. Count error decreases by 0.81 person per image, and detector-only CPU throughput more than doubles.",
            "These improvements are meaningful, but the absolute recall remains low. Our conclusion is therefore a controlled-demonstration prototype, not production readiness.",
        ],
        "Before/after grouped bar chart; use percentage points, not percent increase",
    )

    add_slide_block(
        doc,
        "8",
        "Where it fails",
        "30 seconds",
        "Member C",
        [
            "Dense crowd: highest count MAE (13.03)",
            "Low light: lowest recall (8.24%)",
            "Small/distant people: only a few useful pixels",
            "Person-like objects, posters, and body fragments can cause false boxes",
            "Different phones change speed and runtime compatibility",
        ],
        [
            "The failure analysis shows that motion is not the only problem. Occlusion, darkness, distance, background look-alikes, and domain shift are major causes. Dense crowds have the largest counting error, while low light has the lowest recall. These conditions guide both our demo setup and our next data-collection plan.",
        ],
        "Three representative failure images with one-line causes",
        "We will now show the actual public application using prepared easy and difficult cases.",
    )

    add_slide_block(
        doc,
        "9",
        "Live demonstration",
        "4 minutes",
        "Everyone; one driver",
        [
            "1. Open live HTTPS site and start camera",
            "2. One well-lit person; then add a second person",
            "3. Show box, count, capacity, camera switch, and detection area",
            "4. Show one difficult case and explain the expected limitation",
            "5. Accept one teacher-provided input",
        ],
        [
            "First say: ‘The green boxes are the people accepted by the current pipeline; the number at the top is the stabilized count.’",
            "Begin with a stable, well-lit full upper-body view. Wait for the detector to warm up before starting the timed part. Add a second person without heavy overlap. Point out the visible boxes and count rather than claiming perfect identity tracking.",
            "Demonstrate the detection-area control and camera switch only after the basic count works. For the difficult case, intentionally show low light, distance, or partial occlusion and connect the behavior to the measured limitations.",
            "For a teacher-provided image or scene, state the expected risk before testing. If it fails, explain the likely cause using scale, illumination, occlusion, or domain shift. A transparent failure analysis is stronger than hiding the error.",
        ],
        "The live website; keep a backup screen recording and screenshots ready",
        "After the demo, Member A will close with the limitations, required deployment work, and the final takeaway.",
    )

    add_slide_block(
        doc,
        "10",
        "Limitations and future work",
        "40 seconds",
        "Member A",
        [
            "Not yet reliable for darkness, heavy occlusion, long distance, or safety-critical counting",
            "Collect deployment-specific classroom/lab positives and negatives",
            "Audit complete-person boxes and freeze source-grouped splits",
            "Tune thresholds on validation; run the locked test once",
            "Benchmark end-to-end time-to-detect, stability, and device compatibility",
        ],
        [
            "The next improvement is not simply downloading a larger random dataset. We need images from the actual camera height, classroom or laboratory layout, lighting, crowd density, empty scenes, and look-alike objects. Every visible person must be consistently and completely labeled.",
            "After annotation audit, we will train a compact candidate, select thresholds only on validation, improve duplicate and temporal filtering, optimize inference, freeze the candidate, and run the locked test once. A real deployment would additionally need consent, device qualification, monitoring, and a manual fallback.",
        ],
        "Eight-step improvement roadmap",
    )

    add_slide_block(
        doc,
        "11",
        "Conclusion",
        "20 seconds",
        "Member A",
        [
            "Working private, on-device web prototype",
            "Final detector improves F1, AP50, count error, and speed",
            "Honest locked-test evidence defines where it can and cannot be trusted",
            "Repository: https://github.com/kristel1016/Shembot-v.2",
        ],
        [
            "In conclusion, SHEMBOT v2 is a working, reproducible on-device person-counting prototype. The final detector is measurably better than the earlier browser baseline, and the visible overlays make its decisions inspectable. Our evaluation also makes the remaining limitations clear. Thank you; we are ready for questions.",
        ],
        "One success screenshot, three headline improvements, repository QR code",
    )

    doc.add_page_break()
    doc.add_heading("Live-demo operating script", level=1)
    add_table(
        doc,
        ["Time", "Action", "What the speaker says", "Fallback"],
        [
            ["Before timer", "Open direct site; grant permission; choose camera; warm model.", "No narration needed.", "Use Chrome/Safari directly, not Messenger in-app browser."],
            ["0:00–0:40", "Show one well-lit person.", "The accepted box and stabilized count are visible; processing remains on the device.", "Use prepared screenshot if permission fails."],
            ["0:40–1:30", "Add a second person with limited overlap.", "The count changes after confirmation; tracking prevents single-frame flicker.", "Replay backup recording."],
            ["1:30–2:15", "Show camera switch and ROI.", "The detection area excludes persistent distractors and reduces unnecessary scanning.", "Describe controls without changing camera if unstable."],
            ["2:15–3:00", "Show a difficult condition.", "This is the measured limitation: low light/distance/occlusion reduces recall.", "Use saved failure gallery."],
            ["3:00–4:00", "Teacher input and explanation.", "Predict likely behavior, run it, then explain the result using evidence.", "Use Python/recorded demo if internet or camera fails."],
        ],
        widths=[0.8, 1.8, 3.0, 1.5],
        font_size=8.4,
    )
    doc.add_heading("Demo checklist", level=2)
    add_bullets(
        doc,
        [
            "[ ] Charge phone/laptop; disable battery saver; close camera-using apps.",
            "[ ] Use the direct URL in a current browser and test permissions before class.",
            "[ ] Clean lens; use front lighting; avoid severe backlight and posters/screens with people.",
            "[ ] Prepare one easy scene, one difficult scene, a backup video, and three screenshots.",
            "[ ] Increase display zoom so labels are readable from the back of the room.",
            "[ ] Keep the repository, final metrics table, and data card open in separate tabs.",
            "[ ] Assign exactly one demo driver; other members narrate and watch time.",
        ],
    )

    doc.add_heading("Questions to expect and prepared answers", level=1)
    qa = [
        (
            "Why is the test number lower or higher than validation?",
            "Validation was used for candidate and threshold selection, while the test split was locked. The scenes and difficulty distribution are not identical, so some difference is expected. A large gap can indicate overfitting or domain mismatch; we report the locked result and do not retune on it.",
        ),
        (
            "What does the confusion matrix tell you about the classes?",
            "This is a one-class detector, so we focus on true-positive person boxes, false-positive boxes, and false-negative people. True-negative background regions are not well defined. False positives show non-people counted as people; false negatives show people the detector missed. Precision summarizes FP behavior, while recall summarizes FN behavior.",
        ),
        (
            "How would it behave at night, at twice the distance, or on another camera?",
            "Performance would normally decrease. Night scenes reduce contrast; doubling distance reduces the number of pixels per person; and another camera changes lens, exposure, orientation, and noise. The low-light recall of 8.24% and small/distant analysis support this prediction. We would collect and validate data from the target setup before deployment.",
        ),
        (
            "Why these metrics instead of accuracy?",
            "Object detection has no fixed meaningful number of true-negative background locations, so conventional accuracy can be misleading. We report precision, recall, F1, AP50, mAP50–95, count MAE, and speed because they measure box correctness, missed people, ranking/overlap quality, count error, and practicality.",
        ),
        (
            "What is IoU, and which threshold did you use?",
            "Intersection over Union is the overlap area divided by the union area of a predicted box and ground-truth box. We use IoU 0.50 to decide a match for TP/FP/FN and AP50. mAP50–95 is stricter because it averages results from IoU 0.50 through 0.95.",
        ),
        (
            "Why did you choose this preprocessing?",
            "Orientation and mirroring corrections make phone frames consistent; aspect-preserving downscaling controls cost; brightness, blur, crop, and rotation augmentation expose the model to expected variability. We avoid uncontrolled enhancement that could distort colors or create train/test mismatch.",
        ),
        (
            "Why can one person produce multiple boxes?",
            "The detector can respond to a face, torso, limb, or the same person at multiple scan scales. We reduce this with NMS, containment and proximity rules, pose association, and temporal tracks. Overlapping boxes that survive indicate the detector and merge thresholds still need deployment-specific tuning.",
        ),
        (
            "Why can a detection disappear and return?",
            "Confidence changes with motion, blur, pose, and lighting. A prediction can fall below the threshold for one frame. We use a short temporal hold and periodic full-frame reacquisition to reduce flicker, but a long hold would create stale counts after a person leaves, so this is a latency-versus-stability trade-off.",
        ),
        (
            "What would you need to deploy this for real?",
            "We need deployment-specific labeled data, audited full-person boxes, source-grouped validation and locked testing, device and lighting benchmarks, end-to-end video metrics, threshold freezing, consent/privacy procedures, access control, monitoring, failure alerts, and a manual fallback. The present system is a prototype, not a safety-certified counter.",
        ),
        (
            "Why did adding more datasets make performance worse?",
            "Some added datasets used different camera angles, incomplete annotations, behavior regions, or classification labels rather than complete person boxes. This changed the target definition and introduced domain mismatch. The classroom combined run fell to 5.57% AP50, so it was correctly rejected instead of being deployed.",
        ),
        (
            "Is the reported 31.64 FPS the live phone speed?",
            "No. It is detector-only CPU evaluation. Live speed also includes camera capture, frame conversion, pose checks, duplicate suppression, tracking, and drawing, and it depends on the phone and browser. We report live demo responsiveness separately.",
        ),
    ]
    for question, answer in qa:
        p = doc.add_paragraph()
        r = p.add_run("Q: " + question)
        r.bold = True
        r.font.color.rgb = RGBColor.from_string(BLUE)
        p = doc.add_paragraph("A: " + answer)
        p.paragraph_format.left_indent = Inches(0.2)

    doc.add_heading("Slide asset checklist", level=1)
    add_table(
        doc,
        ["Asset", "Repository/source", "Use"],
        [
            ["Final mobile screenshot", "Capture from live site", "Title and conclusion"],
            ["Dataset sample", "data/test/images or approved primary dataset", "Dataset slide"],
            ["Pipeline diagram", "reports/milestone4_workflow.png", "Approach slide"],
            ["Preprocessing comparison", "evidence/preprocessing_comparison.jpg", "Optional methodology backup"],
            ["Failure examples", "reports/milestone4_limitations_examples.jpg", "Limitations slide"],
            ["Metrics", "training/EXPERIMENT_RESULTS.md and reports/MILESTONE_4_REPORT.md", "Results slides"],
            ["Backup demo", "Record the current direct live site before presentation", "Live-demo fallback"],
            ["QR code", "https://kristel1016.github.io/Shembot-v.2/", "Title/conclusion"],
        ],
        widths=[1.5, 3.1, 2.2],
    )

    doc.add_heading("Final presentation checks", level=1)
    add_bullets(
        doc,
        [
            "[ ] Replace Member A/B/C and team placeholders.",
            "[ ] Use no more than 5–6 short lines per main slide; keep detailed text in speaker notes.",
            "[ ] Use percentage-point wording for metric differences.",
            "[ ] Label 31.64 FPS as detector-only and keep Python-pipeline metrics separate.",
            "[ ] Do not call F1, AP, or precision ‘accuracy.’",
            "[ ] Rehearse the 10-minute talk and 4-minute demo with a timer.",
            "[ ] Test the direct URL on the actual presentation network and device.",
            "[ ] Keep all slides, weights link, and backup recording in the v1.0 release/submission package.",
        ],
    )

    REPORTS.mkdir(parents=True, exist_ok=True)
    doc.save(PRESENTATION_PATH)


if __name__ == "__main__":
    build_report()
    build_presentation_document()
    print(REPORT_PATH)
    print(PRESENTATION_PATH)
