# Person detector experiment results

## Browser deployment comparison

The following figures use the exact TFLite model and MediaPipe inference path
used by the website. Both models were evaluated on the same locked 133-image
test split containing 1,056 annotated people. The operating point is the
website's `0.26` confidence threshold.

| Browser model | Precision | Recall | F1 | Count MAE | AP50 | mAP50-95 | CPU FPS | Decision |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Previous generic bundled model | 38.84% | 15.81% | 22.48% | 5.01 | 15.46% | 5.00% | 13.91 | Replace |
| Custom CCTV model, epoch 23 | 40.89% | 28.69% | 33.72% | 4.20 | 24.49% | 8.18% | 31.68 | Promoted to website |

The promoted detector raises AP50 by 9.03 percentage points, F1 by 11.25
points, and recall by 12.88 points while more than doubling measured CPU
inference speed. These are detector-only results; the website's pose verifier,
duplicate suppression, and temporal confirmation run after detection and are
not included in this table.

## Training experiments

All candidate metrics below use the unchanged 133-image CCTV test split. A
candidate must beat the current AP50 baseline and pass the deployment failure
gallery before its TFLite file can replace the browser model.

| Candidate | Training data | AP | AP50 | Decision |
| --- | --- | ---: | ---: | --- |
| CCTV baseline, epoch 23 | CCTV positives | 9.58% | 28.86% | Promoted after browser-runtime test |
| Extended v2, epoch 10 | CCTV + hard negatives + COCO + Open Images | 6.68% | 20.56% | Reject |
| Extended v2, validation-selected epoch 9 | Same as above | 5.93% | 18.69% | Reject |
| Hard-negative v2, epoch 10 | CCTV + 362 hard negatives | 6.09% | 21.94% | Reject |
| Hard-negative v2, epoch 15 | CCTV + 362 hard negatives | 8.11% | 26.28% | Reject; closest candidate |
| Classroom-person v1, epoch 5 | CCTV + 2,586 classroom images | 1.01% | 5.57% | Reject; annotation/domain mismatch |

The broad external datasets reduced performance because their viewpoints and
annotation style differ from the deployment cameras. Hard negatives recovered
most of that loss, but the locked-test result still did not clear the baseline.
The classroom dataset performed worse because it was originally annotated for
nine classroom-behavior classes, often with many overlapping boxes around the
same student. Mapping every behavior box to `person` did not create the
full-body, one-box-per-person annotation style needed by the deployment model.
Its exact browser-runtime evaluation reached only 13.89% precision, 13.26%
recall, and 13.57% F1 at its best tested threshold (`0.18`), so it was not
deployed.

The next training dataset should therefore prioritize exhaustively annotated
frames from the actual phone/laptop deployment scenes, especially low light,
partial bodies, bedding, furniture, posters, screens, and person-shaped
objects. Keep near-duplicate video frames in one source group when splitting.

Generated model directories live outside the repository under
`training_data/models/`. The promoted epoch-23 model is copied to
`lib/mediapipe/models/efficientdet_lite0.tflite`. Do not promote another
candidate unless it passes both the metric and failure-gallery gates.
