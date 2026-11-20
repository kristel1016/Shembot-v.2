# Locked Milestone 3 test split

This directory contains the 133-image, 53-source-group held-out split assigned
during Milestone 2. It contains 1,056 person boxes in Pascal VOC XML files.

- `images/` contains the raw 640×640 inputs.
- `annotations/` contains the matching Pascal VOC labels.
- `manifest.csv` records the source group, original split, locked split, and
  box count.

The source-group assignment happened before Milestone 3. Confidence `0.20` and
NMS `0.45` were selected on validation; the test set was not used for parameter
tuning. `tools/prepare_milestone3_test.py` reproduces this directory from the
original licensed archive and the Milestone 2 manifest.

The Roboflow export encodes its sole person class as `<name>0</name>`. The
evaluator intentionally accepts that label and the normalized label `person`.
