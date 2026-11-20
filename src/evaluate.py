"""Compare the baseline and integrated SHEMBOT pipeline on the locked test set."""

from __future__ import annotations

import argparse
import csv
import json
import sys
import time
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

import cv2
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from pipeline import Detection, PersonPipeline, box_iou  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--images", type=Path, default=ROOT / "data" / "test" / "images")
    parser.add_argument(
        "--annotations", type=Path, default=ROOT / "data" / "test" / "annotations"
    )
    parser.add_argument(
        "--model", type=Path,
        default=ROOT / "evaluation" / "models" / "object_detection_yolox_2022nov_int8.onnx",
    )
    parser.add_argument("--output", type=Path, default=ROOT / "outputs" / "milestone3")
    parser.add_argument("--confidence", type=float, default=0.10)
    parser.add_argument("--nms", type=float, default=0.50)
    parser.add_argument("--containment", type=float, default=0.95)
    parser.add_argument("--min-area-ratio", type=float, default=0.001)
    parser.add_argument("--max-aspect", type=float, default=1.65)
    parser.add_argument("--iou", type=float, default=0.50)
    parser.add_argument("--limit", type=int, default=0, help="Optional deterministic image limit")
    parser.add_argument("--failure-gallery-size", type=int, default=12)
    args = parser.parse_args()
    for value, label in (
        (args.confidence, "confidence"),
        (args.nms, "nms"),
        (args.containment, "containment"),
        (args.iou, "iou"),
    ):
        if not 0.0 <= value <= 1.0:
            parser.error(f"--{label} must be between 0 and 1")
    if args.limit < 0 or args.failure_gallery_size < 10:
        parser.error("--limit cannot be negative and --failure-gallery-size must be at least 10")
    return args


def parse_annotation(path: Path) -> list[tuple[int, int, int, int]]:
    root = ET.parse(path).getroot()
    boxes: list[tuple[int, int, int, int]] = []
    for item in root.findall("object"):
        # The Roboflow VOC export encodes its only class as numeric label ``0``;
        # earlier normalized samples use the descriptive label ``person``.
        if item.findtext("name", "").strip().lower() not in {"person", "0"}:
            continue
        box = item.find("bndbox")
        if box is None:
            continue
        x1 = int(round(float(box.findtext("xmin", "0"))))
        y1 = int(round(float(box.findtext("ymin", "0"))))
        x2 = int(round(float(box.findtext("xmax", "0"))))
        y2 = int(round(float(box.findtext("ymax", "0"))))
        if x2 > x1 and y2 > y1:
            boxes.append((x1, y1, x2 - x1, y2 - y1))
    return boxes


def match_detections(
    detections: list[Detection],
    ground_truth: list[tuple[int, int, int, int]],
    iou_threshold: float,
) -> tuple[int, int, int]:
    unmatched = set(range(len(ground_truth)))
    true_positives = 0
    for detection in sorted(detections, key=lambda item: item.score, reverse=True):
        candidates = [(box_iou(detection.box, ground_truth[index]), index) for index in unmatched]
        best_iou, best_index = max(candidates, default=(0.0, -1))
        if best_iou >= iou_threshold:
            unmatched.remove(best_index)
            true_positives += 1
    return true_positives, len(detections) - true_positives, len(unmatched)


def average_precision(
    predictions: list[tuple[int, Detection]],
    ground_truth_by_image: list[list[tuple[int, int, int, int]]],
    iou_threshold: float,
) -> float:
    total_ground_truth = sum(len(items) for items in ground_truth_by_image)
    if total_ground_truth == 0:
        return 0.0
    unmatched = [set(range(len(items))) for items in ground_truth_by_image]
    true_positive_flags: list[int] = []
    false_positive_flags: list[int] = []
    for image_index, detection in sorted(predictions, key=lambda item: item[1].score, reverse=True):
        candidates = [
            (box_iou(detection.box, ground_truth_by_image[image_index][index]), index)
            for index in unmatched[image_index]
        ]
        best_iou, best_index = max(candidates, default=(0.0, -1))
        is_match = best_iou >= iou_threshold
        true_positive_flags.append(1 if is_match else 0)
        false_positive_flags.append(0 if is_match else 1)
        if is_match:
            unmatched[image_index].remove(best_index)

    cumulative_tp = np.cumsum(true_positive_flags)
    cumulative_fp = np.cumsum(false_positive_flags)
    recalls = cumulative_tp / total_ground_truth
    precisions = cumulative_tp / np.maximum(cumulative_tp + cumulative_fp, 1)
    return float(
        np.mean([
            np.max(precisions[recalls >= recall_level], initial=0.0)
            for recall_level in np.linspace(0.0, 1.0, 101)
        ])
    )


