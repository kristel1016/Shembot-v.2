# Optional custom-model training

The website does not require this heavy training environment. These scripts are
included to make the completed data and model work reproducible.

Use Python 3.9:

```powershell
py -3.9 -m venv .venv-train
.\.venv-train\Scripts\Activate.ps1
python -m pip install -r training\requirements-train.txt
python training\prepare_voc.py --input path\to\exported_voc --output data\cctv_indoor_clean
python training\train_efficientdet_lite.py --dataset data\cctv_indoor_clean --epochs 30 --batch-size 4
```

The source preparation script groups augmented images before splitting and
repairs invalid box coordinates. The training script loads Pascal VOC pairs,
trains EfficientDet-Lite0, evaluates the locked test split, and exports a
metadata-bearing TFLite model.

## Extended audited dataset

After downloading the person-only COCO and Open Images subsets, build the
second candidate dataset without changing the locked CCTV test split:

```powershell
python training\prepare_extended_person_voc.py
```

This starts from `training_data/cctv_hard_negatives_v1` (so the previously
harmful Kaggle positives stay excluded), adds external images only to
train/validation, rejects COCO crowd regions and Open Images group/depiction
annotations, removes invalid/exact-duplicate boxes, and writes a source-level
audit to `training_data/combined_person_v2/audit.json`. Images are hard-linked
when possible so the prepared dataset does not duplicate several gigabytes.

Train this candidate in the Python 3.9 Model Maker environment:

```powershell
$env:MPLCONFIGDIR = "C:\Computer Vision\training_data\.matplotlib"
..\training_data\.venv-model-maker\Scripts\python.exe training\train_efficientdet_lite.py `
  --dataset ..\training_data\combined_person_v2 `
  --output ..\training_data\models\combined_person_efficientdet_lite0_v2 `
  --epochs 30 --batch-size 4
```

Do not replace the browser model until the locked-test precision, recall, and
AP improve over the measured CCTV baseline and the deployment failure gallery no
longer produces furniture/body-part duplicate detections.

The latest audited comparison is recorded in
[`EXPERIMENT_RESULTS.md`](EXPERIMENT_RESULTS.md). The custom CCTV epoch-23
detector beat the previously bundled generic browser model under the identical
MediaPipe evaluator and is now deployed. The later extended and hard-negative
candidates did not beat that custom CCTV baseline, so their generated TFLite
files remain undeployed.

For the next dataset revision, use **Save incorrect sample** in the live app.
It downloads a clean JPEG without rendered boxes and a same-named JSON file
containing the actual count and predicted boxes. Label the JPEG exhaustively;
do not treat the predicted boxes as ground truth. Group frames from the same
capture session before creating train/validation/test splits.

To reproduce metrics for the exact TFLite file loaded by the website, use a
separate environment so MediaPipe's dependencies do not alter Model Maker:

```powershell
py -3.9 -m venv ..\training_data\.venv-browser-eval
..\training_data\.venv-browser-eval\Scripts\python.exe -m pip install `
  -r training\requirements-browser-eval.txt
..\training_data\.venv-browser-eval\Scripts\python.exe `
  training\evaluate_browser_tflite.py
```

This reports detector-only metrics. The browser's pose verifier and temporal
tracking run after the detector and are not included in this offline score.

## Classroom dataset experiment

The downloaded classroom dataset is prepared with:

```powershell
python training\prepare_classroom_person_voc.py
```

The script audits and clamps bounding boxes, removes exact duplicate images,
groups related classroom frames before splitting, maps the nine source labels
to `person`, and preserves `cctv_indoor_clean_v2/test` byte-for-byte as the
locked test set. The resulting audit is written to
`training_data/classroom_person_v1/audit.json`.

Dense classroom frames contain more than 100 source boxes, so this experiment
uses a larger instance cap:

```powershell
$env:MPLCONFIGDIR = "C:\Computer Vision\training_data\.matplotlib"
..\training_data\.venv-model-maker\Scripts\python.exe training\train_efficientdet_lite.py `
  --dataset ..\training_data\classroom_person_v1 `
  --output ..\training_data\models\classroom_person_efficientdet_lite0_v1 `
  --epochs 5 --batch-size 4 --max-instances-per-image 256 `
  --load-checkpoint ..\training_data\models\cctv_person_efficientdet_lite0\checkpoints\ckpt-23 `
  --continue-training --train-whole-model --learning-rate 0.001
```

This candidate was rejected. On the unchanged CCTV test set it produced 1.01%
AP and 5.57% AP50; its best browser-runtime F1 was 13.57%. The classroom
behavior annotations contain overlapping boxes and do not match the
one-box-per-person deployment target. The current CCTV epoch-23 browser model
therefore remains the promoted model.

