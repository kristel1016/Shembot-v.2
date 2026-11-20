# Milestone 4 test plan and execution record

The cases below are a fixed subset of the source-grouped, locked test split. They are run through the same `core_multiscale` method used by `evaluate.py`. A count passes only when the predicted count exactly equals the annotated count. TP/FP/FN is still reported because an equal count can contain incorrect boxes.

| ID | Input/condition | Classified condition | Hard | Expected | Actual | TP/FP/FN | Count |
| --- | --- | --- | --- | ---: | ---: | --- | --- |
| TC01 | Single-person indoor count | Standard indoor view | No | 1 | 1 | 0/1/1 | PASS |
| TC02 | Alternate single-person indoor view | Standard indoor view | No | 3 | 0 | 0/0/3 | FAIL |
| TC03 | Person touching the frame edge | Partial person at edge | Yes | 5 | 4 | 3/1/2 | FAIL |
| TC04 | Difficult cropped/edge view | Partial person at edge | Yes | 5 | 0 | 0/0/5 | FAIL |
| TC05 | Low-light indoor view | Low light | Yes | 5 | 5 | 1/4/4 | PASS |
| TC06 | Dark, cluttered room | Low light | Yes | 12 | 2 | 2/0/10 | FAIL |
| TC07 | Small or distant people | Small or distant people | Yes | 6 | 5 | 3/2/3 | FAIL |
| TC08 | Difficult small-person view | Small or distant people | Yes | 8 | 1 | 0/1/8 | FAIL |
| TC09 | Crowd with occlusion | Dense crowd / occlusion | Yes | 10 | 6 | 2/4/8 | FAIL |
| TC10 | Dense crowd stress case | Dense crowd / occlusion | Yes | 27 | 2 | 2/0/25 | FAIL |
| TC11 | Mid-range small-person case | Small or distant people | Yes | 5 | 2 | 2/0/3 | FAIL |
| TC12 | Mid-range crowd case | Dense crowd / occlusion | Yes | 12 | 2 | 1/1/11 | FAIL |

## Live demonstration order

1. Start `python src/gradio_app.py`; confirm the model loads once.
2. Upload TC01-TC12 in order and compare displayed count, boxes, confidence, and processing time.
3. Run the teacher's images without changing thresholds.
4. Run the reproducible evaluation command from `MILESTONE_4.md`.

Do not hide failed cases. They document the operating limits and motivate the remaining work.