def image_characteristics(
    image: np.ndarray,
    ground_truth: list[tuple[int, int, int, int]],
) -> dict[str, float | bool]:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    height, width = gray.shape
    frame_area = float(width * height)
    gt_area_ratios = [(box_width * box_height) / frame_area for _, _, box_width, box_height in ground_truth]
    border_touch = any(
        x <= 2 or y <= 2 or x + box_width >= width - 2 or y + box_height >= height - 2
        for x, y, box_width, box_height in ground_truth
    )
    return {
        "mean_brightness": float(np.mean(gray)),
        "blur_variance": float(cv2.Laplacian(gray, cv2.CV_64F).var()),
        "smallest_gt_area_ratio": min(gt_area_ratios, default=1.0),
        "border_touch": border_touch,
    }


def failure_cause(row: dict[str, object]) -> str:
    if float(row["mean_brightness"]) < 65.0:
        return "Lighting / low light"
    if float(row["blur_variance"]) < 75.0:
        return "Image quality / blur"
    if int(row["ground_truth"]) >= 10:
        return "Occlusion and clutter"
    if int(row["false_negatives"]) > 0 and float(row["smallest_gt_area_ratio"]) < 0.012:
        return "Viewpoint and scale / small people"
    if bool(row["border_touch"]):
        return "Viewpoint / partial person at frame edge"
    if int(row["false_positives"]) > int(row["false_negatives"]):
        return "Look-alike background false positive"
    return "Missed detection / low confidence"


def render_failure(
    image: np.ndarray,
    detections: list[Detection],
    ground_truth: list[tuple[int, int, int, int]],
    label: str,
) -> np.ndarray:
    output = image.copy()
    for x, y, width, height in ground_truth:
        cv2.rectangle(output, (x, y), (x + width, y + height), (255, 170, 0), 2)
    for detection in detections:
        x, y, width, height = detection.box
        cv2.rectangle(output, (x, y), (x + width, y + height), (59, 211, 143), 2)
    cv2.rectangle(output, (0, 0), (output.shape[1], 58), (0, 0, 0), -1)
    cv2.putText(
        output, label[:90], (10, 34), cv2.FONT_HERSHEY_SIMPLEX,
        0.58, (255, 255, 255), 2, cv2.LINE_AA,
    )
    return output


def summarize_mode(
    mode: str,
    rows: list[dict[str, object]],
    predictions: list[tuple[int, Detection]],
    ground_truth_by_image: list[list[tuple[int, int, int, int]]],
    confidence: float,
    nms: float,
    containment: float,
    min_area_ratio: float,
    max_aspect: float,
    iou: float,
) -> dict[str, object]:
    tp = sum(int(row["true_positives"]) for row in rows)
    fp = sum(int(row["false_positives"]) for row in rows)
    fn = sum(int(row["false_negatives"]) for row in rows)
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    mean_ms = float(np.mean([float(row["inference_ms"]) for row in rows]))
    ap_values = [
        average_precision(predictions, ground_truth_by_image, threshold)
        for threshold in np.arange(0.50, 0.96, 0.05)
    ]
    return {
        "method": mode,
        "images": len(rows),
        "ground_truth_people": sum(int(row["ground_truth"]) for row in rows),
        "confidence_threshold": confidence,
        "nms_threshold": nms,
        "containment_threshold": containment,
        "min_area_ratio": min_area_ratio,
        "max_aspect": max_aspect,
        "matching_iou_threshold": iou,
        "true_positives": tp,
        "false_positives": fp,
        "false_negatives": fn,
        "precision": round(precision, 6),
        "recall": round(recall, 6),
        "f1": round(f1, 6),
        "ap50": round(ap_values[0], 6),
        "map50_95": round(float(np.mean(ap_values)), 6),
        "count_mae": round(float(np.mean([float(row["absolute_count_error"]) for row in rows])), 6),
        "mean_inference_ms": round(mean_ms, 3),
        "mean_fps": round(1000.0 / mean_ms, 3),
        "speed_measurement": "CPU, one warm-up inference excluded",
    }


