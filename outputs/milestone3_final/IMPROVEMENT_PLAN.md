# Improvement plan tied to observed failures

| Failure cause | Gallery count | Next change | How it will be measured |
| --- | ---: | --- | --- |
| Viewpoint and scale / small people | 55 | Retain overlapping tiles, add a third center crop, and measure small-person recall separately. | Compare cause-specific false positives, false negatives, recall, and count MAE on the same locked test set. |
| Occlusion and clutter | 36 | Collect more crowded local scenes and evaluate a crowd-focused detector or higher-resolution input. | Compare cause-specific false positives, false negatives, recall, and count MAE on the same locked test set. |
| Missed detection / low confidence | 15 | Tune confidence on validation only and add locally captured examples matching the deployment camera. | Compare cause-specific false positives, false negatives, recall, and count MAE on the same locked test set. |
| Lighting / low light | 13 | Collect phone-camera night scenes; add brightness/contrast augmentation and test CLAHE as an optional preprocessing branch. | Compare cause-specific false positives, false negatives, recall, and count MAE on the same locked test set. |
| Viewpoint / partial person at frame edge | 11 | Train with cutout/crop augmentation and relax edge-box geometry only when temporal persistence confirms it. | Compare cause-specific false positives, false negatives, recall, and count MAE on the same locked test set. |
| Look-alike background false positive | 3 | Require pose or multi-frame persistence and add hard-negative images containing person-like objects. | Compare cause-specific false positives, false negatives, recall, and count MAE on the same locked test set. |

The largest category is the first priority. New parameter selection will use the validation split; the locked test split will only be rerun after the next version is fixed.
