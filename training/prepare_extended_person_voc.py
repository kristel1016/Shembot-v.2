"""Extend the leakage-safe person dataset with audited COCO/Open Images data.

The existing combined dataset supplies the deployment-oriented CCTV examples,
hard negatives, and the locked CCTV-only test split. External datasets are
added only to train/validation. Ambiguous crowd/group/depiction annotations are
excluded because one region must correspond to one countable person.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path
from typing import Iterable, Iterator

from PIL import Image


IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".bmp"}
PERSON_OPEN_IMAGES_ID = "/m/01g317"


def parse_args() -> argparse.Namespace:
    workspace = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--base",
        type=Path,
        default=workspace / "training_data" / "cctv_hard_negatives_v1",
        help="CCTV plus verified hard negatives with the locked CCTV test split.",
    )
    parser.add_argument(
        "--coco",
        type=Path,
        default=(
            workspace
            / "training_data/source/deployment/coco_person/coco-2017/train"
        ),
        help="COCO directory containing data/ and labels.json.",
    )
    parser.add_argument(
        "--open-images",
        type=Path,
        default=(
            workspace
            / "training_data/source/deployment/openimages_person/open-images-v7/train"
        ),
        help="Open Images directory containing data/ and labels/detections.csv.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=workspace / "training_data" / "combined_person_v2",
    )
    parser.add_argument("--validation-fraction", type=float, default=0.15)
    return parser.parse_args()


def stable_split(source: str, image_id: str, fraction: float) -> str:
    value = int(
        hashlib.sha256(f"{source}:{image_id}".encode("utf-8")).hexdigest()[:8],
        16,
    )
    return "valid" if value / 0xFFFFFFFF < fraction else "train"


def unique_name(source: str, image: Path) -> str:
    safe = "".join(char if char.isalnum() else "_" for char in image.stem)
    digest = hashlib.sha1(f"{source}:{image}".encode("utf-8")).hexdigest()[:10]
    return f"{source}_{safe}_{digest}"


def link_or_copy(source: Path, destination: Path) -> None:
    """Use a same-volume hard link to avoid duplicating several GB of images."""
    try:
        os.link(source, destination)
    except OSError:
        shutil.copy2(source, destination)


def clamp_box(
    box: tuple[float, float, float, float], width: int, height: int
) -> tuple[int, int, int, int] | None:
    xmin, ymin, xmax, ymax = box
    left = max(0, min(width - 1, int(round(xmin))))
    top = max(0, min(height - 1, int(round(ymin))))
    right = max(left + 1, min(width, int(round(xmax))))
    bottom = max(top + 1, min(height, int(round(ymax))))
    if right <= left or bottom <= top:
        return None
    return left, top, right, bottom


def write_voc(
    destination: Path,
    image_name: str,
    width: int,
    height: int,
    depth: int,
    boxes: Iterable[tuple[int, int, int, int]],
) -> None:
    root = ET.Element("annotation")
    ET.SubElement(root, "folder").text = destination.parent.name
    ET.SubElement(root, "filename").text = image_name
    ET.SubElement(root, "path").text = image_name
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
        node = ET.SubElement(obj, "bndbox")
        for key, value in (
            ("xmin", xmin),
            ("ymin", ymin),
            ("xmax", xmax),
            ("ymax", ymax),
        ):
            ET.SubElement(node, key).text = str(value)
    ET.ElementTree(root).write(destination, encoding="utf-8", xml_declaration=False)


def find_image_for_stem(directory: Path, stem: str) -> Path:
    for suffix in IMAGE_SUFFIXES:
        candidate = directory / f"{stem}{suffix}"
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(f"No image for {directory / stem}")


def add_manifest_row(
    manifest: list[dict[str, object]],
    counts: Counter[str],
    split: str,
    source: str,
    source_image: Path,
    image_name: str,
    boxes: list[tuple[int, int, int, int]],
    width: int,
    height: int,
) -> None:
    counts[f"{split}_images"] += 1
    counts[f"{split}_boxes"] += len(boxes)
    counts[f"source_{source}_images"] += 1
    counts[f"source_{source}_boxes"] += len(boxes)
    for xmin, ymin, xmax, ymax in boxes:
        ratio = ((xmax - xmin) * (ymax - ymin)) / max(1, width * height)
        if ratio < 0.005:
            bucket = "tiny"
        elif ratio < 0.02:
            bucket = "small"
        elif ratio < 0.15:
            bucket = "medium"
        else:
            bucket = "large"
        counts[f"box_area_{bucket}"] += 1
    manifest.append(
        {
            "split": split,
            "source": source,
            "source_image": str(source_image),
            "image": image_name,
            "person_boxes": len(boxes),
        }
    )


def copy_base(
    base: Path,
    output: Path,
    manifest: list[dict[str, object]],
    counts: Counter[str],
) -> None:
    for split in ("train", "valid", "test"):
        source_dir = base / split
        for annotation in sorted(source_dir.glob("*.xml")):
            image = find_image_for_stem(source_dir, annotation.stem)
            link_or_copy(image, output / split / image.name)
            link_or_copy(annotation, output / split / annotation.name)
            root = ET.parse(annotation).getroot()
            width = int(float(root.findtext("size/width", "1")))
            height = int(float(root.findtext("size/height", "1")))
            boxes: list[tuple[int, int, int, int]] = []
            for obj in root.findall("object"):
                box = obj.find("bndbox")
                if box is None:
                    continue
                parsed = clamp_box(
                    tuple(
                        float(box.findtext(key, "0"))
                        for key in ("xmin", "ymin", "xmax", "ymax")
                    ),
                    width,
                    height,
                )
                if parsed is not None:
                    boxes.append(parsed)
            source = (
                "hard_negative"
                if not boxes and image.name.startswith("human_detection_negative")
                else "cctv_or_existing"
            )
            add_manifest_row(
                manifest, counts, split, source, image, image.name,
                boxes, width, height,
            )


def add_external_image(
    image: Path,
    output: Path,
    split: str,
    source: str,
    width: int,
    height: int,
    boxes: list[tuple[int, int, int, int]],
    manifest: list[dict[str, object]],
    counts: Counter[str],
) -> None:
    if not boxes:
        counts[f"source_{source}_images_without_usable_boxes"] += 1
        return
    stem = unique_name(source, image)
    destination_image = output / split / f"{stem}{image.suffix.lower()}"
    destination_xml = output / split / f"{stem}.xml"
    link_or_copy(image, destination_image)
    with Image.open(image) as decoded:
        depth = len(decoded.getbands())
    write_voc(
        destination_xml, destination_image.name, width, height, depth, boxes
    )
    add_manifest_row(
        manifest, counts, split, source, image, destination_image.name,
        boxes, width, height,
    )


def add_coco(
    root: Path,
    output: Path,
    validation_fraction: float,
    manifest: list[dict[str, object]],
    counts: Counter[str],
) -> None:
    payload = json.loads((root / "labels.json").read_text(encoding="utf-8"))
    person_ids = {
        int(category["id"])
        for category in payload["categories"]
        if str(category["name"]).lower() == "person"
    }
    images = {int(item["id"]): item for item in payload["images"]}
    boxes_by_image: dict[int, list[tuple[int, int, int, int]]] = defaultdict(list)
    for annotation in payload["annotations"]:
        if int(annotation["category_id"]) not in person_ids:
            counts["coco_non_person_boxes"] += 1
            continue
        if int(annotation.get("iscrowd", 0)):
            counts["coco_rejected_crowd_regions"] += 1
            continue
        image_info = images[int(annotation["image_id"])]
        x, y, width, height = (float(value) for value in annotation["bbox"])
        parsed = clamp_box(
            (x, y, x + width, y + height),
            int(image_info["width"]),
            int(image_info["height"]),
        )
        if parsed is None:
            counts["coco_rejected_invalid_boxes"] += 1
        elif parsed not in boxes_by_image[int(annotation["image_id"])]:
            boxes_by_image[int(annotation["image_id"])].append(parsed)
        else:
            counts["coco_rejected_exact_duplicates"] += 1

    for image_id, image_info in sorted(images.items()):
        image = root / "data" / str(image_info["file_name"])
        if not image.is_file():
            counts["coco_missing_images"] += 1
            continue
        split = stable_split("coco", str(image_id), validation_fraction)
        add_external_image(
            image, output, split, "coco", int(image_info["width"]),
            int(image_info["height"]), boxes_by_image[image_id], manifest, counts,
        )


def selected_open_images_rows(
    detections_csv: Path, image_ids: set[str]
) -> Iterator[dict[str, str]]:
    """Use ripgrep to avoid parsing the full 2.2 GB Open Images label file."""
    with detections_csv.open("r", encoding="utf-8", newline="") as handle:
        fieldnames = next(csv.reader(handle))

    pattern_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="ascii", suffix=".txt", delete=False
        ) as pattern_file:
            pattern_path = Path(pattern_file.name)
            for image_id in sorted(image_ids):
                pattern_file.write(f"^{image_id},\n")
        process = subprocess.Popen(
            ["rg", "--no-line-number", "-f", str(pattern_path), str(detections_csv)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
        )
        assert process.stdout is not None
        for row in csv.DictReader(process.stdout, fieldnames=fieldnames):
            yield row
        stderr = process.stderr.read() if process.stderr else ""
        code = process.wait()
        if code not in (0, 1):
            raise RuntimeError(f"rg failed while filtering Open Images: {stderr}")
    except FileNotFoundError:
        with detections_csv.open(
            "r", encoding="utf-8", newline="", buffering=4 * 1024 * 1024
        ) as handle:
            for row in csv.DictReader(handle):
                if row["ImageID"] in image_ids:
                    yield row
    finally:
        if pattern_path is not None:
            pattern_path.unlink(missing_ok=True)


def add_open_images(
    root: Path,
    output: Path,
    validation_fraction: float,
    manifest: list[dict[str, object]],
    counts: Counter[str],
) -> None:
    image_paths = {
        image.stem: image
        for image in (root / "data").iterdir()
        if image.suffix.lower() in IMAGE_SUFFIXES
    }
    sizes: dict[str, tuple[int, int]] = {}
    boxes_by_image: dict[str, list[tuple[int, int, int, int]]] = defaultdict(list)
    for image_id, image in image_paths.items():
        with Image.open(image) as decoded:
            sizes[image_id] = decoded.size

    for row in selected_open_images_rows(
        root / "labels" / "detections.csv", set(image_paths)
    ):
        image_id = row["ImageID"]
        if row["LabelName"] != PERSON_OPEN_IMAGES_ID:
            counts["open_images_non_person_boxes"] += 1
            continue
        if row.get("IsGroupOf", "0") == "1":
            counts["open_images_rejected_group_regions"] += 1
            continue
        if row.get("IsDepiction", "0") == "1":
            counts["open_images_rejected_depictions"] += 1
            continue
        width, height = sizes[image_id]
        parsed = clamp_box(
            (
                float(row["XMin"]) * width,
                float(row["YMin"]) * height,
                float(row["XMax"]) * width,
                float(row["YMax"]) * height,
            ),
            width,
            height,
        )
        if parsed is None:
            counts["open_images_rejected_invalid_boxes"] += 1
        elif parsed not in boxes_by_image[image_id]:
            boxes_by_image[image_id].append(parsed)
        else:
            counts["open_images_rejected_exact_duplicates"] += 1

    for image_id, image in sorted(image_paths.items()):
        width, height = sizes[image_id]
        split = stable_split("open_images", image_id, validation_fraction)
        add_external_image(
            image, output, split, "open_images", width, height,
            boxes_by_image[image_id], manifest, counts,
        )


def main() -> None:
    args = parse_args()
    if not 0 < args.validation_fraction < 0.5:
        raise SystemExit("--validation-fraction must be between 0 and 0.5")
    base = args.base.resolve()
    coco = args.coco.resolve()
    open_images = args.open_images.resolve()
    output = args.output.resolve()
    required = (
        base / "test",
        coco / "labels.json",
        open_images / "labels" / "detections.csv",
    )
    for path in required:
        if not path.exists():
            raise FileNotFoundError(path)
    if output.exists() and any(output.iterdir()):
        raise SystemExit(f"Output must be empty or absent: {output}")
    for split in ("train", "valid", "test"):
        (output / split).mkdir(parents=True, exist_ok=True)

    manifest: list[dict[str, object]] = []
    counts: Counter[str] = Counter()
    copy_base(base, output, manifest, counts)
    add_coco(coco, output, args.validation_fraction, manifest, counts)
    add_open_images(
        open_images, output, args.validation_fraction, manifest, counts
    )

    with (output / "manifest.csv").open(
        "w", newline="", encoding="utf-8"
    ) as handle:
        writer = csv.DictWriter(handle, fieldnames=list(manifest[0]))
        writer.writeheader()
        writer.writerows(manifest)

    report = {
        "output": str(output),
        "base": str(base),
        "external_sources": {
            "coco": str(coco),
            "open_images": str(open_images),
        },
        "counts": dict(sorted(counts.items())),
        "sources": dict(Counter(str(row["source"]) for row in manifest)),
        "locked_test": {
            "source": "base CCTV test only",
            "external_test_images": 0,
            "unchanged_from_base": True,
        },
        "annotation_policy": {
            "coco_crowd_regions": "excluded",
            "open_images_group_regions": "excluded",
            "open_images_depictions": "excluded",
            "invalid_boxes": "excluded",
            "exact_duplicate_boxes": "excluded",
            "occluded_and_truncated_people": "included",
        },
    }
    (output / "audit.json").write_text(
        json.dumps(report, indent=2), encoding="utf-8"
    )
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
