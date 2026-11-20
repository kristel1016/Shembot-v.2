"""Evaluate the exact MediaPipe browser detector on the locked CCTV test set."""

from __future__ import annotations

import argparse
import hashlib
import json
import statistics
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

import mediapipe as mp
import numpy as np
from mediapipe.tasks import python
from mediapipe.tasks.python import vision


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
WORKSPACE_ROOT = REPO_ROOT.parent
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


@dataclass(frozen=True)
class Detection:
    box: tuple[float, float, float, float]
    score: float


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--model",
        type=Path,
        default=REPO_ROOT
        / "lib"
        / "mediapipe"
        / "models"
        / "efficientdet_lite0.tflite",
    )
    parser.add_argument(
        "--test-dir",
        type=Path,
        default=WORKSPACE_ROOT
        / "training_data"
        / "cctv_indoor_clean_v2"
        / "test",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=REPO_ROOT / "evidence" / "browser_model_test_metrics.json",
    )
    parser.add_argument(
        "--thresholds",
        type=float,
        nargs="+",
        default=[0.18, 0.22, 0.26, 0.30, 0.38, 0.50],
        help="Confidence thresholds to compare on the locked test set.",
    )
    return parser.parse_args()


def parse_annotation(path: Path) -> list[tuple[float, float, float, float]]:
    root = ET.parse(path).getroot()
    boxes = []
    for item in root.findall("object"):
        if item.findtext("name", "").strip().lower() not in {"person", "0"}:
            continue
        box = item.find("bndbox")
        if box is None:
            continue
        x1 = float(box.findtext("xmin", "0"))
        y1 = float(box.findtext("ymin", "0"))
        x2 = float(box.findtext("xmax", "0"))
        y2 = float(box.findtext("ymax", "0"))
        if x2 > x1 and y2 > y1:
            boxes.append((x1, y1, x2 - x1, y2 - y1))
    return boxes


def box_iou(
    first: tuple[float, float, float, float],
    second: tuple[float, float, float, float],
) -> float:
    left = max(first[0], second[0])
    top = max(first[1], second[1])
    right = min(first[0] + first[2], second[0] + second[2])
    bottom = min(first[1] + first[3], second[1] + second[3])
    intersection = max(0.0, right - left) * max(0.0, bottom - top)
    union = first[2] * first[3] + second[2] * second[3] - intersection
    return intersection / union if union > 0 else 0.0


def match_detections(
    detections: list[Detection],
    ground_truth: list[tuple[float, float, float, float]],
    iou_threshold: float,
) -> tuple[int, int, int]:
    unmatched = set(range(len(ground_truth)))
    true_positives = 0
    for detection in sorted(detections, key=lambda item: item.score, reverse=True):
        candidates = [
            (box_iou(detection.box, ground_truth[index]), index)
            for index in unmatched
        ]
        best_iou, best_index = max(candidates, default=(0.0, -1))
        if best_iou >= iou_threshold:
            unmatched.remove(best_index)
            true_positives += 1
    return true_positives, len(detections) - true_positives, len(unmatched)


def average_precision(
    predictions: list[tuple[int, Detection]],
    ground_truth_by_image: list[list[tuple[float, float, float, float]]],
    iou_threshold: float,
) -> float:
    total_ground_truth = sum(len(items) for items in ground_truth_by_image)
    unmatched = [set(range(len(items))) for items in ground_truth_by_image]
    true_positive_flags = []
    false_positive_flags = []
    for image_index, detection in sorted(
        predictions, key=lambda item: item[1].score, reverse=True
    ):
        candidates = [
            (
                box_iou(
                    detection.box,
                    ground_truth_by_image[image_index][ground_truth_index],
                ),
                ground_truth_index,
            )
            for ground_truth_index in unmatched[image_index]
        ]
        best_iou, best_index = max(candidates, default=(0.0, -1))
        matched = best_iou >= iou_threshold
        true_positive_flags.append(1 if matched else 0)
        false_positive_flags.append(0 if matched else 1)
        if matched:
            unmatched[image_index].remove(best_index)
    if not total_ground_truth or not true_positive_flags:
        return 0.0
    cumulative_tp = np.cumsum(true_positive_flags)
    cumulative_fp = np.cumsum(false_positive_flags)
    recalls = cumulative_tp / total_ground_truth
    precisions = cumulative_tp / np.maximum(cumulative_tp + cumulative_fp, 1)
    return float(
        np.mean(
            [
                np.max(precisions[recalls >= level], initial=0.0)
                for level in np.linspace(0.0, 1.0, 101)
            ]
        )
    )


