"""Shared SHEMBOT person-detection pipeline used by running and evaluation."""

from __future__ import annotations

from collections import Counter, deque
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np


@dataclass(frozen=True)
class LetterboxInfo:
    scale: float
    pad_x: int
    pad_y: int
    original_width: int
    original_height: int


@dataclass(frozen=True)
class Detection:
    box: tuple[int, int, int, int]
    score: float
    source: str = "full"


def preprocess(
    image: np.ndarray,
    size: tuple[int, int] = (640, 640),
    fill: int = 114,
) -> tuple[np.ndarray, LetterboxInfo]:
    """Letterbox BGR input, convert to RGB NCHW float32, and preserve geometry."""
    if image is None or image.ndim != 3 or image.shape[2] != 3:
        raise ValueError("Expected a non-empty BGR image with three channels")
    target_width, target_height = size
    if target_width <= 0 or target_height <= 0:
        raise ValueError("Input dimensions must be positive")

    original_height, original_width = image.shape[:2]
    scale = min(target_width / original_width, target_height / original_height)
    resized_width = max(1, int(round(original_width * scale)))
    resized_height = max(1, int(round(original_height * scale)))
    interpolation = cv2.INTER_AREA if scale < 1.0 else cv2.INTER_LINEAR
    resized = cv2.resize(image, (resized_width, resized_height), interpolation=interpolation)
    pad_x = (target_width - resized_width) // 2
    pad_y = (target_height - resized_height) // 2
    canvas = np.full((target_height, target_width, 3), fill, dtype=np.uint8)
    canvas[pad_y : pad_y + resized_height, pad_x : pad_x + resized_width] = resized
    rgb = cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB)
    blob = np.transpose(rgb.astype(np.float32), (2, 0, 1))[np.newaxis]
    return blob, LetterboxInfo(scale, pad_x, pad_y, original_width, original_height)


def restore_box(
    box_xywh: tuple[float, float, float, float],
    info: LetterboxInfo,
) -> tuple[int, int, int, int]:
    x, y, width, height = box_xywh
    x1 = int(round((x - info.pad_x) / info.scale))
    y1 = int(round((y - info.pad_y) / info.scale))
    x2 = int(round((x + width - info.pad_x) / info.scale))
    y2 = int(round((y + height - info.pad_y) / info.scale))
    x1 = min(max(x1, 0), info.original_width - 1)
    y1 = min(max(y1, 0), info.original_height - 1)
    x2 = min(max(x2, x1 + 1), info.original_width)
    y2 = min(max(y2, y1 + 1), info.original_height)
    return x1, y1, x2 - x1, y2 - y1


def box_iou(first: tuple[int, int, int, int], second: tuple[int, int, int, int]) -> float:
    ax, ay, aw, ah = first
    bx, by, bw, bh = second
    left, top = max(ax, bx), max(ay, by)
    right, bottom = min(ax + aw, bx + bw), min(ay + ah, by + bh)
    intersection = max(0, right - left) * max(0, bottom - top)
    union = aw * ah + bw * bh - intersection
    return intersection / union if union > 0 else 0.0


def containment(first: tuple[int, int, int, int], second: tuple[int, int, int, int]) -> float:
    ax, ay, aw, ah = first
    bx, by, bw, bh = second
    left, top = max(ax, bx), max(ay, by)
    right, bottom = min(ax + aw, bx + bw), min(ay + ah, by + bh)
    intersection = max(0, right - left) * max(0, bottom - top)
    smaller = min(aw * ah, bw * bh)
    return intersection / smaller if smaller > 0 else 0.0


def fuse_detections(
    detections: list[Detection],
    iou_threshold: float = 0.45,
    containment_threshold: float = 0.82,
) -> list[Detection]:
    """Suppress duplicates produced by full-frame and overlapping tile scans."""
    kept: list[Detection] = []
    for candidate in sorted(detections, key=lambda item: item.score, reverse=True):
        duplicate = any(
            box_iou(candidate.box, accepted.box) >= iou_threshold
            or containment(candidate.box, accepted.box) >= containment_threshold
            for accepted in kept
        )
        if not duplicate:
            kept.append(candidate)
    return kept


