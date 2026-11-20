# Milestone 3 evaluation results

Locked source-grouped test split; the settings were selected before this test run.

| Method | Precision | Recall | F1 | AP50 | mAP50–95 | Count MAE | ms/image | FPS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline_single_scale | 0.5984 | 0.0720 | 0.1285 | 0.0619 | 0.0283 | 7.0000 | 161.35 | 6.20 |
| core_multiscale | 0.5308 | 0.1468 | 0.2300 | 0.1166 | 0.0473 | 5.8346 | 821.26 | 1.22 |

## Failure causes

- Viewpoint and scale / small people: 55 of 133 gallery cases
- Occlusion and clutter: 36 of 133 gallery cases
- Missed detection / low confidence: 15 of 133 gallery cases
- Lighting / low light: 13 of 133 gallery cases
- Viewpoint / partial person at frame edge: 11 of 133 gallery cases
- Look-alike background false positive: 3 of 133 gallery cases

Blue boxes are ground truth and green boxes are predictions in `failures/`.
The detector is restricted to the COCO `person` class.
