"""Milestone 4 browser interface for the evaluated Python pipeline.

Run with:
    python src/gradio_app.py
"""

from __future__ import annotations

import argparse
import sys
import time
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from pipeline import PersonPipeline, render  # noqa: E402


MODEL = ROOT / "evaluation" / "models" / "object_detection_yolox_2022nov_int8.onnx"


@lru_cache(maxsize=1)
def get_pipeline() -> PersonPipeline:
    """Load the exact evaluated model once for the lifetime of the app."""
    return PersonPipeline(MODEL)


def analyze_image(rgb_image: np.ndarray | None) -> tuple[np.ndarray | None, dict[str, object]]:
    if rgb_image is None:
        return None, {"error": "Upload an image or capture one with the webcam."}
    if rgb_image.ndim != 3 or rgb_image.shape[2] not in (3, 4):
        return None, {"error": "Expected an RGB image."}

    rgb = rgb_image[:, :, :3].astype(np.uint8, copy=False)
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    started = time.perf_counter()
    detections = get_pipeline().predict(bgr)
    elapsed_ms = (time.perf_counter() - started) * 1000.0
    annotated = render(bgr, detections, count=len(detections), fps=1000.0 / elapsed_ms)
    details: dict[str, object] = {
        "people": len(detections),
        "processing_ms": round(elapsed_ms, 2),
        "fps": round(1000.0 / elapsed_ms, 2),
        "model": MODEL.name,
        "detections": [
            {
                "label": "person",
                "confidence": round(item.score, 4),
                "box_xywh": list(item.box),
                "source": item.source,
            }
            for item in detections
        ],
    }
    return cv2.cvtColor(annotated, cv2.COLOR_BGR2RGB), details


def create_demo():
    try:
        import gradio as gr
    except ImportError as error:
        raise RuntimeError(
            "Gradio is required. Run: python -m pip install -r requirements-app.txt"
        ) from error

    get_pipeline()  # Warm and retain the model before the first user request.
    return gr.Interface(
        fn=analyze_image,
        inputs=gr.Image(
            type="numpy",
            sources=["upload", "webcam", "clipboard"],
            label="Camera or test image",
        ),
        outputs=[
            gr.Image(type="numpy", label="Person detections"),
            gr.JSON(label="Count, confidence, boxes, and processing time"),
        ],
        title="SHEMBOT — Reproducible Person Detection",
        description=(
            "Uses the same PersonPipeline, weights, preprocessing, thresholds, and "
            "postprocessing as src/evaluate.py. Processing remains on this computer."
        ),
        flagging_mode="never",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=7860)
    parser.add_argument("--share", action="store_true")
    args = parser.parse_args()
    create_demo().launch(
        server_name=args.host,
        server_port=args.port,
        share=args.share,
        inbrowser=True,
    )


if __name__ == "__main__":
    main()
