"""Run the integrated SHEMBOT pipeline on images, a video, or a webcam."""

from __future__ import annotations

import argparse
import csv
import sys
import time
from pathlib import Path

import cv2


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from pipeline import PersonPipeline, TemporalCountSmoother, render  # noqa: E402


IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
VIDEO_SUFFIXES = {".mp4", ".mov", ".avi", ".mkv", ".webm"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--input", type=Path, help="Image, image folder, or video")
    source.add_argument("--webcam", type=int, help="Webcam index, for example 0")
    parser.add_argument("--output", type=Path, default=ROOT / "outputs" / "run")
    parser.add_argument(
        "--model", type=Path,
        default=ROOT / "evaluation" / "models" / "object_detection_yolox_2022nov_int8.onnx",
    )
    parser.add_argument("--mode", choices=("core", "baseline"), default="core")
    parser.add_argument("--confidence", type=float, default=0.20)
    parser.add_argument("--nms", type=float, default=0.45)
    parser.add_argument("--frame-stride", type=int, default=2)
    parser.add_argument("--display", action="store_true", help="Show video/webcam window")
    args = parser.parse_args()
    if not 0.0 <= args.confidence <= 1.0:
        parser.error("--confidence must be between 0 and 1")
    if not 0.0 <= args.nms <= 1.0:
        parser.error("--nms must be between 0 and 1")
    if args.frame_stride < 1:
        parser.error("--frame-stride must be at least 1")
    return args


def build_pipeline(args: argparse.Namespace) -> PersonPipeline:
    return PersonPipeline(
        args.model,
        confidence=args.confidence,
        nms_threshold=args.nms,
        use_tiles=args.mode == "core",
    )


def process_image(path: Path, output: Path, pipeline: PersonPipeline) -> dict[str, object]:
    image = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"Could not read image: {path}")
    started = time.perf_counter()
    detections = pipeline.predict(image)
    elapsed_ms = (time.perf_counter() - started) * 1000.0
    destination = output if output.suffix.lower() in IMAGE_SUFFIXES else output / path.name
    destination.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(destination), render(image, detections, fps=1000.0 / elapsed_ms))
    return {
        "input": path.name,
        "output": str(destination),
        "people": len(detections),
        "inference_ms": round(elapsed_ms, 3),
        "fps": round(1000.0 / elapsed_ms, 3),
    }


def process_image_directory(path: Path, output: Path, pipeline: PersonPipeline) -> None:
    images = sorted(item for item in path.iterdir() if item.suffix.lower() in IMAGE_SUFFIXES)
    if not images:
        raise ValueError(f"No supported images found in {path}")
    output.mkdir(parents=True, exist_ok=True)
    rows = [process_image(image, output, pipeline) for image in images]
    with (output / "predictions.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    print(f"Processed {len(rows)} images; outputs written to {output}")


def process_video(
    source: str | int,
    output: Path,
    pipeline: PersonPipeline,
    frame_stride: int,
    display: bool,
) -> None:
    capture = cv2.VideoCapture(source)
    if not capture.isOpened():
        raise RuntimeError(f"Could not open video source: {source}")
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    source_fps = capture.get(cv2.CAP_PROP_FPS) or 20.0
    output_path = output if output.suffix.lower() in VIDEO_SUFFIXES else output / "annotated.mp4"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    writer = cv2.VideoWriter(
        str(output_path), cv2.VideoWriter_fourcc(*"mp4v"), source_fps, (width, height)
    )
    smoother = TemporalCountSmoother(window=5, persistence=3)
    frame_index = 0
    latest_detections = []
    latest_fps = 0.0
    rows: list[dict[str, object]] = []
    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            if frame_index % frame_stride == 0:
                started = time.perf_counter()
                latest_detections = pipeline.predict(frame)
                elapsed = time.perf_counter() - started
                latest_fps = 1.0 / elapsed if elapsed else 0.0
            confirmed = smoother.update(len(latest_detections))
            annotated = render(frame, latest_detections, count=confirmed, fps=latest_fps)
            writer.write(annotated)
            rows.append(
                {
                    "frame": frame_index,
                    "raw_count": len(latest_detections),
                    "confirmed_count": confirmed,
                    "processed": frame_index % frame_stride == 0,
                }
            )
            if display:
                cv2.imshow("SHEMBOT - press q to stop", annotated)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break
            frame_index += 1
    finally:
        capture.release()
        writer.release()
        cv2.destroyAllWindows()
    with output_path.with_suffix(".csv").open("w", newline="", encoding="utf-8") as handle:
        writer_csv = csv.DictWriter(handle, fieldnames=list(rows[0]) if rows else ["frame"])
        writer_csv.writeheader()
        writer_csv.writerows(rows)
    print(f"Processed {frame_index} frames; output written to {output_path}")


def main() -> None:
    args = parse_args()
    pipeline = build_pipeline(args)
    if args.webcam is not None:
        process_video(args.webcam, args.output, pipeline, args.frame_stride, True)
        return
    input_path = args.input
    if input_path is None or not input_path.exists():
        raise FileNotFoundError(input_path)
    if input_path.is_dir():
        process_image_directory(input_path, args.output, pipeline)
    elif input_path.suffix.lower() in IMAGE_SUFFIXES:
        row = process_image(input_path, args.output, pipeline)
        print(row)
    elif input_path.suffix.lower() in VIDEO_SUFFIXES:
        process_video(str(input_path), args.output, pipeline, args.frame_stride, args.display)
    else:
        raise ValueError(f"Unsupported input: {input_path}")


if __name__ == "__main__":
    main()
