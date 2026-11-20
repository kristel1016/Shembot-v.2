from __future__ import annotations

from pathlib import Path
from xml.sax.saxutils import escape

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "reports" / "individual_contributions"
OUT.mkdir(parents=True, exist_ok=True)

BLUE = "2454D6"
NAVY = "17365D"
TEAL = "159E8C"
LIGHT_BLUE = "EAF1FF"
LIGHT_YELLOW = "FFF5CC"
GRAY = "666666"
BLACK = "202124"

REPO_URL = "https://github.com/kristel1016/Shembot-v.2"


MEMBERS = [
    {
        "file_stem": "Kristel-Surname - Contribution",
        "name": "Kristel [INSERT SURNAME]",
        "git_identity": "maaxzxz <althearaiv@gmail.com>",
        "role": "Model, data, evaluation, and browser detection integration",
        "built": [
            (
                "Browser detection and tracking pipeline",
                "I implemented and repeatedly corrected the live detection path in src/js/app.js and src/js/boot.js. My work covered person-only filtering, duplicate suppression, temporal track holding, camera-frame validation, fast full-frame reacquisition, and the compatible generic-detector fallback.",
            ),
            (
                "Training and browser-path evaluation",
                "I developed the training and data-preparation workflow in training/train_efficientdet_lite.py, training/prepare_extended_person_voc.py, training/prepare_classroom_person_voc.py, and training/evaluate_browser_tflite.py. The evaluator runs the same MediaPipe/TFLite inference path used by the website and reports precision, recall, F1, AP50, mAP50–95, count MAE, and CPU FPS.",
            ),
            (
                "Locked-test evaluation and failure evidence",
                "I integrated the reproducible Python evaluation in src/evaluate.py, the condition breakdown, failure gallery, metrics JSON/CSV outputs, and the documentation in training/EXPERIMENT_RESULTS.md and reports/DATA_CARD.md.",
            ),
        ],
        "commits": [
            ("d932c15", "Improve person-detector evaluation and data workflow"),
            ("4ef0eab", "Complete Milestone 4 application and evaluation"),
            ("6c84eb2", "Recover detection from invalid camera frames"),
            ("a77d1b2", "Add compatible browser detector fallback"),
            ("c24b72a", "Reduce live person reacquisition delay"),
        ],
        "decision": (
            "I decided to keep the custom optimized TFLite detector as the primary browser model, retain a compatible generic model only as a runtime fallback, and use a 0.26 confidence threshold for the reported browser-detector test. I rejected the combined classroom candidate even though it used more images because its annotation style did not consistently describe one complete person and its AP50 fell to 5.57%. The final custom detector produced 40.89% precision, 28.69% recall, 33.72% F1, 24.49% AP50, 4.20 count MAE, and 31.64 detector-only CPU FPS. The evidence supported model quality and compatibility over dataset size alone."
        ),
        "problem": (
            "A serious live-camera problem was that detection sometimes stopped with a divide-by-zero error and, after recovery, could take too long to detect the same person again. I traced the first issue to camera frames whose width or height was temporarily zero during startup, orientation change, or camera switching. I added nonzero-dimension guards and automatic frame retry so one invalid frame no longer paused the camera. I traced delayed reacquisition to the scan schedule and temporal state: after a missed frame, the next useful full-frame scan could be delayed. I shortened reacquisition, retained a brief 2.2-second valid-track hold to reduce flicker, and added a compatible detector fallback for devices that could not initialize the primary path."
        ),
        "learned": [
            "I learned why object detection should be evaluated with IoU, precision, recall, F1, AP, and count MAE instead of conventional accuracy. A background image does not provide a meaningful fixed number of true-negative boxes.",
            "I learned how source-grouped splitting prevents leakage: all augmented copies of one original scene must remain in the same train, validation, or test split.",
            "If I repeated the project, I would collect deployment-specific classroom/laboratory frames and build an annotated end-to-end video benchmark before extensive threshold and postprocessing changes. That would measure time-to-detect, duplicate duration, and time-to-clear directly.",
        ],
        "walkthrough": "Open training/evaluate_browser_tflite.py or src/js/app.js. Explain input preparation, person filtering, confidence/IoU matching, duplicate merging, temporal state, and why metrics are saved separately from live UI speed.",
        "what_if": [
            "If confidence changes from 0.26 to 0.20, recall should generally increase because more weak boxes are retained, but false positives should also increase and precision may fall.",
            "If temporal hold is doubled, boxes will flicker less but departed people will remain counted longer, increasing stale-count error.",
            "If every frame uses all zoom crops, small-person recall may rise, but CPU cost and latency will increase substantially.",
        ],
        "concepts": [
            "IoU: intersection area divided by union area; IoU 0.50 is the match threshold for TP/FP/FN and AP50.",
            "Validation is used for choices; the locked test is used once for the final unbiased estimate.",
            "NMS removes overlapping proposals, while temporal tracking associates accepted people across frames.",
        ],
    },
    {
        "file_stem": "Macatangay - Contribution",
        "name": "Shaine Carla Macatangay",
        "git_identity": "Macatangay, Shaine Carla <228420363+macatangay-shaine@users.noreply.github.com>",
        "role": "Repository integration, mobile demonstration, and deployment validation",
        "built": [
            (
                "Repository and pull-request integration",
                "I integrated the web-interface and deployment changes through the project pull requests. My merge commits brought the reorganized MediaPipe assets, GitHub Pages workflow, responsive camera console, revised dashboard, and later desktop-density fixes into the main project history.",
            ),
            (
                "Mobile/device testing and demonstration readiness",
                "I owned the mobile/laptop checking tasks recorded in docs/remaining.md: verifying the public HTTPS site, checking the camera flow on real devices, observing warm-up and FPS behavior, preparing demonstration inputs, and coordinating the backup recording. These checks exposed differences between a direct browser and an embedded Messenger/in-app browser.",
            ),
            (
                "Public-site usability review",
                "I reviewed index.html, assets/css/styles.css, src/js/app.js, src/js/boot.js, and .github/workflows/deploy-pages.yml as an integrated application. My focus was that the camera, count, controls, and overlays remained usable on a portrait phone and a desktop without requiring localhost.",
            ),
        ],
        "commits": [
            ("8c70318", "Merge reorganized project structure and MediaPipe assets"),
            ("0500043", "Merge GitHub Pages detector deployment"),
            ("62d0aa6", "Merge redesigned camera-console interface"),
            ("d2e0cc6", "Merge refreshed dashboard interface"),
            ("a117366", "Merge normalized desktop dashboard density"),
        ],
        "decision": (
            "I chose to keep the public demonstration on GitHub Pages through the direct HTTPS URL instead of requiring localhost. This made the app easier to open on a phone and allowed camera permission in a secure context. For the demonstration, I also chose a direct current browser instead of an embedded social-media browser because embedded browsers showed slower model startup, reduced memory, and inconsistent camera behavior. I separated detector-only benchmark FPS from live-device FPS so the presentation would not claim that every phone runs at 31.64 FPS."
        ),
        "problem": (
            "A practical problem was that the phone could remain on the loading screen, respond slowly, or fail to update detections even though the same site worked on a laptop. I compared the direct browser and the in-app browser, checked camera permission and device orientation, and observed that the first visit had to download and compile local model/WASM assets. I helped isolate the presentation risk to browser/device startup rather than only the camera scene. The solution was to use the direct HTTPS site in Chrome/Safari, warm the model before the timed demo, close other camera apps, keep a backup recording, and preserve a compatible detector fallback for devices where the primary runtime failed."
        ),
        "learned": [
            "I learned that a model’s detector-only FPS is not the same as end-to-end camera speed. Live speed also includes capture, frame conversion, pose checks, tracking, and rendering.",
            "I learned how secure-context camera permission, responsive layout, device orientation, and browser runtime support affect a computer-vision demonstration even when the model weights are unchanged.",
            "If I repeated the project, I would create a device/browser test matrix earlier and record cold-start time, warm FPS, camera-switch success, memory failures, and detection latency on each target phone.",
        ],
        "walkthrough": "Open .github/workflows/deploy-pages.yml together with index.html, or demonstrate the live site. Explain how the static files are published, why HTTPS is required for camera access, and how the same UI adapts to phone and desktop layouts.",
        "what_if": [
            "If the camera supplies 60 FPS instead of 30 FPS, the app should still throttle expensive inference; processing every captured frame would raise heat and latency without doubling useful detection updates.",
            "If the app is opened in an embedded Messenger browser, model/WASM startup and camera behavior may differ; use the system browser as the supported path.",
            "If the display width becomes smaller, responsive CSS must stack controls and scale the overlay with the video while preserving coordinate alignment.",
        ],
        "concepts": [
            "Cold start versus warm inference: the first run includes model download, WebAssembly initialization, and compilation; later runs may use cache.",
            "Secure context: browsers normally require HTTPS or localhost before getUserMedia camera access is allowed.",
            "A device benchmark must state browser, hardware, model, input size, whether warm-up is excluded, and whether FPS is detector-only or end-to-end.",
        ],
    },
    {
        "file_stem": "Member3-Surname - Contribution",
        "name": "[INSERT THIRD MEMBER FULL NAME]",
        "git_identity": "Solo Parent DSS Team <developer@soloparentdss.com> — CONFIRM WHO USED THIS GIT IDENTITY",
        "role": "Interface design, responsive camera workspace, and visual controls",
        "built": [
            (
                "Responsive camera-console interface",
                "I developed the presentation layer in assets/css/styles.css and index.html, including the camera workspace, desktop sidebar, mobile portrait layout, dashboard cards, control panels, typography, spacing, and readable status states.",
            ),
            (
                "Camera and counting controls",
                "I designed and refined the camera control bar and entry/exit counting-line panel across index.html, assets/css/styles.css, src/js/app.js, and src/js/boot.js. The interface exposes camera start/stop, camera switching, detection area, room capacity, count history, and entry/exit controls without hiding the video output.",
            ),
            (
                "Mobile-preview and desktop-density fixes",
                "I corrected the camera-stage sizing so the preview fills the available area on a phone, then normalized desktop density so the feed and settings remain visible together. I also added the SHEMBOT logo and refreshed the visual hierarchy for classroom presentation.",
            ),
        ],
        "commits": [
            ("63f05b6", "Redesign camera-console interface"),
            ("9174a89", "Fill camera stage and expand mobile preview"),
            ("77607fc", "Redesign counting-line panel"),
            ("7d72aca", "Refresh dashboard interface"),
            ("4a9ac15", "Normalize desktop dashboard density"),
        ],
        "decision": (
            "I chose a mobile-first single-camera workspace with the live feed as the dominant element and placed secondary settings below or beside it depending on screen width. I rejected a dense desktop-only layout because the project is frequently opened on a phone. I retained visible boxes, confidence, count, and status rather than showing only a number, because an operator must be able to see what the system counted and recognize a false positive. The final colors and spacing were selected for contrast and readability during a classroom demonstration."
        ),
        "problem": (
            "One interface problem was that the camera preview did not fill the stage consistently: on portrait phones it could appear too small, while desktop cards and controls competed for space. I reproduced the problem at multiple viewport widths, traced it to fixed dimensions and container constraints, and changed the stage, video, canvas, and responsive breakpoints so the preview expands while keeping the overlay aligned. I then reduced desktop spacing and sidebar width so the camera and detection controls remain visible without excessive scrolling."
        ),
        "learned": [
            "I learned that a computer-vision interface must preserve the same coordinate system for the source video and overlay canvas; visual resizing cannot be handled independently from box scaling.",
            "I learned how responsive breakpoints, aspect ratio, object-fit behavior, and stacking order affect whether users can interpret real-time model output.",
            "If I repeated the project, I would create a small design system and automated viewport screenshots at the start, and I would configure Git with my real individual name instead of a shared team identity so contribution evidence is unambiguous.",
        ],
        "walkthrough": "Open assets/css/styles.css and index.html. Point to the camera-stage container, video/canvas layers, mobile breakpoint, control bar, and desktop grid. Explain why the overlay and video must use matching rendered dimensions.",
        "what_if": [
            "If the phone rotates from portrait to landscape, the layout must recompute available width while the camera code updates orientation and overlay coordinates.",
            "If the camera changes from 16:9 to 4:3, object-fit and the overlay mapping must use the actual rendered content area; otherwise boxes shift away from people.",
            "If confidence labels are removed, the screen becomes cleaner but users lose evidence for why a marginal box appeared or disappeared.",
        ],
        "concepts": [
            "Responsive design uses flexible dimensions and breakpoints so the same controls remain usable at different viewport sizes.",
            "Overlay coordinates must be scaled from inference coordinates to the displayed video rectangle, including mirroring and orientation.",
            "Human-centered model output should expose uncertainty and failure evidence rather than hiding every internal decision behind one count.",
        ],
    },
]