def format_console_table(
    headers: list[str],
    rows: list[list[object]],
    *,
    right_align: set[int] | None = None,
) -> str:
    """Return a dependency-free ASCII table suitable for any terminal."""
    right_align = right_align or set()
    text_rows = [[str(value) for value in row] for row in rows]
    widths = [
        max([len(headers[index]), *(len(row[index]) for row in text_rows)])
        for index in range(len(headers))
    ]
    separator = "+" + "+".join("-" * (width + 2) for width in widths) + "+"

    def render_row(values: list[str]) -> str:
        cells = []
        for index, value in enumerate(values):
            padded = value.rjust(widths[index]) if index in right_align else value.ljust(widths[index])
            cells.append(f" {padded} ")
        return "|" + "|".join(cells) + "|"

    rendered = [separator, render_row(headers), separator]
    rendered.extend(render_row(row) for row in text_rows)
    rendered.append(separator)
    return "\n".join(rendered)


def print_results_tables(
    summaries: list[dict[str, object]],
    failure_counts: Counter[str],
    failure_total: int,
    output: Path,
) -> None:
    """Print the final evaluation and failure results as compact tables."""
    metric_headers = [
        "Method", "Images", "GT", "TP", "FP", "FN", "Precision", "Recall",
        "F1", "AP50", "mAP50-95", "Count MAE", "ms/image", "FPS",
    ]
    metric_rows: list[list[object]] = []
    for summary in summaries:
        metric_rows.append([
            str(summary["method"]),
            int(summary["images"]),
            int(summary["ground_truth_people"]),
            int(summary["true_positives"]),
            int(summary["false_positives"]),
            int(summary["false_negatives"]),
            f"{float(summary['precision']):.4f}",
            f"{float(summary['recall']):.4f}",
            f"{float(summary['f1']):.4f}",
            f"{float(summary['ap50']):.4f}",
            f"{float(summary['map50_95']):.4f}",
            f"{float(summary['count_mae']):.4f}",
            f"{float(summary['mean_inference_ms']):.2f}",
            f"{float(summary['mean_fps']):.2f}",
        ])

    print("\nEvaluation summary")
    print(
        format_console_table(
            metric_headers,
            metric_rows,
            right_align=set(range(1, len(metric_headers))),
        )
    )

    failure_rows = [
        [cause, count, f"{(count / failure_total * 100.0):.1f}%"]
        for cause, count in failure_counts.most_common()
    ]
    print("\nCore-method failure causes")
    print(
        format_console_table(
            ["Cause", "Images", "Share"],
            failure_rows,
            right_align={1, 2},
        )
    )
    print(f"\nDetailed results written to: {output.resolve()}")


