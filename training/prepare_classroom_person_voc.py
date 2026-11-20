"""Build a leakage-safe CCTV + classroom person-detection candidate.

The Roboflow classroom export labels student behaviours rather than a single
person class and contains exact cross-split duplicates. This script merges all
student behaviour labels into ``person``, repairs boxes, removes duplicate
images, re-splits classroom sequences at source-group level, and preserves the
existing CCTV test split byte-for-byte.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path

from PIL import Image

from prepare_extended_person_voc import (
    IMAGE_SUFFIXES,
    add_external_image,
    clamp_box,
    copy_base,
)


CLASSROOM_CLASSES = {
    "reading",
    "bend",
    "bow_head",
    "hand-raising",
    "sleep",
    "turn_head",
    "upright",
    "Using_phone",
    "writing",
}


def parse_args() -> argparse.Namespace:
    workspace = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--base",
        type=Path,
        default=workspace / "training_data" / "cctv_indoor_clean_v2",
        help="CCTV dataset whose test split remains locked.",
    )
    parser.add_argument(
        "--classroom",
        type=Path,
        default=(
            workspace
            / "training_data/source/classroom/class-monitoring-v4-voc"
        ),
        help="Extracted Roboflow Pascal VOC dataset.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=workspace / "training_data" / "classroom_person_v1",
    )
    parser.add_argument("--validation-fraction", type=float, default=0.15)
    return parser.parse_args()


def image_for_annotation(annotation: Path) -> Path:
    for suffix in IMAGE_SUFFIXES:
        candidate = annotation.with_suffix(suffix)
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(f"No image paired with {annotation}")


def original_id(image: Path) -> str:
    stem = image.stem.split(".rf.", maxsplit=1)[0]
    return re.sub(r"_(?:jpg|jpeg|png)$", "", stem, flags=re.IGNORECASE)


def sequence_group(image: Path) -> str:
    """Keep neighbouring video frames in the same output split."""
    identifier = original_id(image)
    digits = "".join(character for character in identifier if character.isdigit())
    return digits[:4] if len(digits) >= 4 else identifier[:4]


def grouped_split(group: str, validation_fraction: float) -> str:
    value = int(hashlib.sha256(group.encode("utf-8")).hexdigest()[:8], 16)
    return "valid" if value / 0xFFFFFFFF < validation_fraction else "train"


def split_digest(directory: Path) -> str:
    digest = hashlib.sha256()
    for path in sorted(item for item in directory.iterdir() if item.is_file()):
        digest.update(path.name.encode("utf-8"))
        digest.update(hashlib.sha256(path.read_bytes()).digest())
    return digest.hexdigest()


def parse_boxes(
    annotation: Path,
    image: Path,
    counts: Counter[str],
) -> tuple[int, int, list[tuple[int, int, int, int]]]:
    root = ET.parse(annotation).getroot()
    with Image.open(image) as decoded:
        width, height = decoded.size
    boxes: list[tuple[int, int, int, int]] = []
    for obj in root.findall("object"):
        class_name = obj.findtext("name", "").strip()
        counts[f"class_{class_name}"] += 1
        if class_name not in CLASSROOM_CLASSES:
            counts["rejected_unknown_class_boxes"] += 1
            continue
        node = obj.find("bndbox")
        if node is None:
            counts["rejected_missing_box"] += 1
            continue
        raw_box = tuple(
            float(node.findtext(key, "0"))
            for key in ("xmin", "ymin", "xmax", "ymax")
        )
        repaired = clamp_box(raw_box, width, height)
        if repaired is None:
            counts["rejected_invalid_boxes"] += 1
            continue
        rounded_raw = tuple(int(round(value)) for value in raw_box)
        if repaired != rounded_raw:
            counts["repaired_boxes"] += 1
        if repaired in boxes:
            counts["rejected_duplicate_boxes"] += 1
            continue
        boxes.append(repaired)
    return width, height, boxes


def main() -> None:
    args = parse_args()
    if not 0 < args.validation_fraction < 0.5:
        raise SystemExit("--validation-fraction must be between 0 and 0.5")
    base = args.base.resolve()
    classroom = args.classroom.resolve()
    output = args.output.resolve()
    for required in (base / "train", base / "valid", base / "test", classroom):
        if not required.exists():
            raise FileNotFoundError(required)
    if output.exists() and any(output.iterdir()):
        raise SystemExit(f"Output must be empty or absent: {output}")
    for split in ("train", "valid", "test"):
        (output / split).mkdir(parents=True, exist_ok=True)

    manifest: list[dict[str, object]] = []
    counts: Counter[str] = Counter()
    copy_base(base, output, manifest, counts)

    records_by_hash: dict[str, list[tuple[Path, Path, str]]] = defaultdict(list)
    for source_split in ("train", "valid", "test"):
        source_dir = classroom / source_split
        for annotation in sorted(source_dir.glob("*.xml")):
            image = image_for_annotation(annotation)
            image_hash = hashlib.sha256(image.read_bytes()).hexdigest()
            records_by_hash[image_hash].append((image, annotation, source_split))

    groups: Counter[str] = Counter()
    for image_hash, duplicate_records in sorted(records_by_hash.items()):
        records = sorted(duplicate_records, key=lambda item: str(item[0]))
        image, annotation, _ = records[0]
        if len(records) > 1:
            counts["removed_duplicate_images"] += len(records) - 1
            source_splits = {record[2] for record in records}
            if len(source_splits) > 1:
                counts["removed_cross_split_duplicate_groups"] += 1
        group = sequence_group(image)
        groups[group] += 1
        split = grouped_split(group, args.validation_fraction)
        width, height, boxes = parse_boxes(annotation, image, counts)
        if not boxes:
            counts["rejected_images_without_boxes"] += 1
            continue
        if len(boxes) > 50:
            counts["images_over_50_people"] += 1
        add_external_image(
            image,
            output,
            split,
            "classroom",
            width,
            height,
            boxes,
            manifest,
            counts,
        )

    with (output / "manifest.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(manifest[0]))
        writer.writeheader()
        writer.writerows(manifest)

    base_test_digest = split_digest(base / "test")
    output_test_digest = split_digest(output / "test")
    if output_test_digest != base_test_digest:
        raise RuntimeError("Locked CCTV test split changed during preparation")

    report = {
        "output": str(output),
        "base": str(base),
        "classroom": str(classroom),
        "counts": dict(sorted(counts.items())),
        "sources": dict(Counter(str(row["source"]) for row in manifest)),
        "classroom_sequence_groups": dict(sorted(groups.items())),
        "locked_test": {
            "source": "base CCTV test only",
            "external_test_images": 0,
            "unchanged_from_base": True,
            "sha256": output_test_digest,
        },
        "annotation_policy": {
            "classroom_behaviour_classes": "merged into person",
            "exact_duplicate_images": "one copy retained",
            "invalid_coordinates": "clamped to image bounds",
            "unknown_classes": "excluded",
            "split_unit": "source sequence prefix",
        },
    }
    (output / "audit.json").write_text(
        json.dumps(report, indent=2), encoding="utf-8"
    )
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