def _set_cell_shading(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def _set_cell_margins(cell, top=80, start=100, bottom=80, end=100) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for tag, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        element = tc_mar.find(qn(f"w:{tag}"))
        if element is None:
            element = OxmlElement(f"w:{tag}")
            tc_mar.append(element)
        element.set(qn("w:w"), str(value))
        element.set(qn("w:type"), "dxa")


def _configure_docx(doc: Document, title: str) -> None:
    section = doc.sections[0]
    section.top_margin = Inches(0.55)
    section.bottom_margin = Inches(0.55)
    section.left_margin = Inches(0.65)
    section.right_margin = Inches(0.65)
    normal = doc.styles["Normal"]
    normal.font.name = "Aptos"
    normal.font.size = Pt(9.5)
    normal.font.color.rgb = RGBColor.from_string(BLACK)
    normal.paragraph_format.space_after = Pt(4)
    normal.paragraph_format.line_spacing = 1.02
    for style_name, size in (("Title", 22), ("Heading 1", 15), ("Heading 2", 11.5)):
        style = doc.styles[style_name]
        style.font.name = "Aptos Display"
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = RGBColor.from_string(BLUE if style_name != "Heading 2" else NAVY)
        style.paragraph_format.space_before = Pt(6)
        style.paragraph_format.space_after = Pt(3)
        style.paragraph_format.keep_with_next = True
    header = section.header.paragraphs[0]
    header.text = "CSST 106 — SHEMBOT v2 Individual Contribution Statement"
    header.runs[0].font.size = Pt(8)
    header.runs[0].font.color.rgb = RGBColor.from_string(GRAY)
    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    footer.add_run(title + "  •  ").font.size = Pt(8)
    fld = OxmlElement("w:fldSimple")
    fld.set(qn("w:instr"), "PAGE")
    footer._p.append(fld)


def _docx_meta_table(doc: Document, member: dict) -> None:
    table = doc.add_table(rows=4, cols=2)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    rows = [
        ("Student", member["name"]),
        ("Primary role", member["role"]),
        ("Git identity", member["git_identity"]),
        ("Repository", REPO_URL),
    ]
    for row, (label, value) in zip(table.rows, rows):
        _set_cell_shading(row.cells[0], LIGHT_BLUE)
        for cell in row.cells:
            _set_cell_margins(cell)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        row.cells[0].paragraphs[0].add_run(label).bold = True
        row.cells[1].paragraphs[0].add_run(value)
    doc.add_paragraph()


def _docx_commit_table(doc: Document, member: dict) -> None:
    table = doc.add_table(rows=1, cols=3)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for idx, header in enumerate(("Commit", "Evidence", "Link")):
        _set_cell_shading(table.rows[0].cells[idx], BLUE)
        r = table.rows[0].cells[idx].paragraphs[0].add_run(header)
        r.bold = True
        r.font.color.rgb = RGBColor(255, 255, 255)
    for sha, description in member["commits"]:
        cells = table.add_row().cells
        cells[0].text = sha
        cells[1].text = description
        cells[2].text = f"{REPO_URL}/commit/{sha}"
        for cell in cells:
            _set_cell_margins(cell)
            for run in cell.paragraphs[0].runs:
                run.font.size = Pt(8)
    doc.add_paragraph()


def build_member_docx(member: dict) -> Path:
    doc = Document()
    _configure_docx(doc, member["name"])
    doc.core_properties.title = f"{member['name']} — Individual Contribution Statement"
    doc.core_properties.author = member["name"]

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("SHEMBOT v2")
    r.bold = True
    r.font.name = "Aptos Display"
    r.font.size = Pt(25)
    r.font.color.rgb = RGBColor.from_string(NAVY)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("Individual Contribution Statement")
    r.bold = True
    r.font.name = "Aptos Display"
    r.font.size = Pt(18)
    r.font.color.rgb = RGBColor.from_string(BLUE)

    _docx_meta_table(doc, member)

    if "INSERT" in member["name"] or "CONFIRM" in member["git_identity"]:
        table = doc.add_table(rows=1, cols=1)
        _set_cell_shading(table.cell(0, 0), LIGHT_YELLOW)
        p = table.cell(0, 0).paragraphs[0]
        r = p.add_run("EDIT BEFORE SUBMISSION: ")
        r.bold = True
        r.font.color.rgb = RGBColor.from_string("C00000")
        p.add_run("Replace the name/surname and confirm that the listed Git identity and work belong to this member. Remove this note afterward.")
        doc.add_paragraph()

    doc.add_heading("1. What I built", level=1)
    for title, body in member["built"]:
        p = doc.add_paragraph()
        r = p.add_run(title + ". ")
        r.bold = True
        p.add_run(body)
    doc.add_heading("Key commit evidence", level=2)
    _docx_commit_table(doc, member)

    doc.add_heading("2. A decision I made", level=1)
    doc.add_paragraph(member["decision"])

    doc.add_heading("3. A problem I solved", level=1)
    doc.add_paragraph(member["problem"])

    doc.add_heading("4. What I learned", level=1)
    for item in member["learned"]:
        doc.add_paragraph(item, style="List Bullet")

    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(6)
    r = p.add_run("Submission declaration: ")
    r.bold = True
    p.add_run("I reviewed this statement and confirm that it describes my own work and decisions. [Student signature/name: ____________________] [Date: __________]")

    path = OUT / f"{member['file_stem']}.docx"
    doc.save(path)
    return path


def _pdf_styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "TitleX", parent=base["Title"], fontName="Helvetica-Bold", fontSize=20,
            leading=23, textColor=colors.HexColor("#" + NAVY), alignment=TA_CENTER, spaceAfter=5,
        ),
        "subtitle": ParagraphStyle(
            "SubtitleX", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=14,
            leading=17, textColor=colors.HexColor("#" + BLUE), alignment=TA_CENTER, spaceAfter=10,
        ),
        "h1": ParagraphStyle(
            "H1X", parent=base["Heading1"], fontName="Helvetica-Bold", fontSize=13,
            leading=15, textColor=colors.HexColor("#" + BLUE), spaceBefore=7, spaceAfter=4,
        ),
        "h2": ParagraphStyle(
            "H2X", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=10,
            leading=12, textColor=colors.HexColor("#" + NAVY), spaceBefore=4, spaceAfter=2,
        ),
        "body": ParagraphStyle(
            "BodyX", parent=base["BodyText"], fontName="Helvetica", fontSize=8.7,
            leading=11.1, textColor=colors.HexColor("#" + BLACK), spaceAfter=4, alignment=TA_LEFT,
        ),
        "small": ParagraphStyle(
            "SmallX", parent=base["BodyText"], fontName="Helvetica", fontSize=7.3,
            leading=9, textColor=colors.HexColor("#" + BLACK),
        ),
        "warn": ParagraphStyle(
            "WarnX", parent=base["BodyText"], fontName="Helvetica-Bold", fontSize=8,
            leading=10, textColor=colors.HexColor("#A00000"),
        ),
    }


