"""Tune post-processing on validation data without touching the locked test split.

Raw YOLOX detections are cached so the parameter search is repeatable and does
not rerun the neural network for every candidate configuration.
"""

from __future__ import annotations

import argparse
import itertools
import json
import sys
from pathlib import Path

import cv2
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from evaluate import average_precision, match_detections, parse_annotation  # noqa: E402
from pipeline import Detection, PersonPipeline  # noqa: E402


IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--validation", type=Path, required=True)
    parser.add_argument(
        "--model",
        type=Path,
        default=ROOT / "evaluation" / "models" / "object_detection_yolox_2022nov_int8.onnx",
    )
    parser.add_argument(
        "--cache",
        type=Path,
        default=ROOT / "outputs" / "tuning" / "validation_raw.json",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "outputs" / "tuning" / "parameter_search.json",
    )
    return parser.parse_args()


def image_paths(folder: Path) -> list[Path]:
    return sorted(path for path in folder.iterdir() if path.suffix.lower() in IMAGE_SUFFIXES)


def cache_raw_detections(args: argparse.Namespace, images: list[Path]) -> list[dict[str, object]]:
    if args.cache.is_file():
        cached = json.loads(args.cache.read_text(encoding="utf-8"))
        cached_names = [str(item["image"]) for item in cached]
        if cached_names == [path.name for path in images]:
            print(f"Using cached raw detections: {args.cache}")
            return cached

    # Keep all detections down to the backend floor; confidence is selected later.
    pipeline = PersonPipeline(args.model, confidence=0.05, use_tiles=True)
    cached: list[dict[str, object]] = []
    for index, path in enumerate(images, start=1):
        image = cv2.imread(str(path), cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError(f"Could not read {path}")
        raw = pipeline.infer(image)
        annotation = path.with_suffix(".xml")
        if not annotation.is_file():
            raise FileNotFoundError(annotation)
        cached.append(
            {
                "image": path.name,
                "width": int(image.shape[1]),
                "height": int(image.shape[0]),
                "ground_truth": [list(box) for box in parse_annotation(annotation)],
                "raw": [
                    {"box": list(item.box), "score": item.score, "source": item.source}
                    for item in raw
                ],
            }
        )
        print(f"Cached {index}/{len(images)}: {path.name}", flush=True)

    args.cache.parent.mkdir(parents=True, exist_ok=True)
    args.cache.write_text(json.dumps(cached), encoding="utf-8")
    return cached


def score_configuration(
    cached: list[dict[str, object]],
    pipeline: PersonPipeline,
) -> dict[str, float | int]:
    predictions: list[tuple[int, Detection]] = []
    ground_truth_by_image: list[list[tuple[int, int, int, int]]] = []
    tp = fp = fn = 0
    absolute_errors: list[int] = []

    for image_index, item in enumerate(cached):
        width, height = int(item["width"]), int(item["height"])
        # postprocess only needs the frame dimensions.
        blank = np.zeros((height, width, 3), dtype=np.uint8)
        raw = [
            Detection(tuple(value["box"]), float(value["score"]), str(value["source"]))
            for value in item["raw"]
        ]
        detections = pipeline.postprocess(blank, raw)
        ground_truth = [tuple(box) for box in item["ground_truth"]]
        ground_truth_by_image.append(ground_truth)
        image_tp, image_fp, image_fn = match_detections(detections, ground_truth, 0.50)
        tp += image_tp
        fp += image_fp
        fn += image_fn
        absolute_errors.append(abs(len(detections) - len(ground_truth)))
        predictions.extend((image_index, detection) for detection in detections)

    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    ap50 = average_precision(predictions, ground_truth_by_image, 0.50)
    return {
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "ap50": ap50,
        "count_mae": sum(absolute_errors) / len(absolute_errors),
    }


def main() -> None:
    args = parse_args()
    images = image_paths(args.validation)
    if not images:
        raise ValueError(f"No validation images found in {args.validation}")
    cached = cache_raw_detections(args, images)

    # These ranges change only post-processing; raw inference stays identical.
    values = itertools.product(
        (0.10, 0.12, 0.15, 0.18, 0.20, 0.23, 0.25, 0.30),
        (0.30, 0.40, 0.50, 0.60),
        (0.55, 0.65, 0.75, 0.85, 0.95),
        (0.0002, 0.0005, 0.0010),
        (1.0, 1.3, 1.65),
    )
    results: list[dict[str, object]] = []
    pipeline = PersonPipeline(args.model, use_tiles=True)
    for confidence, nms, containment, min_area, max_aspect in values:
        pipeline.confidence = confidence
        pipeline.nms_threshold = nms
        pipeline.containment_threshold = containment
        pipeline.min_area_ratio = min_area
        pipeline.max_aspect = max_aspect
        metrics = score_configuration(cached, pipeline)
        results.append(
            {
                "confidence": confidence,
                "nms": nms,
                "containment": containment,
                "min_area_ratio": min_area,
                "max_aspect": max_aspect,
                **metrics,
            }
        )

    # Select for detection quality, then use precision and counting error as tie-breakers.
    results.sort(
        key=lambda row: (
            float(row["f1"]),
            float(row["ap50"]),
            float(row["precision"]),
            -float(row["count_mae"]),
        ),
        reverse=True,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps({"selection_split": "validation", "images": len(images), "results": results}, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(results[:10], indent=2))
    print(f"Saved complete search to {args.output}")


if __name__ == "__main__":
    main()
