# Milestone 3 evaluation results

Locked source-grouped test split; the settings were selected before this test run.

| Method | Precision | Recall | F1 | AP50 | mAP50–95 | Count MAE | ms/image | FPS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline_single_scale | 0.7600 | 0.0360 | 0.0687 | 0.0353 | 0.0184 | 7.5789 | 141.28 | 7.08 |
| core_multiscale | 0.6731 | 0.0994 | 0.1733 | 0.0849 | 0.0357 | 6.7970 | 738.54 | 1.35 |

## Failure causes

- Viewpoint and scale / small people: 55 of 133 gallery cases
- Occlusion and clutter: 36 of 133 gallery cases
- Missed detection / low confidence: 16 of 133 gallery cases
- Lighting / low light: 13 of 133 gallery cases
- Viewpoint / partial person at frame edge: 11 of 133 gallery cases
- Look-alike background false positive: 2 of 133 gallery cases

Blue boxes are ground truth and green boxes are predictions in `failures/`.
The detector is restricted to the COCO `person` class.