def write_markdown_report(
    output: Path,
    summaries: list[dict[str, object]],
    failure_counts: Counter[str],
    failure_total: int,
) -> None:
    lines = [
        "# Milestone 3 evaluation results",
        "",
        "Locked source-grouped test split; the settings were selected before this test run.",
        "",
        "| Method | Precision | Recall | F1 | AP50 | mAP50–95 | Count MAE | ms/image | FPS |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for summary in summaries:
        lines.append(
            f"| {summary['method']} | {summary['precision']:.4f} | {summary['recall']:.4f} | "
            f"{summary['f1']:.4f} | {summary['ap50']:.4f} | {summary['map50_95']:.4f} | "
            f"{summary['count_mae']:.4f} | {summary['mean_inference_ms']:.2f} | "
            f"{summary['mean_fps']:.2f} |"
        )
    lines.extend(["", "## Failure causes", ""])
    for cause, count in failure_counts.most_common():
        lines.append(f"- {cause}: {count} of {failure_total} gallery cases")
    lines.extend([
        "",
        "Blue boxes are ground truth and green boxes are predictions in `failures/`.",
        "The detector is restricted to the COCO `person` class.",
        "",
    ])
    (output / "EVALUATION_REPORT.md").write_text("\n".join(lines), encoding="utf-8")


def write_improvement_plan(output: Path, failure_counts: Counter[str]) -> None:
    changes = {
        "Lighting / low light": "Collect phone-camera night scenes; add brightness/contrast augmentation and test CLAHE as an optional preprocessing branch.",
        "Image quality / blur": "Add motion-blur augmentation and reject frames whose Laplacian score is below the quality threshold.",
        "Viewpoint and scale / small people": "Retain overlapping tiles, add a third center crop, and measure small-person recall separately.",
        "Occlusion and clutter": "Collect more crowded local scenes and evaluate a crowd-focused detector or higher-resolution input.",
        "Viewpoint / partial person at frame edge": "Train with cutout/crop augmentation and relax edge-box geometry only when temporal persistence confirms it.",
        "Look-alike background false positive": "Require pose or multi-frame persistence and add hard-negative images containing person-like objects.",
        "Missed detection / low confidence": "Tune confidence on validation only and add locally captured examples matching the deployment camera.",
    }
    lines = [
        "# Improvement plan tied to observed failures",
        "",
        "| Failure cause | Gallery count | Next change | How it will be measured |",
        "| --- | ---: | --- | --- |",
    ]
    for cause, count in failure_counts.most_common():
        lines.append(
            f"| {cause} | {count} | {changes[cause]} | Compare cause-specific false positives, "
            "false negatives, recall, and count MAE on the same locked test set. |"
        )
    lines.extend([
        "",
        "The largest category is the first priority. New parameter selection will use the validation split; "
        "the locked test split will only be rerun after the next version is fixed.",
        "",
    ])
    (output / "IMPROVEMENT_PLAN.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    args = parse_args()
    image_paths = sorted(
        path for path in args.images.iterdir() if path.suffix.lower() in {".jpg", ".jpeg", ".png"}
    )
    if args.limit:
        image_paths = image_paths[: args.limit]
    if not image_paths:
        raise ValueError(f"No evaluation images found in {args.images}")
    args.output.mkdir(parents=True, exist_ok=True)

    images: list[np.ndarray] = []
    ground_truth_by_image: list[list[tuple[int, int, int, int]]] = []
    characteristics: list[dict[str, float | bool]] = []
    for image_path in image_paths:
        image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError(f"Could not read {image_path}")
        annotation = args.annotations / f"{image_path.stem}.xml"
        if not annotation.is_file():
            raise FileNotFoundError(annotation)
        ground_truth = parse_annotation(annotation)
        images.append(image)
        ground_truth_by_image.append(ground_truth)
        characteristics.append(image_characteristics(image, ground_truth))

    summaries: list[dict[str, object]] = []
    all_rows: list[dict[str, object]] = []
    core_detections: list[list[Detection]] = []
    for mode, use_tiles in (("baseline_single_scale", False), ("core_multiscale", True)):
        pipeline = PersonPipeline(
            args.model,
            confidence=args.confidence,
            nms_threshold=args.nms,
            containment_threshold=args.containment,
            use_tiles=use_tiles,
            min_area_ratio=args.min_area_ratio,
            max_aspect=args.max_aspect,
        )
        pipeline.predict(images[0])  # warm-up is deliberately excluded from speed.
        mode_rows: list[dict[str, object]] = []
        predictions: list[tuple[int, Detection]] = []
        for index, (image_path, image, ground_truth, features) in enumerate(
            zip(image_paths, images, ground_truth_by_image, characteristics), start=0
        ):
            started = time.perf_counter()
            detections = pipeline.predict(image)
            inference_ms = (time.perf_counter() - started) * 1000.0
            tp, fp, fn = match_detections(detections, ground_truth, args.iou)
            row: dict[str, object] = {
                "method": mode,
                "image": image_path.name,
                "ground_truth": len(ground_truth),
                "predicted": len(detections),
                "true_positives": tp,
                "false_positives": fp,
                "false_negatives": fn,
                "absolute_count_error": abs(len(detections) - len(ground_truth)),
                "inference_ms": round(inference_ms, 3),
                **features,
            }
            mode_rows.append(row)
            predictions.extend((index, detection) for detection in detections)
            if use_tiles:
                core_detections.append(detections)
            print(
                f"[{mode} {index + 1:03}/{len(images):03}] {image_path.name}: "
                f"gt={len(ground_truth)} pred={len(detections)} tp={tp} fp={fp} fn={fn}"
            )
        summaries.append(
            summarize_mode(
                mode, mode_rows, predictions, ground_truth_by_image,
                args.confidence, args.nms, args.containment,
                args.min_area_ratio, args.max_aspect, args.iou,
            )
        )
        all_rows.extend(mode_rows)

    with (args.output / "per_image_results.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(all_rows[0]))
        writer.writeheader()
        writer.writerows(all_rows)
    (args.output / "summary.json").write_text(
        json.dumps({"dataset": "locked source-grouped test", "methods": summaries}, indent=2) + "\n",
        encoding="utf-8",
    )

    core_rows = [row for row in all_rows if row["method"] == "core_multiscale"]
    all_failures = sorted(
        (row for row in core_rows if int(row["false_positives"]) + int(row["false_negatives"]) > 0),
        key=lambda row: (
            int(row["false_positives"]) + int(row["false_negatives"]),
            int(row["absolute_count_error"]),
        ),
        reverse=True,
    )
    categorized_failures = [{**row, "cause": failure_cause(row), "gallery_file": ""} for row in all_failures]
    failure_counts = Counter(str(row["cause"]) for row in categorized_failures)

    # Choose a varied visual gallery instead of showing only the most severe
    # crowd scenes. Counts and the CSV still cover every failed test image.
    grouped: dict[str, list[dict[str, object]]] = {}
    for row in categorized_failures:
        grouped.setdefault(str(row["cause"]), []).append(row)
    gallery_rows: list[dict[str, object]] = []
    group_order = [cause for cause, _ in failure_counts.most_common()]
    while len(gallery_rows) < min(args.failure_gallery_size, len(categorized_failures)):
        added = False
        for cause in group_order:
            group = grouped[cause]
            group_index = sum(1 for row in gallery_rows if row["cause"] == cause)
            if group_index < len(group):
                gallery_rows.append(group[group_index])
                added = True
                if len(gallery_rows) >= args.failure_gallery_size:
                    break
        if not added:
            break

    failure_dir = args.output / "failures"
    failure_dir.mkdir(parents=True, exist_ok=True)
    index_by_name = {path.name: index for index, path in enumerate(image_paths)}
    for position, row in enumerate(gallery_rows, start=1):
        index = index_by_name[str(row["image"])]
        cause = str(row["cause"])
        file_name = f"failure_{position:02}_{Path(str(row['image'])).stem}.jpg"
        label = (
            f"GT {row['ground_truth']} Pred {row['predicted']} | "
            f"FP {row['false_positives']} FN {row['false_negatives']} | {cause}"
        )
        cv2.imwrite(
            str(failure_dir / file_name),
            render_failure(images[index], core_detections[index], ground_truth_by_image[index], label),
        )
        row["gallery_file"] = file_name
    if len(gallery_rows) < 10:
        raise RuntimeError(f"The test run produced only {len(gallery_rows)} failures; at least 10 are required")
    with (args.output / "failures.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(categorized_failures[0]))
        writer.writeheader()
        writer.writerows(categorized_failures)
    (args.output / "failure_counts.json").write_text(
        json.dumps(failure_counts, indent=2) + "\n", encoding="utf-8"
    )
    write_markdown_report(args.output, summaries, failure_counts, len(categorized_failures))
    write_improvement_plan(args.output, failure_counts)
    print_results_tables(summaries, failure_counts, len(categorized_failures), args.output)


if __name__ == "__main__":
    main()
