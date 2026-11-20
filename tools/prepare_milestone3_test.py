"""Extract the locked source-grouped test split from the original VOC archive.

The split assignment was produced during Milestone 2 and is read from the
committed manifest. This script does not create or tune a split; it only
materializes the rows whose split is already ``test``.
"""

from __future__ import annotations

import argparse
import csv
import shutil
import zipfile
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("data/test"))
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not args.archive.is_file():
        raise FileNotFoundError(args.archive)
    if not args.manifest.is_file():
        raise FileNotFoundError(args.manifest)

    with args.manifest.open(newline="", encoding="utf-8-sig") as handle:
        rows = [row for row in csv.DictReader(handle) if row["split"] == "test"]
    if not rows:
        raise ValueError("Manifest contains no test rows")

    image_dir = args.output / "images"
    annotation_dir = args.output / "annotations"
    image_dir.mkdir(parents=True, exist_ok=True)
    annotation_dir.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(args.archive) as archive:
        members = {Path(name).name: name for name in archive.namelist()}
        for row in rows:
            image_name = row["image"]
            annotation_name = f"{Path(image_name).stem}.xml"
            for name, destination in (
                (image_name, image_dir / image_name),
                (annotation_name, annotation_dir / annotation_name),
            ):
                member = members.get(name)
                if member is None:
                    raise FileNotFoundError(f"{name} is not present in {args.archive}")
                with archive.open(member) as source, destination.open("wb") as target:
                    shutil.copyfileobj(source, target)

    output_manifest = args.output / "manifest.csv"
    with output_manifest.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)

    source_groups = {row["source_id"] for row in rows}
    print(
        f"Extracted {len(rows)} images from {len(source_groups)} locked source groups "
        f"to {args.output}"
    )


if __name__ == "__main__":
    main()
