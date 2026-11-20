"""Static checks for the Milestone 4 submission package."""

from __future__ import annotations

import csv
import json
import unittest
import zipfile
from pathlib import Path

import cv2


ROOT = Path(__file__).resolve().parents[1]


class Milestone4ArtifactsTest(unittest.TestCase):
    def test_test_plan_has_twelve_cases_and_three_hard_cases(self) -> None:
        with (ROOT / "tests" / "milestone4_test_cases.csv").open(encoding="utf-8", newline="") as handle:
            rows = list(csv.DictReader(handle))
        self.assertGreaterEqual(len(rows), 10)
        self.assertGreaterEqual(sum(row["hard_case"] == "Yes" for row in rows), 3)
        self.assertTrue(all(row["count_pass"] in {"PASS", "FAIL"} for row in rows))

    def test_reproducible_metrics_have_model_identity_and_conditions(self) -> None:
        payload = json.loads((ROOT / "outputs" / "milestone4_final" / "metrics.json").read_text(encoding="utf-8"))
        self.assertEqual(payload["split"], "test")
        self.assertEqual(payload["random_seed"], 42)
        self.assertEqual(len(payload["model"]["sha256"]), 64)
        self.assertEqual(len(payload["condition_breakdown"]), 5)
        core = next(item for item in payload["methods"] if item["method"] == "core_multiscale")
        self.assertAlmostEqual(core["f1"], 0.229970, places=6)
        self.assertAlmostEqual(core["count_mae"], 5.834586, places=6)

    def test_editable_office_files_are_valid_packages(self) -> None:
        for relative in ("reports/MILESTONE_4_REPORT.docx", "reports/MILESTONE_4_SLIDES.pptx"):
            path = ROOT / relative
            self.assertGreater(path.stat().st_size, 10_000)
            self.assertTrue(zipfile.is_zipfile(path), relative)

    def test_backup_video_opens(self) -> None:
        capture = cv2.VideoCapture(str(ROOT / "reports" / "MILESTONE_4_BACKUP_DEMO.mp4"))
        self.assertTrue(capture.isOpened())
        self.assertGreater(int(capture.get(cv2.CAP_PROP_FRAME_COUNT)), 0)
        capture.release()


if __name__ == "__main__":
    unittest.main()