class YoloXPersonBackend:
    """OpenCV-DNN YOLOX-S backend restricted to COCO class 0 (person)."""

    def __init__(
        self,
        model_path: Path,
        confidence_floor: float = 0.10,
        nms_threshold: float = 0.50,
    ) -> None:
        if not model_path.is_file():
            raise FileNotFoundError(f"Model not found: {model_path}")
        self.input_size = (640, 640)
        self.confidence_floor = confidence_floor
        self.nms_threshold = nms_threshold
        self.net = cv2.dnn.readNet(str(model_path))
        self.net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
        self.net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
        self.grids, self.expanded_strides = self._anchors()

    def _anchors(self) -> tuple[np.ndarray, np.ndarray]:
        grids: list[np.ndarray] = []
        strides: list[np.ndarray] = []
        for stride in (8, 16, 32):
            height = self.input_size[1] // stride
            width = self.input_size[0] // stride
            x_values, y_values = np.meshgrid(np.arange(width), np.arange(height))
            grid = np.stack((x_values, y_values), axis=2).reshape(1, -1, 2)
            grids.append(grid)
            strides.append(np.full((*grid.shape[:2], 1), stride))
        return np.concatenate(grids, axis=1), np.concatenate(strides, axis=1)

    def infer(self, image: np.ndarray, source: str = "full") -> list[Detection]:
        blob, info = preprocess(image, self.input_size)
        self.net.setInput(blob)
        raw = self.net.forward(self.net.getUnconnectedOutLayersNames())[0][0].copy()
        raw[:, :2] = (raw[:, :2] + self.grids[0]) * self.expanded_strides[0]
        raw[:, 2:4] = np.exp(raw[:, 2:4]) * self.expanded_strides[0]
        scores = raw[:, 4] * raw[:, 5]
        mask = scores >= self.confidence_floor
        if not np.any(mask):
            return []

        candidates = raw[mask, :4]
        scores = scores[mask]
        boxes = np.empty_like(candidates)
        boxes[:, 0] = candidates[:, 0] - candidates[:, 2] / 2.0
        boxes[:, 1] = candidates[:, 1] - candidates[:, 3] / 2.0
        boxes[:, 2:] = candidates[:, 2:]
        keep = cv2.dnn.NMSBoxes(
            boxes.tolist(), scores.tolist(), self.confidence_floor, self.nms_threshold
        )
        return [
            Detection(restore_box(tuple(boxes[index]), info), float(scores[index]), source)
            for index in np.asarray(keep).reshape(-1)
        ] if len(keep) else []


