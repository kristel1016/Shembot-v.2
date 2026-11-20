"""Tests for the terminal evaluation table."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from evaluate import format_console_table  # noqa: E402


class EvaluationTableTests(unittest.TestCase):
    def test_table_contains_headers_values_and_numeric_alignment(self) -> None:
        table = format_console_table(
            ["Method", "F1", "FPS"],
            [["baseline", "0.0687", "7.08"], ["core", "0.1733", "1.35"]],
            right_align={1, 2},
        )

        self.assertIn("| Method", table)
        self.assertIn("baseline", table)
        self.assertIn("0.1733", table)
        self.assertEqual(table.count("+"), 12)


if __name__ == "__main__":
    unittest.main()