def _pdf_footer(canvas, doc) -> None:
    canvas.saveState()
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(colors.HexColor("#" + GRAY))
    canvas.drawString(0.65 * inch, 0.38 * inch, "CSST 106 — SHEMBOT v2 Individual Contribution Statement")
    canvas.drawRightString(A4[0] - 0.65 * inch, 0.38 * inch, f"Page {doc.page}")
    canvas.restoreState()


def build_member_pdf(member: dict) -> Path:
    styles = _pdf_styles()
    path = OUT / f"{member['file_stem']}.pdf"
    pdf = SimpleDocTemplate(
        str(path), pagesize=A4, rightMargin=0.57 * inch, leftMargin=0.57 * inch,
        topMargin=0.52 * inch, bottomMargin=0.55 * inch,
        title=f"{member['name']} — Individual Contribution Statement",
        author=member["name"],
    )
    story = [
        Paragraph("SHEMBOT v2", styles["title"]),
        Paragraph("Individual Contribution Statement", styles["subtitle"]),
    ]

    meta = [
        [Paragraph("<b>Student</b>", styles["small"]), Paragraph(escape(member["name"]), styles["small"])],
        [Paragraph("<b>Primary role</b>", styles["small"]), Paragraph(escape(member["role"]), styles["small"])],
        [Paragraph("<b>Git identity</b>", styles["small"]), Paragraph(escape(member["git_identity"]), styles["small"])],
        [Paragraph("<b>Repository</b>", styles["small"]), Paragraph(REPO_URL, styles["small"])],
    ]
    table = Table(meta, colWidths=[1.15 * inch, 5.65 * inch])
    table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#C7D3E8")),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#" + LIGHT_BLUE)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.extend([table, Spacer(1, 5)])
    if "INSERT" in member["name"] or "CONFIRM" in member["git_identity"]:
        warn = Table([[Paragraph(
            "EDIT BEFORE SUBMISSION: replace the name/surname and confirm that this Git identity and work belong to the member. Remove this note afterward.",
            styles["warn"],
        )]], colWidths=[6.8 * inch])
        warn.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#" + LIGHT_YELLOW)),
            ("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor("#E1B800")),
            ("LEFTPADDING", (0, 0), (-1, -1), 7),
            ("RIGHTPADDING", (0, 0), (-1, -1), 7),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.extend([warn, Spacer(1, 3)])

    story.append(Paragraph("1. What I built", styles["h1"]))
    for title, body in member["built"]:
        story.append(Paragraph(f"<b>{escape(title)}.</b> {escape(body)}", styles["body"]))

    story.append(Paragraph("Key commit evidence", styles["h2"]))
    rows = [[
        Paragraph("<b>Commit</b>", styles["small"]),
        Paragraph("<b>Evidence</b>", styles["small"]),
        Paragraph("<b>Repository link</b>", styles["small"]),
    ]]
    for sha, description in member["commits"]:
        rows.append([
            Paragraph(sha, styles["small"]),
            Paragraph(escape(description), styles["small"]),
            Paragraph(f"{REPO_URL}/commit/{sha}", styles["small"]),
        ])
    commits = Table(rows, colWidths=[0.62 * inch, 2.45 * inch, 3.73 * inch], repeatRows=1)
    commits.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#" + BLUE)),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#C7D3E8")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.extend([commits, Spacer(1, 3)])
    story.append(Paragraph("2. A decision I made", styles["h1"]))
    story.append(Paragraph(escape(member["decision"]), styles["body"]))
    story.append(Paragraph("3. A problem I solved", styles["h1"]))
    story.append(Paragraph(escape(member["problem"]), styles["body"]))
    story.append(Paragraph("4. What I learned", styles["h1"]))
    bullets = [ListItem(Paragraph(escape(item), styles["body"]), leftIndent=12) for item in member["learned"]]
    story.append(ListFlowable(bullets, bulletType="bullet", leftIndent=16, bulletFontSize=6))
    story.append(Spacer(1, 5))
    story.append(Paragraph(
        "<b>Submission declaration:</b> I reviewed this statement and confirm that it describes my own work and decisions. "
        "[Student signature/name: ____________________] [Date: __________]",
        styles["body"],
    ))
    pdf.build(story, onFirstPage=_pdf_footer, onLaterPages=_pdf_footer)
    return path


def build_defense_guide_docx() -> Path:
    doc = Document()
    _configure_docx(doc, "Three-member defense guide")
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("SHEMBOT v2 — Individual Defense Preparation")
    r.bold = True
    r.font.name = "Aptos Display"
    r.font.size = Pt(22)
    r.font.color.rgb = RGBColor.from_string(NAVY)
    doc.add_paragraph(
        "Use this guide to rehearse the 2–3 minute individual defense. Each member should be ready for one file walk-through, one parameter/change prediction, and one concept question tied to their actual work."
    )
    for idx, member in enumerate(MEMBERS, 1):
        doc.add_heading(f"Member {idx}: {member['name']}", level=1)
        doc.add_heading("A. File walk-through", level=2)
        doc.add_paragraph(member["walkthrough"])
        doc.add_heading("B. “What if?” predictions", level=2)
        for item in member["what_if"]:
            doc.add_paragraph(item, style="List Bullet")
        doc.add_heading("C. Concepts to explain without reading", level=2)
        for item in member["concepts"]:
            doc.add_paragraph(item, style="List Bullet")
        doc.add_heading("Suggested 2–3 minute answer structure", level=2)
        doc.add_paragraph(
            "Start with the file’s input and output. Point to one important function or CSS/workflow block. Explain why it exists, name one failure it prevents, predict the requested change using a trade-off, and finish with the measured evidence or test you would run to verify the prediction."
        )
        if idx != len(MEMBERS):
            doc.add_page_break()
    path = OUT / "THREE_MEMBER_DEFENSE_PREPARATION.docx"
    doc.save(path)
    return path


def build_defense_guide_pdf() -> Path:
    styles = _pdf_styles()
    path = OUT / "THREE_MEMBER_DEFENSE_PREPARATION.pdf"
    pdf = SimpleDocTemplate(
        str(path), pagesize=A4, rightMargin=0.65 * inch, leftMargin=0.65 * inch,
        topMargin=0.55 * inch, bottomMargin=0.6 * inch,
        title="SHEMBOT v2 — Three-Member Defense Preparation",
    )
    story = [
        Paragraph("SHEMBOT v2", styles["title"]),
        Paragraph("Three-Member Individual Defense Preparation", styles["subtitle"]),
        Paragraph(
            "Each member should be ready for a 2–3 minute file walk-through, a ‘what if’ prediction, and a concept question tied to actual work.",
            styles["body"],
        ),
    ]
    for idx, member in enumerate(MEMBERS, 1):
        if idx > 1:
            story.append(PageBreak())
        story.append(Paragraph(f"Member {idx}: {escape(member['name'])}", styles["h1"]))
        story.append(Paragraph("A. File walk-through", styles["h2"]))
        story.append(Paragraph(escape(member["walkthrough"]), styles["body"]))
        story.append(Paragraph("B. ‘What if?’ predictions", styles["h2"]))
        story.append(ListFlowable(
            [ListItem(Paragraph(escape(item), styles["body"]), leftIndent=12) for item in member["what_if"]],
            bulletType="bullet", leftIndent=16, bulletFontSize=6,
        ))
        story.append(Paragraph("C. Concepts to explain without reading", styles["h2"]))
        story.append(ListFlowable(
            [ListItem(Paragraph(escape(item), styles["body"]), leftIndent=12) for item in member["concepts"]],
            bulletType="bullet", leftIndent=16, bulletFontSize=6,
        ))
        story.append(Paragraph("Suggested 2–3 minute answer structure", styles["h2"]))
        story.append(Paragraph(
            "Start with the file’s input and output. Point to one important function or style/workflow block. Explain why it exists and one failure it prevents. Predict the requested change using a trade-off, then finish with the metric or test you would use to verify the prediction.",
            styles["body"],
        ))
    pdf.build(story, onFirstPage=_pdf_footer, onLaterPages=_pdf_footer)
    return path


def main() -> None:
    generated: list[Path] = []
    for member in MEMBERS:
        generated.append(build_member_docx(member))
        generated.append(build_member_pdf(member))
    generated.append(build_defense_guide_docx())
    generated.append(build_defense_guide_pdf())
    for path in generated:
        print(path)


if __name__ == "__main__":
    main()