class PersonPipeline:
    """Integrated full-frame/tiled detector with filtering and duplicate fusion."""

    def __init__(
        self,
        model_path: Path,
        confidence: float = 0.25,
        nms_threshold: float = 0.45,
        use_tiles: bool = True,
        tile_fraction: float = 0.64,
        min_area_ratio: float = 0.0005,
        max_area_ratio: float = 0.92,
        min_aspect: float = 0.12,
        max_aspect: float = 1.65,
    ) -> None:
        self.confidence = confidence
        self.nms_threshold = nms_threshold
        self.use_tiles = use_tiles
        self.tile_fraction = tile_fraction
        self.min_area_ratio = min_area_ratio
        self.max_area_ratio = max_area_ratio
        self.min_aspect = min_aspect
        self.max_aspect = max_aspect
        self.backend = YoloXPersonBackend(model_path, min(0.10, confidence), 0.50)

    @property
    def method_name(self) -> str:
        return "core_multiscale" if self.use_tiles else "baseline_single_scale"

    def _tile_windows(self, width: int, height: int) -> list[tuple[int, int, int, int]]:
        tile_width = min(width, max(64, int(round(width * self.tile_fraction))))
        tile_height = min(height, max(64, int(round(height * self.tile_fraction))))
        x_positions = sorted({0, max(0, width - tile_width)})
        y_positions = sorted({0, max(0, height - tile_height)})
        return [(x, y, tile_width, tile_height) for y in y_positions for x in x_positions]

    def infer(self, image: np.ndarray) -> list[Detection]:
        candidates = self.backend.infer(image, "full")
        if self.use_tiles:
            height, width = image.shape[:2]
            for tile_index, (x, y, tile_width, tile_height) in enumerate(
                self._tile_windows(width, height), start=1
            ):
                crop = image[y : y + tile_height, x : x + tile_width]
                for detection in self.backend.infer(crop, f"tile_{tile_index}"):
                    bx, by, bw, bh = detection.box
                    candidates.append(
                        Detection((bx + x, by + y, bw, bh), detection.score, detection.source)
                    )
        return candidates

    def postprocess(self, image: np.ndarray, raw: list[Detection]) -> list[Detection]:
        height, width = image.shape[:2]
        frame_area = float(width * height)
        filtered: list[Detection] = []
        for detection in raw:
            x, y, box_width, box_height = detection.box
            area_ratio = (box_width * box_height) / frame_area
            aspect = box_width / box_height if box_height else 999.0
            if detection.score < self.confidence:
                continue
            if not self.min_area_ratio <= area_ratio <= self.max_area_ratio:
                continue
            if not self.min_aspect <= aspect <= self.max_aspect:
                continue
            clipped_x = min(max(x, 0), width - 1)
            clipped_y = min(max(y, 0), height - 1)
            clipped_w = min(box_width, width - clipped_x)
            clipped_h = min(box_height, height - clipped_y)
            if clipped_w > 0 and clipped_h > 0:
                filtered.append(
                    Detection(
                        (clipped_x, clipped_y, clipped_w, clipped_h),
                        detection.score,
                        detection.source,
                    )
                )
        return fuse_detections(filtered, self.nms_threshold)

    def predict(self, image: np.ndarray) -> list[Detection]:
        return self.postprocess(image, self.infer(image))


class TemporalCountSmoother:
    """Require a modal count to persist before changing the confirmed count."""

    def __init__(self, window: int = 5, persistence: int = 3) -> None:
        if window < 1 or persistence < 1:
            raise ValueError("window and persistence must be positive")
        self.history: deque[int] = deque(maxlen=window)
        self.persistence = persistence
        self.confirmed = 0
        self.pending: int | None = None
        self.pending_frames = 0

    def update(self, value: int) -> int:
        self.history.append(value)
        modal = Counter(self.history).most_common(1)[0][0]
        if modal == self.confirmed:
            self.pending = None
            self.pending_frames = 0
        elif modal == self.pending:
            self.pending_frames += 1
        else:
            self.pending = modal
            self.pending_frames = 1
        if self.pending_frames >= self.persistence:
            self.confirmed = modal
            self.pending = None
            self.pending_frames = 0
        return self.confirmed


def render(
    image: np.ndarray,
    detections: list[Detection],
    count: int | None = None,
    fps: float | None = None,
) -> np.ndarray:
    output = image.copy()
    for index, detection in enumerate(detections, start=1):
        x, y, width, height = detection.box
        cv2.rectangle(output, (x, y), (x + width, y + height), (59, 211, 143), 2)
        label = f"P{index} {detection.score:.0%}"
        cv2.putText(
            output, label, (x, max(18, y - 6)), cv2.FONT_HERSHEY_SIMPLEX,
            0.55, (59, 211, 143), 2, cv2.LINE_AA,
        )
    shown_count = len(detections) if count is None else count
    banner = f"People: {shown_count}"
    if fps is not None:
        banner += f"  FPS: {fps:.1f}"
    cv2.rectangle(output, (0, 0), (min(output.shape[1], 360), 44), (20, 24, 22), -1)
    cv2.putText(
        output, banner, (12, 30), cv2.FONT_HERSHEY_SIMPLEX,
        0.72, (255, 255, 255), 2, cv2.LINE_AA,
    )
    return output
