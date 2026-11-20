from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from pipeline import Detection, TemporalCountSmoother, fuse_detections, preprocess  # noqa: E402


class PipelineTests(unittest.TestCase):
    def test_preprocess_shape_color_and_dtype(self) -> None:
        image = np.zeros((100, 200, 3), dtype=np.uint8)
        image[:, :, 0] = 255  # BGR blue becomes RGB channel 2.
        blob, info = preprocess(image)
        self.assertEqual(blob.shape, (1, 3, 640, 640))
        self.assertEqual(blob.dtype, np.float32)
        self.assertEqual(info.original_width, 200)
        self.assertEqual(float(blob[0, 2, 320, 320]), 255.0)

    def test_fusion_removes_nested_duplicate(self) -> None:
        detections = [
            Detection((10, 10, 100, 200), 0.9),
            Detection((20, 20, 80, 170), 0.8, "tile_1"),
            Detection((250, 20, 80, 170), 0.7),
        ]
        kept = fuse_detections(detections)
        self.assertEqual(len(kept), 2)
        self.assertEqual(kept[0].score, 0.9)

    def test_temporal_count_requires_persistence(self) -> None:
        smoother = TemporalCountSmoother(window=3, persistence=2)
        self.assertEqual(smoother.update(2), 0)
        self.assertEqual(smoother.update(2), 2)
        self.assertEqual(smoother.update(3), 2)


if __name__ == "__main__":
    unittest.main()