def main() -> None:
    args = parse_args()
    model_path = args.model.resolve()
    test_dir = args.test_dir.resolve()
    output_path = args.output.resolve()
    if not model_path.is_file():
        raise FileNotFoundError(f"Browser model not found: {model_path}")

    images = sorted(
        path for path in test_dir.iterdir() if path.suffix.lower() in IMAGE_SUFFIXES
    )
    options = vision.ObjectDetectorOptions(
        base_options=python.BaseOptions(model_asset_path=str(model_path)),
        running_mode=vision.RunningMode.IMAGE,
        max_results=50,
        score_threshold=0.001,
        category_allowlist=["person"],
    )
    ground_truth_by_image = []
    predictions = []
    detections_by_image: list[list[Detection]] = []
    inference_times = []

    with vision.ObjectDetector.create_from_options(options) as detector:
        for image_index, image_path in enumerate(images):
            annotation_path = image_path.with_suffix(".xml")
            if not annotation_path.is_file():
                raise FileNotFoundError(f"Missing annotation: {annotation_path}")
            ground_truth = parse_annotation(annotation_path)
            ground_truth_by_image.append(ground_truth)
            image = mp.Image.create_from_file(str(image_path))
            started_at = time.perf_counter()
            result = detector.detect(image)
            inference_times.append((time.perf_counter() - started_at) * 1000)
            detections = []
            for item in result.detections:
                category = item.categories[0]
                if category.category_name != "person":
                    continue
                box = item.bounding_box
                detections.append(
                    Detection(
                        (
                            float(box.origin_x),
                            float(box.origin_y),
                            float(box.width),
                            float(box.height),
                        ),
                        float(category.score),
                    )
                )
            predictions.extend((image_index, item) for item in detections)
            detections_by_image.append(detections)

    threshold_results = []
    for threshold in sorted(set(args.thresholds)):
        threshold_tp = threshold_fp = threshold_fn = 0
        count_errors = []
        for detections, ground_truth in zip(
            detections_by_image, ground_truth_by_image
        ):
            selected = [item for item in detections if item.score >= threshold]
            tp, fp, fn = match_detections(selected, ground_truth, 0.50)
            threshold_tp += tp
            threshold_fp += fp
            threshold_fn += fn
            count_errors.append(abs(len(selected) - len(ground_truth)))
        precision = threshold_tp / max(1, threshold_tp + threshold_fp)
        recall = threshold_tp / max(1, threshold_tp + threshold_fn)
        f1 = 2 * precision * recall / max(1e-12, precision + recall)
        threshold_results.append(
            {
                "confidence_threshold": threshold,
                "true_positives": threshold_tp,
                "false_positives": threshold_fp,
                "false_negatives": threshold_fn,
                "precision": precision,
                "recall": recall,
                "f1": f1,
                "count_mae": statistics.fmean(count_errors),
            }
        )
    ap_values = [
        average_precision(predictions, ground_truth_by_image, threshold)
        for threshold in np.arange(0.50, 0.96, 0.05)
    ]
    mean_ms = statistics.fmean(inference_times)
    result = {
        "model": str(model_path),
        "model_sha256": hashlib.sha256(model_path.read_bytes()).hexdigest(),
        "dataset": str(test_dir),
        "split": "locked test",
        "images": len(images),
        "ground_truth_people": sum(len(items) for items in ground_truth_by_image),
        "matching_iou_threshold": 0.50,
        "threshold_results": threshold_results,
        "best_f1_threshold": max(
            threshold_results, key=lambda item: (item["f1"], item["precision"])
        )["confidence_threshold"],
        "ap50": ap_values[0],
        "map50_95": statistics.fmean(ap_values),
        "mean_inference_ms": mean_ms,
        "mean_fps": 1000 / mean_ms,
        "scope": "detector only; browser pose and temporal filtering excluded",
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
