"""Build a leakage-safe combined Pascal VOC person-detection dataset.

The final test split is copied only from the original CCTV dataset. Kaggle
person boxes are added to train/validation, while verified class-0 images from
the binary Human Detection dataset are added as empty-scene hard negatives.
The pedestrian-video archive is deliberately audited but not added: its CSVs
track only one target and are not exhaustive annotations for every person.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import shutil
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

from PIL import Image


IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cctv", required=True, type=Path)
    parser.add_argument("--kaggle-voc", required=True, type=Path)
    parser.add_argument("--hard-negatives", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument(
        "--skip-kaggle-positives",
        action="store_true",
        help="Use only the verified Kaggle hard negatives with CCTV positives.",
    )
    return parser.parse_args()


def stable_validation(name: str, fraction: float = 0.15) -> bool:
    bucket = int(hashlib.sha256(name.encode("utf-8")).hexdigest()[:8], 16)
    return bucket / 0xFFFFFFFF < fraction


def unique_name(source: str, path: Path) -> str:
    safe = "".join(character if character.isalnum() else "_" for character in path.stem)
    digest = hashlib.sha1(str(path).encode("utf-8")).hexdigest()[:10]
    return f"{source}_{safe}_{digest}"


def write_voc(
    destination: Path,
    image_name: str,
    width: int,
    height: int,
    depth: int,
    boxes: list[tuple[int, int, int, int]],
) -> None:
    root = ET.Element("annotation")
    ET.SubElement(root, "folder").text = destination.parent.name
    ET.SubElement(root, "filename").text = image_name
    size = ET.SubElement(root, "size")
    ET.SubElement(size, "width").text = str(width)
    ET.SubElement(size, "height").text = str(height)
    ET.SubElement(size, "depth").text = str(depth)
    ET.SubElement(root, "segmented").text = "0"
    for xmin, ymin, xmax, ymax in boxes:
        obj = ET.SubElement(root, "object")
        ET.SubElement(obj, "name").text = "person"
        ET.SubElement(obj, "pose").text = "Unspecified"
        ET.SubElement(obj, "truncated").text = "0"
        ET.SubElement(obj, "difficult").text = "0"
        box = ET.SubElement(obj, "bndbox")
        ET.SubElement(box, "xmin").text = str(xmin)
        ET.SubElement(box, "ymin").text = str(ymin)
        ET.SubElement(box, "xmax").text = str(xmax)
        ET.SubElement(box, "ymax").text = str(ymax)
    ET.ElementTree(root).write(destination, encoding="utf-8", xml_declaration=False)


def parse_person_voc(
    xml_path: Path, image_path: Path
) -> tuple[int, int, int, list[tuple[int, int, int, int]], int]:
    root = ET.parse(xml_path).getroot()
    size = root.find("size")
    if size is None:
        raise ValueError(f"Missing image size: {xml_path}")
    width = int(size.findtext("width", "0"))
    height = int(size.findtext("height", "0"))
    depth = int(size.findtext("depth", "3"))
    if width <= 0 or height <= 0:
        with Image.open(image_path) as decoded:
            width, height = decoded.size
            depth = len(decoded.getbands())
    boxes: list[tuple[int, int, int, int]] = []
    rejected = 0
    for obj in root.findall("object"):
        if obj.findtext("name", "").strip().lower() != "person":
            rejected += 1
            continue
        box = obj.find("bndbox")
        if box is None:
            rejected += 1
            continue
        xmin = max(0, min(width - 1, int(float(box.findtext("xmin", "0")))))
        ymin = max(0, min(height - 1, int(float(box.findtext("ymin", "0")))))
        xmax = max(xmin + 1, min(width, int(float(box.findtext("xmax", "0")))))
        ymax = max(ymin + 1, min(height, int(float(box.findtext("ymax", "0")))))
        if xmax <= xmin or ymax <= ymin:
            rejected += 1
            continue
        boxes.append((xmin, ymin, xmax, ymax))
    return width, height, depth, boxes, rejected


def copy_pair(
    image: Path,
    annotation: Path,
    output: Path,
    split: str,
    source: str,
    manifest: list[dict[str, object]],
    counts: Counter[str],
) -> None:
    width, height, depth, boxes, rejected = parse_person_voc(annotation, image)
    stem = unique_name(source, image)
    destination_image = output / split / f"{stem}{image.suffix.lower()}"
    destination_xml = output / split / f"{stem}.xml"
    shutil.copy2(image, destination_image)
    write_voc(destination_xml, destination_image.name, width, height, depth, boxes)
    counts[f"{split}_images"] += 1
    counts[f"{split}_boxes"] += len(boxes)
    counts["rejected_boxes"] += rejected
    manifest.append(
        {
            "split": split,
            "source": source,
            "source_image": str(image),
            "image": destination_image.name,
            "person_boxes": len(boxes),
        }
    )


def find_image(annotation: Path, image_dir: Path) -> Path:
    for suffix in IMAGE_SUFFIXES:
        candidate = image_dir / f"{annotation.stem}{suffix}"
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(f"No image for annotation: {annotation}")


def add_hard_negative(
    image: Path,
    output: Path,
    split: str,
    manifest: list[dict[str, object]],
    counts: Counter[str],
) -> None:
    try:
        with Image.open(image) as decoded:
            converted = decoded.convert("RGB")
            width, height = converted.size
            depth = 3
    except (OSError, ValueError):
        counts["unreadable_negatives"] += 1
        return
    stem = unique_name("human_detection_negative", image)
    destination_image = output / split / f"{stem}.jpg"
    destination_xml = output / split / f"{stem}.xml"
    converted.save(destination_image, format="JPEG", quality=94, optimize=True)
    write_voc(destination_xml, destination_image.name, width, height, depth, [])
    counts[f"{split}_images"] += 1
    counts[f"{split}_hard_negatives"] += 1
    manifest.append(
        {
            "split": split,
            "source": "human_detection_negative",
            "source_image": str(image),
            "image": destination_image.name,
            "person_boxes": 0,
        }
    )


def main() -> None:
    args = parse_args()
    output = args.output.resolve()
    if output.exists() and any(output.iterdir()):
        raise SystemExit(f"Output must be empty or absent: {output}")
    for split in ("train", "valid", "test"):
        (output / split).mkdir(parents=True, exist_ok=True)

    manifest: list[dict[str, object]] = []
    counts: Counter[str] = Counter()

    # Preserve the source-grouped CCTV split exactly, especially its locked test set.
    for split in ("train", "valid", "test"):
        source_dir = args.cctv.resolve() / split
        for annotation in sorted(source_dir.glob("*.xml")):
            copy_pair(
                find_image(annotation, source_dir), annotation, output, split,
                "cctv_indoor", manifest, counts,
            )

    if not args.skip_kaggle_positives:
        # The Kaggle archive's Test directory is training data here; only CCTV test is final.
        kaggle_layout = {
            "Train/Train": "train",
            "Test/Test": "train",
            "Val/Val": "valid",
        }
        for relative, split in kaggle_layout.items():
            source_dir = args.kaggle_voc.resolve() / relative
            annotation_dir = source_dir / "Annotations"
            image_dir = source_dir / "JPEGImages"
            for annotation in sorted(annotation_dir.glob("*.xml")):
                copy_pair(
                    find_image(annotation, image_dir), annotation, output, split,
                    "kaggle_pascal_person", manifest, counts,
                )

    # Class 0 was manually spot-checked as no-person imagery. Empty annotations teach
    # the model not to fire on furniture, vehicles, shelves, shadows, and scenery.
    for image in sorted(args.hard_negatives.resolve().iterdir()):
        if image.suffix.lower() not in IMAGE_SUFFIXES:
            continue
        split = "valid" if stable_validation(image.name) else "train"
        add_hard_negative(image, output, split, manifest, counts)

    with (output / "manifest.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(manifest[0]))
        writer.writeheader()
        writer.writerows(manifest)

    report = {
        "output": str(output),
        "counts": dict(sorted(counts.items())),
        "sources": dict(Counter(str(row["source"]) for row in manifest)),
        "locked_test_source": "cctv_indoor only",
        "excluded": {
            "human_detection_class_1": "classification images have no bounding boxes",
            "pedestrian_videos": "CSV tracks one target and is not exhaustive for all people",
            "kaggle_pascal_person": (
                "disabled for the hard-negative ablation"
                if args.skip_kaggle_positives else "included"
            ),
        },
    }
    (output / "audit.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
